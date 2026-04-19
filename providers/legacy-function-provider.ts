import type { ModelRequest, ModelResponse, ProviderAdapter, ProviderCapabilities } from "./contracts.js";

export interface LegacyFunctionProviderOptions {
  providerId: string;
  description?: string;
  capabilities?: Partial<ProviderCapabilities>;
  handler: (request: ModelRequest) => Promise<ModelResponse>;
}

export class LegacyFunctionProvider implements ProviderAdapter {
  readonly providerId: string;
  readonly capabilitiesMatrix: ProviderCapabilities;
  readonly descriptor;

  constructor(private readonly options: LegacyFunctionProviderOptions) {
    this.providerId = options.providerId;
    this.capabilitiesMatrix = {
      streaming: options.capabilities?.streaming ?? false,
      toolCalling: options.capabilities?.toolCalling ?? false,
      multimodal: options.capabilities?.multimodal ?? false
    };

    this.descriptor = {
      id: `provider.${this.providerId}`,
      kind: "provider" as const,
      version: "0.2.0",
      description:
        options.description ?? "Legacy bridge provider wrapping an existing CrowClaw/OpenClaw/Hermes handler.",
      capabilities: ["legacy-bridge", "adapter"]
    };
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    return this.options.handler(request);
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      providerId: this.providerId,
      capabilities: this.capabilitiesMatrix,
      bridged: true
    };
  }
}
