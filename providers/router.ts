import type { CrowClawConfig } from "../kernel/contracts.js";
import type { EventBus } from "../kernel/event-bus.js";
import type { ModelRequest, ModelResponse } from "./contracts.js";
import { ProviderRegistry } from "./registry.js";

export class ProviderRouter {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly config: CrowClawConfig,
    private readonly eventBus?: EventBus
  ) {}

  resolveProviderId(request: ModelRequest): string {
    if (request.provider) {
      return request.provider;
    }

    if (this.config.defaultProvider) {
      return this.config.defaultProvider;
    }

    const providers = this.registry.list();
    if (providers.length === 1) {
      return providers[0].providerId;
    }

    throw new Error(
      "No provider specified and no default provider configured. Register one provider or set CROWCLAW_DEFAULT_PROVIDER."
    );
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const providerId = this.resolveProviderId(request);
    const provider = this.registry.get(providerId);

    await this.eventBus?.emit("provider.generate.requested", {
      providerId,
      model: request.model,
      promptLength: request.prompt.length
    });

    const response = await provider.generate({ ...request, provider: providerId });

    await this.eventBus?.emit("provider.generate.completed", {
      providerId,
      model: response.model,
      outputLength: response.output.length
    });

    return response;
  }
}
