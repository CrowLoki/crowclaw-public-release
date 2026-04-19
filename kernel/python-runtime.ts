import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface PythonAvailability {
  available: boolean;
  command: string | null;
  version?: string;
  error?: string;
}

const WORKSPACE_PYTHON =
  "C:\\Users\\djdar\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

export function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function getBundledCrowQuantRoot(): string {
  return path.join(getPackageRoot(), "python", "crowquant");
}

export function getBundledAutopoiesisRuntime(): string {
  return path.join(getPackageRoot(), "python", "autopoiesis", "runtime.py");
}

export interface PythonRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
  command: string | null;
}

function spawnCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    input?: string;
  }
) {
  return spawnSync(command, args, {
    cwd: options?.cwd,
    env: { ...process.env, ...options?.env },
    encoding: "utf8",
    input: options?.input
  });
}

export function detectPython(preferred?: string): PythonAvailability {
  const candidates = [preferred, process.env.CROWCLAW_PYTHON_PATH, WORKSPACE_PYTHON, "python", "py"]
    .filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    const result = spawnCommand(candidate, ["--version"]);
    if (result.status === 0) {
      const version = [result.stdout, result.stderr].join(" ").trim().replace(/\s+/g, " ");
      return {
        available: true,
        command: candidate,
        version: version || "Python"
      };
    }
  }

  return {
    available: false,
    command: null,
    error: "Python was not found. Install Python or set CROWCLAW_PYTHON_PATH."
  };
}

export function runPython(
  args: string[],
  options?: {
    preferredCommand?: string;
    cwd?: string;
    env?: Record<string, string | undefined>;
    input?: string;
  }
): PythonRunResult {
  const availability = detectPython(options?.preferredCommand);
  if (!availability.available || !availability.command) {
    return {
      ok: false,
      stdout: "",
      stderr: availability.error ?? "Python unavailable.",
      status: null,
      command: availability.command
    };
  }

  const result = spawnCommand(availability.command, args, options);

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    command: availability.command
  };
}
