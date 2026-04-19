export type ModuleKind =
  | "kernel"
  | "provider"
  | "memory"
  | "autopoiesis"
  | "integration"
  | "cli";

export interface ModuleDescriptor {
  id: string;
  kind: ModuleKind;
  version: string;
  description: string;
  capabilities: string[];
}

export interface DiagnosticsProvider {
  getDiagnostics(): Record<string, unknown> | Promise<Record<string, unknown>>;
}

export interface RuntimeModule extends DiagnosticsProvider {
  descriptor: ModuleDescriptor;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export type CrowClawEnvironment = "development" | "test" | "production";

export interface CrowClawConfig {
  productName: "CrowClaw";
  configDir: string;
  workspaceDir: string;
  environment: CrowClawEnvironment;
  defaultProvider?: string;
  defaultModel?: string;
  crowquant: {
    enabled: boolean;
    mode: "file-journal" | "python";
    endpoint?: string;
    apiKeyEnvVar?: string;
    journalDir?: string;
    memoryDbPath: string;
    pythonPath?: string;
    provider: "hash" | "ollama";
    ollamaUrl?: string;
  };
  autopoiesis: {
    enabled: boolean;
    pythonPath?: string;
    runtimePath?: string;
    sampleCycles: number;
  };
}

export interface RuntimeManifest {
  product: string;
  environment: CrowClawConfig["environment"];
  configDir: string;
  workspaceDir: string;
  providerCount: number;
  moduleCount: number;
  integrationCount: number;
  features: {
    crowquantEnabled: boolean;
    autopoiesisEnabled: boolean;
  };
  modules: ModuleDescriptor[];
}
