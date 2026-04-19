from __future__ import annotations

from dataclasses import dataclass, field
from collections import deque
from enum import Enum
from statistics import mean, pstdev
import math
import random
import time
from typing import Callable, Deque, Dict, Iterable, List, Optional, Sequence, Tuple


Vector = List[float]


def v_add(a: Sequence[float], b: Sequence[float]) -> Vector:
    return [x + y for x, y in zip(a, b)]


def v_sub(a: Sequence[float], b: Sequence[float]) -> Vector:
    return [x - y for x, y in zip(a, b)]


def v_mul(a: Sequence[float], scalar: float) -> Vector:
    return [x * scalar for x in a]


def v_div(a: Sequence[float], scalar: float) -> Vector:
    if scalar == 0:
        return [0.0 for _ in a]
    return [x / scalar for x in a]


def v_abs(a: Sequence[float]) -> Vector:
    return [abs(x) for x in a]


def v_clip(a: Sequence[float], low: float, high: float) -> Vector:
    return [min(high, max(low, x)) for x in a]


def v_l2(a: Sequence[float]) -> float:
    return math.sqrt(sum(x * x for x in a))


def v_mean(a: Sequence[float]) -> float:
    return sum(a) / len(a) if a else 0.0


def v_cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    denom = v_l2(a) * v_l2(b)
    if denom == 0:
        return 1.0
    return sum(x * y for x, y in zip(a, b)) / denom


def v_distance(a: Sequence[float], b: Sequence[float]) -> float:
    return v_l2(v_sub(a, b))


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


class ResolutionPath(str, Enum):
    SHALLOW = "shallow"
    DEEP = "deep"


@dataclass
class RuntimeConfig:
    dimension: int = 8
    control_limit: float = 1.0
    action_limit: float = 2.0
    correction_limit: float = 1.5
    state_limit: float = 20.0
    ema_alpha: float = 0.35
    recovery_gain: float = 1.4
    anomaly_floor: float = 0.025
    deep_arbitration_threshold: float = 0.18
    shallow_resolution_threshold: float = 0.08
    jitter_dampening_threshold: float = 0.05
    rare_frequency_threshold: float = 0.05
    high_impact_threshold: float = 0.05
    contextual_shift_threshold: float = 0.30
    phase_drift_limit_ms: float = 3.0
    sync_jitter_limit_ms: float = 1.5
    invariant_penalty_weight: float = 10.0
    max_variance_cache: int = 64
    rolling_window: int = 64
    nominal_cycle_ms: float = 10.0
    lambda_impact: float = 0.75


@dataclass
class StructuralInvariantReport:
    ok: bool
    violations: List[str] = field(default_factory=list)
    penalty: float = 0.0


class StructuralInvariantEngine:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config
        self.custom_invariants: List[Callable[[Sequence[float], Sequence[float]], Optional[str]]] = []

    def register(self, fn: Callable[[Sequence[float], Sequence[float]], Optional[str]]) -> None:
        self.custom_invariants.append(fn)

    def validate(self, state: Sequence[float], action: Sequence[float]) -> StructuralInvariantReport:
        violations: List[str] = []
        penalty = 0.0

        if len(state) != self.config.dimension:
            violations.append("state_dimension_mismatch")
            penalty += 1.0
        if len(action) != self.config.dimension:
            violations.append("action_dimension_mismatch")
            penalty += 1.0

        if any(abs(x) > self.config.state_limit for x in state):
            violations.append("state_limit_exceeded")
            penalty += 1.0
        if any(abs(x) > self.config.action_limit for x in action):
            violations.append("action_limit_exceeded")
            penalty += 1.0

        energy = v_l2(state) + v_l2(action)
        if energy > (self.config.state_limit + self.config.action_limit):
            violations.append("combined_energy_exceeded")
            penalty += 1.0

        for fn in self.custom_invariants:
            reason = fn(state, action)
            if reason:
                violations.append(reason)
                penalty += 1.0

        return StructuralInvariantReport(
            ok=not violations,
            violations=violations,
            penalty=penalty * self.config.invariant_penalty_weight,
        )


@dataclass
class FeedbackPacket:
    action: Vector
    predicted_outcome: Vector
    actual_outcome: Vector
    env_delta: Vector
    raw_correction: Vector


class ExecutionFeedbackIntegrationLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config

    def process(self, action: Sequence[float], predicted_outcome: Sequence[float], actual_outcome: Sequence[float]) -> FeedbackPacket:
        env_delta = v_sub(actual_outcome, predicted_outcome)
        raw_correction = v_clip(env_delta, -self.config.correction_limit, self.config.correction_limit)
        return FeedbackPacket(
            action=list(action),
            predicted_outcome=list(predicted_outcome),
            actual_outcome=list(actual_outcome),
            env_delta=env_delta,
            raw_correction=raw_correction,
        )


class FeedbackDampeningLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config
        self.previous: Optional[Vector] = None

    def process(self, correction: Sequence[float]) -> Vector:
        if self.previous is None:
            self.previous = list(correction)
            return list(correction)

        alpha = self.config.ema_alpha
        damped = [alpha * c + (1 - alpha) * p for c, p in zip(correction, self.previous)]
        self.previous = damped
        if v_l2(damped) < self.config.jitter_dampening_threshold * self.config.correction_limit:
            return [0.0 for _ in damped]
        return damped


class SignalRecoveryLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config

    def process(self, damped: Sequence[float], raw: Sequence[float]) -> Vector:
        recovered: Vector = []
        for d, r in zip(damped, raw):
            if abs(r) >= self.config.anomaly_floor and abs(d) < abs(r):
                recovered.append(d + (r - d) * self.config.recovery_gain)
            else:
                recovered.append(d)
        return v_clip(recovered, -self.config.correction_limit, self.config.correction_limit)


@dataclass
class CandidateTrajectory:
    name: str
    vector: Vector
    score: float
    invariant_report: StructuralInvariantReport


class SignalArbitrationLayer:
    def __init__(self, config: RuntimeConfig, invariants: StructuralInvariantEngine) -> None:
        self.config = config
        self.invariants = invariants

    def signal_conflict_index(self, candidates: Sequence[Sequence[float]], global_prediction: Sequence[float]) -> float:
        if not candidates:
            return 0.0
        distances = [v_distance(candidate, global_prediction) for candidate in candidates]
        norm = self.config.action_limit * math.sqrt(self.config.dimension)
        return clamp(sum(distances) / len(distances) / max(norm, 1e-6), 0.0, 1.0)

    def impact_projection_score(self, constraint_consistency_delta: float, dt_ms: float) -> float:
        if dt_ms <= 0:
            return 0.0
        return clamp(self.config.lambda_impact * abs(constraint_consistency_delta) / dt_ms, 0.0, 1.0)

    def build_candidates(self, state: Sequence[float], base_action: Sequence[float], signal: Sequence[float]) -> List[CandidateTrajectory]:
        blended = v_clip(v_add(base_action, signal), -self.config.action_limit, self.config.action_limit)
        damped = v_clip(v_add(base_action, v_mul(signal, 0.5)), -self.config.action_limit, self.config.action_limit)
        conservative = v_clip(v_mul(base_action, 0.8), -self.config.action_limit, self.config.action_limit)

        candidates: List[CandidateTrajectory] = []
        for name, action in [
            ("blended", blended),
            ("damped", damped),
            ("conservative", conservative),
        ]:
            next_state = v_add(state, action)
            report = self.invariants.validate(next_state, action)
            score = -v_l2(signal) - report.penalty
            candidates.append(CandidateTrajectory(name=name, vector=action, score=score, invariant_report=report))
        return candidates

    def resolve(self, state: Sequence[float], base_action: Sequence[float], signal: Sequence[float]) -> Tuple[ResolutionPath, CandidateTrajectory, float, float]:
        candidates = self.build_candidates(state, base_action, signal)
        sci = self.signal_conflict_index([c.vector for c in candidates], base_action)
        best = max(candidates, key=lambda c: c.score)

        current_report = self.invariants.validate(v_add(state, base_action), base_action)
        best_report = best.invariant_report
        normalized_signal_energy = clamp(v_l2(signal) / max(1e-6, self.config.correction_limit * math.sqrt(self.config.dimension)), 0.0, 1.0)
        normalized_penalty_delta = clamp(abs(best_report.penalty - current_report.penalty) / max(1.0, self.config.invariant_penalty_weight), 0.0, 1.0)
        delta_cc = 0.7 * normalized_signal_energy + 0.3 * normalized_penalty_delta
        ips = self.impact_projection_score(delta_cc, self.config.nominal_cycle_ms)

        path = ResolutionPath.DEEP if sci > self.config.deep_arbitration_threshold or ips >= self.config.shallow_resolution_threshold else ResolutionPath.SHALLOW
        return path, best, sci, ips


class ResolutionAccelerationLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config

    def resolve(self, base_action: Sequence[float], signal: Sequence[float]) -> Vector:
        fast_path = v_add(v_mul(base_action, 0.85), v_mul(signal, 0.35))
        return v_clip(fast_path, -self.config.action_limit, self.config.action_limit)


class AdaptiveThresholdLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config
        self.history: Deque[float] = deque(maxlen=config.rolling_window)
        self.current_threshold: float = config.shallow_resolution_threshold

    def update(self, signal: Sequence[float], sci: float) -> float:
        magnitude = v_l2(signal)
        self.history.append(magnitude + sci)
        mu = mean(self.history) if self.history else 0.0
        sigma = pstdev(self.history) if len(self.history) > 1 else 0.0
        self.current_threshold = clamp(mu + 0.5 * sigma, 0.03, 0.25)
        return self.current_threshold


class MetaSelectionLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config

    def select(self, ips: float, sci: float, dynamic_threshold: float) -> ResolutionPath:
        if sci > self.config.deep_arbitration_threshold:
            return ResolutionPath.DEEP
        if ips >= dynamic_threshold:
            return ResolutionPath.DEEP
        return ResolutionPath.SHALLOW


@dataclass
class DormantSignal:
    vector: Vector
    frequency: float
    projected_impact: float
    timestamp: float


class VariancePreservationLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config
        self.cache: Deque[DormantSignal] = deque(maxlen=config.max_variance_cache)
        self.observed = 0
        self.seen_signatures: Dict[Tuple[int, ...], int] = {}

    def _signature(self, signal: Sequence[float]) -> Tuple[int, ...]:
        return tuple(int(round(x * 100)) for x in signal)

    def maybe_store(self, signal: Sequence[float], projected_impact: float) -> Optional[DormantSignal]:
        self.observed += 1
        sig = self._signature(signal)
        self.seen_signatures[sig] = self.seen_signatures.get(sig, 0) + 1
        frequency = self.seen_signatures[sig] / max(1, self.observed)

        should_store = frequency <= self.config.rare_frequency_threshold and projected_impact >= self.config.high_impact_threshold
        if not should_store:
            return None

        item = DormantSignal(vector=list(signal), frequency=frequency, projected_impact=projected_impact, timestamp=time.time())
        self.cache.append(item)
        return item

    def diversity_score(self) -> float:
        if not self.cache:
            return 0.0
        unique = {self._signature(item.vector) for item in self.cache}
        return len(unique) / len(self.cache)


class VarianceReintegrationLayer:
    def __init__(self, config: RuntimeConfig, preservation: VariancePreservationLayer) -> None:
        self.config = config
        self.preservation = preservation
        self.previous_context: Optional[Vector] = None

    def contextual_shift_metric(self, context: Sequence[float]) -> float:
        if self.previous_context is None:
            self.previous_context = list(context)
            return 0.0
        similarity = v_cosine_similarity(self.previous_context, context)
        csm = 1.0 - similarity
        self.previous_context = list(context)
        return csm

    def reintegrate(self, context: Sequence[float], csm: Optional[float] = None) -> Vector:
        if csm is None:
            csm = self.contextual_shift_metric(context)
        if csm < self.config.contextual_shift_threshold or not self.preservation.cache:
            return [0.0 for _ in range(self.config.dimension)]
        weighted = [0.0 for _ in range(self.config.dimension)]
        total_weight = 0.0
        for item in list(self.preservation.cache)[-8:]:
            weight = item.projected_impact * (1.0 - item.frequency)
            total_weight += weight
            weighted = v_add(weighted, v_mul(item.vector, weight))
        if total_weight == 0:
            return [0.0 for _ in range(self.config.dimension)]
        return v_clip(v_div(weighted, total_weight), -self.config.correction_limit, self.config.correction_limit)


class PhaseAlignmentLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config
        self.last_cycle_time = time.perf_counter()

    def synchronize(self) -> float:
        now = time.perf_counter()
        elapsed_ms = (now - self.last_cycle_time) * 1000.0
        self.last_cycle_time = now
        drift_ms = elapsed_ms - self.config.nominal_cycle_ms
        return clamp(drift_ms, -self.config.phase_drift_limit_ms, self.config.phase_drift_limit_ms)


class DynamicPhaseModulationLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config

    def modulate(self, drift_ms: float, local_latency_ms: float) -> float:
        correction = 0.25 * drift_ms + 0.1 * local_latency_ms
        return clamp(correction, -self.config.sync_jitter_limit_ms, self.config.sync_jitter_limit_ms)


class StabilityModulationLayer:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config
        self.previous: float = 0.0

    def stabilize(self, modulation_ms: float) -> float:
        stabilized = 0.6 * modulation_ms + 0.4 * self.previous
        self.previous = stabilized
        return clamp(stabilized, -self.config.sync_jitter_limit_ms, self.config.sync_jitter_limit_ms)


@dataclass
class RuntimeSnapshot:
    cycle: int
    state: Vector
    predicted_outcome: Vector
    actual_outcome: Vector
    raw_correction: Vector
    damped_correction: Vector
    recovered_signal: Vector
    reintegrated_signal: Vector
    selected_action: Vector
    resolution_path: str
    sci: float
    ips: float
    dynamic_threshold: float
    contextual_shift_metric: float
    variance_diversity: float
    phase_drift_ms: float
    modulation_ms: float
    stability_ms: float
    invariant_ok: bool
    invariant_violations: List[str]


class SimplePredictiveModel:
    def predict_action(self, state: Sequence[float], target: Sequence[float]) -> Vector:
        error = v_sub(target, state)
        return v_clip(v_mul(error, 0.25), -1.0, 1.0)

    def predict_outcome(self, state: Sequence[float], action: Sequence[float]) -> Vector:
        return v_add(state, action)


class SimulatedEnvironment:
    def __init__(self, dimension: int, noise: float = 0.03) -> None:
        self.dimension = dimension
        self.noise = noise
        self.bias = [random.uniform(-0.05, 0.05) for _ in range(dimension)]

    def step(self, state: Sequence[float], action: Sequence[float], context_scale: float = 1.0) -> Vector:
        actual = []
        for idx, (s, a) in enumerate(zip(state, action)):
            disturbance = math.sin((idx + 1) * 0.15 + s * 0.05) * 0.02 * context_scale
            noisy = s + a + self.bias[idx] + disturbance + random.uniform(-self.noise, self.noise)
            actual.append(noisy)
        return actual


