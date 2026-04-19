import type { ProviderAdapter } from "./contracts.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();

  register(provider: ProviderAdapter): void {
    if (this.providers.has(provider.providerId)) {
      throw new Error(`Provider already registered: ${provider.providerId}`);
    }

    this.providers.set(provider.providerId, provider);
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  get(providerId: string): ProviderAdapter {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    return provider;
  }

  list(): ProviderAdapter[] {
    return [...this.providers.values()].sort((a, b) => a.providerId.localeCompare(b.providerId));
  }
}
