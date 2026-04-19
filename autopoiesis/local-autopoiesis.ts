import type { AutopoiesisContext, AutopoiesisSubsystem } from "./contracts.js";
import { detectPython, getBundledAutopoiesisRuntime, runPython } from "../kernel/python-runtime.js";

export class LocalAutopoiesisSubsystem implements AutopoiesisSubsystem {
  readonly descriptor = {
    id: "autopoiesis.local",
    kind: "autopoiesis" as const,
    version: "0.1.0",
    description: "Local autopoietic runtime integrated into CrowClaw with feature-state control.",
    capabilities: ["feature-toggle", "python-runtime", "local-simulation"]
  };

  private lastSample: Record<string, unknown> | null = null;

  constructor(
    public readonly enabled: boolean,
    private readonly pythonPath?: string,
    private readonly runtimePath = getBundledAutopoiesisRuntime(),
    private readonly defaultCycles = 5
  ) {}

  async attach(context: AutopoiesisContext): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await context.eventBus.emit("autopoiesis.attached", {
      sessionId: context.sessionId,
      module: this.descriptor.id
    });

    this.lastSample = await this.sample(this.defaultCycles);
  }

  async sample(cycles = this.defaultCycles): Promise<Record<string, unknown>> {
    if (!this.enabled) {
      return {
        enabled: false,
        mode: "disabled"
      };
    }

    const snippet = [
      "import json",
      "import importlib.util",
      "import sys",
      `spec = importlib.util.spec_from_file_location('crowclaw_autopoiesis_runtime', r'''${this.runtimePath}''')`,
      "module = importlib.util.module_from_spec(spec)",
      "assert spec and spec.loader",
      "sys.modules[spec.name] = module",
      "spec.loader.exec_module(module)",
      `snapshots = module.demo_run(${cycles})`,
      "last = snapshots[-1] if snapshots else None",
      "payload = {'cycles': len(snapshots), 'last': last.__dict__ if last else None}",
      "print(json.dumps(payload))"
    ].join("\n");

    const result = runPython(["-c", snippet], {
      preferredCommand: this.pythonPath
    });

    if (!result.ok) {
      return {
        enabled: true,
        mode: "unavailable",
        error: result.stderr.trim() || "Autopoiesis runtime execution failed."
      };
    }

    try {
      return JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    } catch {
      return {
        enabled: true,
        mode: "unexpected-output",
        output: result.stdout.trim()
      };
    }
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      enabled: this.enabled,
      runtimePath: this.runtimePath,
      python: detectPython(this.pythonPath),
      lastSample: this.lastSample
    };
  }
}