class AutopoieticRuntime:
    def __init__(self, config: Optional[RuntimeConfig] = None) -> None:
        self.config = config or RuntimeConfig()
        self.invariants = StructuralInvariantEngine(self.config)
        self.model = SimplePredictiveModel()
        self.efl = ExecutionFeedbackIntegrationLayer(self.config)
        self.fdl = FeedbackDampeningLayer(self.config)
        self.srl = SignalRecoveryLayer(self.config)
        self.sal = SignalArbitrationLayer(self.config, self.invariants)
        self.ral = ResolutionAccelerationLayer(self.config)
        self.atl = AdaptiveThresholdLayer(self.config)
        self.msl = MetaSelectionLayer(self.config)
        self.vpl = VariancePreservationLayer(self.config)
        self.vrl = VarianceReintegrationLayer(self.config, self.vpl)
        self.pal = PhaseAlignmentLayer(self.config)
        self.dpm = DynamicPhaseModulationLayer(self.config)
        self.sml = StabilityModulationLayer(self.config)
        self.state: Vector = [0.0 for _ in range(self.config.dimension)]
        self.target: Vector = [0.5 if i % 2 == 0 else -0.5 for i in range(self.config.dimension)]
        self.cycle_count = 0

        self.invariants.register(self._rate_of_change_invariant)

    def _rate_of_change_invariant(self, state: Sequence[float], action: Sequence[float]) -> Optional[str]:
        if v_l2(action) > self.config.dimension * 0.9:
            return "aggregate_action_rate_exceeded"
        return None

    def update_target(self, target: Sequence[float]) -> None:
        self.target = list(target)

    def cycle(self, env: SimulatedEnvironment, context: Sequence[float]) -> RuntimeSnapshot:
        self.cycle_count += 1

        base_action = self.model.predict_action(self.state, self.target)
        predicted_outcome = self.model.predict_outcome(self.state, base_action)
        actual_outcome = env.step(self.state, base_action, context_scale=1.0 + v_l2(context) * 0.01)

        feedback = self.efl.process(base_action, predicted_outcome, actual_outcome)
        damped = self.fdl.process(feedback.raw_correction)
        recovered = self.srl.process(damped, feedback.raw_correction)

        drift_ms = self.pal.synchronize()
        local_latency_ms = random.uniform(0.2, 1.2)
        modulation_ms = self.dpm.modulate(drift_ms, local_latency_ms)
        stability_ms = self.sml.stabilize(modulation_ms)

        path_hint, candidate, sci, ips = self.sal.resolve(self.state, base_action, recovered)
        dynamic_threshold = self.atl.update(recovered, sci)
        csm = self.vrl.contextual_shift_metric(context)
        path = self.msl.select(ips, sci, dynamic_threshold)
        if csm >= self.config.contextual_shift_threshold:
            path = ResolutionPath.DEEP
        if path != path_hint and path == ResolutionPath.SHALLOW:
            selected_action = self.ral.resolve(base_action, recovered)
        elif path == ResolutionPath.SHALLOW:
            selected_action = self.ral.resolve(base_action, recovered)
        else:
            selected_action = candidate.vector

        projected_impact = clamp(v_l2(recovered) / max(1e-6, self.config.correction_limit * math.sqrt(self.config.dimension)), 0.0, 1.0)
        self.vpl.maybe_store(recovered, projected_impact)
        reintegrated = self.vrl.reintegrate(context, csm=csm)
        selected_action = v_clip(v_add(selected_action, v_mul(reintegrated, 0.2)), -self.config.action_limit, self.config.action_limit)

        next_state = v_add(self.state, selected_action)
        invariant_report = self.invariants.validate(next_state, selected_action)
        if invariant_report.ok:
            self.state = next_state
        else:
            selected_action = v_mul(selected_action, 0.5)
            self.state = v_add(self.state, selected_action)

        return RuntimeSnapshot(
            cycle=self.cycle_count,
            state=list(self.state),
            predicted_outcome=list(predicted_outcome),
            actual_outcome=list(actual_outcome),
            raw_correction=list(feedback.raw_correction),
            damped_correction=list(damped),
            recovered_signal=list(recovered),
            reintegrated_signal=list(reintegrated),
            selected_action=list(selected_action),
            resolution_path=path.value,
            sci=sci,
            ips=ips,
            dynamic_threshold=dynamic_threshold,
            contextual_shift_metric=csm,
            variance_diversity=self.vpl.diversity_score(),
            phase_drift_ms=drift_ms,
            modulation_ms=modulation_ms,
            stability_ms=stability_ms,
            invariant_ok=invariant_report.ok,
            invariant_violations=list(invariant_report.violations),
        )


def demo_run(cycles: int = 25) -> List[RuntimeSnapshot]:
    random.seed(7)
    runtime = AutopoieticRuntime()
    env = SimulatedEnvironment(dimension=runtime.config.dimension)
    snapshots: List[RuntimeSnapshot] = []

    contexts = []
    for i in range(cycles):
        if i < cycles // 2:
            contexts.append([0.05 * math.sin((i + j) * 0.3) for j in range(runtime.config.dimension)])
        else:
            contexts.append([0.95 if j % 2 == 0 else -0.95 for j in range(runtime.config.dimension)])

    for i in range(cycles):
        if i == cycles // 2:
            runtime.update_target([-0.75 if k % 2 == 0 else 0.75 for k in range(runtime.config.dimension)])
        snapshots.append(runtime.cycle(env, contexts[i]))
    return snapshots


if __name__ == "__main__":
    snapshots = demo_run(30)
    print("cycle,resolution_path,sci,ips,dynamic_threshold,csm,variance_diversity,invariant_ok")
    for snap in snapshots:
        print(
            f"{snap.cycle},{snap.resolution_path},{snap.sci:.4f},{snap.ips:.4f},"
            f"{snap.dynamic_threshold:.4f},{snap.contextual_shift_metric:.4f},"
            f"{snap.variance_diversity:.4f},{snap.invariant_ok}"
        )
