import type { RuntimeModule } from "../kernel/contracts.js";

export interface IntegrationContext {
  workspaceDir: string;
}

export interface HostIntegration extends RuntimeModule {
  connect(context: IntegrationContext): Promise<void>;
}
