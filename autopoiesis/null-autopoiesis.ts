import type { AutopoiesisContext, AutopoiesisSubsystem } from "./contracts.js";

export class NullAutopoiesisSubsystem implements AutopoiesisSubsystem {
  constructor(public readonly enabled: boolean) {}

  readonly descriptor = {
    id: "autopoiesis.null",
    kind: "autopoiesis" as const,
    version: "0.1.0",
    description: "Optional autopoiesis boundary. Does not impose identity behavior on the kernel.",
    capabilities: ["boundary-only", "opt-in-runtime-layer"]
  };

  async attach(context: AutopoiesisContext): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await context.eventBus.emit("autopoiesis.attached", {
      sessionId: context.sessionId,
      module: this.descriptor.id
    });
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      enabled: this.enabled,
      mode: this.enabled ? "attached-boundary" : "disabled"
    };
  }
}
