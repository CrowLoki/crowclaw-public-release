import type { ModelRequest, ModelResponse, ProviderAdapter } from "./contracts.js";

export class InMemoryProvider implements ProviderAdapter {
  readonly providerId = "in-memory";
  readonly capabilitiesMatrix = {
    streaming: false,
    toolCalling: false,
    multimodal: false
  };

  readonly descriptor = {
    id: "provider.in-memory",
    kind: "provider" as const,
    version: "0.2.0",
    description: "A deterministic stub provider for diagnostics and early runtime wiring.",
    capabilities: ["diagnostics", "stub-generation"]
  };

  async generate(request: ModelRequest): Promise<ModelResponse> {
    return {
      provider: this.providerId,
      model: request.model,
      output: `[stub:${request.model}] ${request.prompt}`,
      usage: {
        inputTokens: request.prompt.length,
        outputTokens: request.prompt.length
      }
    };
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      providerId: this.providerId,
      capabilities: this.capabilitiesMatrix
    };
  }
}
