import type { RuntimeModule } from "../kernel/contracts.js";

export interface ModelRequest {
  provider?: string;
  model: string;
  prompt: string;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelResponse {
  output: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  provider: string;
  model: string;
}

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  multimodal: boolean;
}

export interface ProviderAdapter extends RuntimeModule {
  readonly providerId: string;
  readonly capabilitiesMatrix: ProviderCapabilities;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
