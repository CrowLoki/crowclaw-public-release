import fs from "node:fs/promises";
import path from "node:path";

import type { IntegrationContext, HostIntegration } from "./contracts.js";

export class WorkspaceFilesystemIntegration implements HostIntegration {
  readonly descriptor = {
    id: "integration.workspace-filesystem",
    kind: "integration" as const,
    version: "0.2.0",
    description: "Ensures the CrowClaw workspace structure exists before runtime activity.",
    capabilities: ["workspace-bootstrap", "filesystem"]
  };

  private bootstrappedPaths: string[] = [];

  async connect(context: IntegrationContext): Promise<void> {
    const paths = [
      context.workspaceDir,
      path.join(context.workspaceDir, "logs"),
      path.join(context.workspaceDir, "state"),
      path.join(context.workspaceDir, "tmp")
    ];

    await Promise.all(paths.map((target) => fs.mkdir(target, { recursive: true })));
    this.bootstrappedPaths = paths;
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      bootstrappedPaths: this.bootstrappedPaths
    };
  }
}
