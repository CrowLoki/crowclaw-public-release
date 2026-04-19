import path from "node:path";

import type { CrowClawConfig } from "../kernel/contracts.js";
import { detectPython, getBundledCrowQuantRoot, runPython } from "../kernel/python-runtime.js";
import type {
  AdvancedMemoryAdapter,
  MemoryIndexRequest,
  MemoryQuery,
  MemoryRecord,
  MemorySearchHit,
  MemoryTransport
} from "./contracts.js";

/**
 * CrowClaw owns the user-facing memory experience while using CrowQuant as the
 * core substrate when the feature is enabled.
 */
export class CrowQuantAdapter implements AdvancedMemoryAdapter {
  readonly descriptor = {
    id: "memory.crowquant-adapter",
    kind: "memory" as const,
    version: "0.3.0",
    description: "CrowClaw memory adapter with built-in CrowQuant integration and toggleable advanced search.",
    capabilities: ["memory-boundary", "journal-fallback", "crowquant-indexing", "crowquant-search"]
  };

  constructor(
    private readonly transport: MemoryTransport,
    private readonly config: CrowClawConfig
  ) {}

  async read(query: MemoryQuery): Promise<MemoryRecord[]> {
    return this.transport.read(query);
  }

  async write(record: MemoryRecord): Promise<void> {
    return this.transport.write(record);
  }

  private ensureCrowQuantEnabled(): void {
    if (!this.config.crowquant.enabled) {
      throw new Error("CrowQuant is disabled. Run `crowclaw setup` or `crowclaw features enable crowquant` first.");
    }
  }

  private pythonEnv(): Record<string, string | undefined> {
    return {
      PYTHONPATH: getBundledCrowQuantRoot()
    };
  }

  async indexPath(request: MemoryIndexRequest): Promise<string> {
    this.ensureCrowQuantEnabled();
    const result = runPython(
      [
        "-m",
        "crowquant.cli",
        "memory",
        "index",
        request.rootPath,
        this.config.crowquant.memoryDbPath,
        "--provider",
        this.config.crowquant.provider,
        "--ollama-url",
        this.config.crowquant.ollamaUrl ?? "http://localhost:11434"
      ],
      {
        env: this.pythonEnv(),
        preferredCommand: this.config.crowquant.pythonPath
      }
    );

    if (!result.ok) {
      throw new Error(result.stderr.trim() || "CrowQuant indexing failed.");
    }

    return result.stdout.trim();
  }

  async semanticSearch(query: string, limit = 5): Promise<string> {
    this.ensureCrowQuantEnabled();
    const result = runPython(
      [
        "-m",
        "crowquant.cli",
        "memory",
        "search",
        this.config.crowquant.memoryDbPath,
        query,
        "--provider",
        this.config.crowquant.provider,
        "--limit",
        String(limit),
        "--ollama-url",
        this.config.crowquant.ollamaUrl ?? "http://localhost:11434"
      ],
      {
        env: this.pythonEnv(),
        preferredCommand: this.config.crowquant.pythonPath
      }
    );

    if (!result.ok) {
      throw new Error(result.stderr.trim() || "CrowQuant search failed.");
    }

    return result.stdout.trim();
  }

  async status(): Promise<string> {
    this.ensureCrowQuantEnabled();
    const result = runPython(
      [
        "-m",
        "crowquant.cli",
        "memory",
        "status",
        this.config.crowquant.memoryDbPath,
        "--provider",
        this.config.crowquant.provider,
        "--ollama-url",
        this.config.crowquant.ollamaUrl ?? "http://localhost:11434"
      ],
      {
        env: this.pythonEnv(),
        preferredCommand: this.config.crowquant.pythonPath
      }
    );

    if (!result.ok) {
      throw new Error(result.stderr.trim() || "CrowQuant status failed.");
    }

    return result.stdout.trim();
  }

  async getDiagnostics(): Promise<Record<string, unknown>> {
    const python = detectPython(this.config.crowquant.pythonPath);

    return {
      adapter: "crowquant-boundary",
      featureEnabled: this.config.crowquant.enabled,
      mode: this.config.crowquant.enabled ? "crowquant-core" : "journal-only",
      memoryDbPath: this.config.crowquant.memoryDbPath,
      journalDir: this.config.crowquant.journalDir,
      provider: this.config.crowquant.provider,
      bundledCrowQuantRoot: getBundledCrowQuantRoot(),
      python,
      fallbackTransport: await this.transport.getDiagnostics()
    };
  }
}
