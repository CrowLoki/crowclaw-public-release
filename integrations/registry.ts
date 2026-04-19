import type { HostIntegration } from "./contracts.js";

export class IntegrationRegistry {
  private readonly integrations = new Map<string, HostIntegration>();

  register(integration: HostIntegration): void {
    if (this.integrations.has(integration.descriptor.id)) {
      throw new Error(`Integration already registered: ${integration.descriptor.id}`);
    }

    this.integrations.set(integration.descriptor.id, integration);
  }

  list(): HostIntegration[] {
    return [...this.integrations.values()].sort((a, b) => a.descriptor.id.localeCompare(b.descriptor.id));
  }
}
