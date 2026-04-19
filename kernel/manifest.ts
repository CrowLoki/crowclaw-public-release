import type { CrowClawConfig, RuntimeManifest } from "./contracts.js";
import { ModuleRegistry } from "./registry.js";

export function buildRuntimeManifest(config: CrowClawConfig, modules: ModuleRegistry): RuntimeManifest {
  const descriptors = modules.listDescriptors();

  return {
    product: config.productName,
    environment: config.environment,
    configDir: config.configDir,
    workspaceDir: config.workspaceDir,
    providerCount: descriptors.filter((entry) => entry.kind === "provider").length,
    moduleCount: descriptors.length,
    integrationCount: descriptors.filter((entry) => entry.kind === "integration").length,
    features: {
      crowquantEnabled: config.crowquant.enabled,
      autopoiesisEnabled: config.autopoiesis.enabled
    },
    modules: descriptors
  };
}
