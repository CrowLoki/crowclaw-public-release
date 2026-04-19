import fs from "node:fs";
import path from "node:path";

import type { CrowClawConfig } from "../kernel/contracts.js";

export interface LegacyCrowClawV8Config {
  provider?: string;
  defaultProvider?: string;
  model?: string;
  defaultModel?: string;
  workspaceDir?: string;
  environment?: CrowClawConfig["environment"];
  autopoiesisEnabled?: boolean;
}

export interface LegacyCrowClawV8Settings {
  autopoiesis?: {
    enabled?: boolean;
  };
  providers?: {
    default?: string;
  };
  models?: {
    default?: string;
  };
}

export interface ConfigMigrationResult {
  sourceDir: string;
  outputPath: string;
  config: CrowClawConfig;
  detected: {
    configJson: boolean;
    settingsJson: boolean;
    autopoiesisDirectory: boolean;
  };
}

function readJsonFile<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function detectAutopoiesisEnabled(
  sourceDir: string,
  legacyConfig: LegacyCrowClawV8Config | undefined,
  legacySettings: LegacyCrowClawV8Settings | undefined
): boolean {
  if (typeof legacySettings?.autopoiesis?.enabled === "boolean") {
    return legacySettings.autopoiesis.enabled;
  }

  if (typeof legacyConfig?.autopoiesisEnabled === "boolean") {
    return legacyConfig.autopoiesisEnabled;
  }

  return fs.existsSync(path.join(sourceDir, "autopoiesis"));
}

export function translateCrowClawV8Config(sourceDir: string): ConfigMigrationResult {
  const configPath = path.join(sourceDir, "config.json");
  const settingsPath = path.join(sourceDir, "settings.json");

  const legacyConfig = readJsonFile<LegacyCrowClawV8Config>(configPath);
  const legacySettings = readJsonFile<LegacyCrowClawV8Settings>(settingsPath);

  const workspaceDir =
    legacyConfig?.workspaceDir ??
    path.join(sourceDir, "workspace");

  const config: CrowClawConfig = {
    productName: "CrowClaw",
    configDir: sourceDir,
    workspaceDir,
    environment: legacyConfig?.environment ?? "development",
    defaultProvider:
      legacySettings?.providers?.default ??
      legacyConfig?.defaultProvider ??
      legacyConfig?.provider,
    defaultModel:
      legacySettings?.models?.default ??
      legacyConfig?.defaultModel ??
      legacyConfig?.model,
    crowquant: {
      mode: "file-journal",
      enabled: false,
      apiKeyEnvVar: "CROWQUANT_API_KEY",
      journalDir: path.join(workspaceDir, ".crowquant-journal"),
      memoryDbPath: path.join(workspaceDir, ".crowquant", "memory.sqlite"),
      provider: "hash"
    },
    autopoiesis: {
      enabled: detectAutopoiesisEnabled(sourceDir, legacyConfig, legacySettings),
      runtimePath: path.join(sourceDir, "autopoiesis", "runtime.py"),
      sampleCycles: 5
    }
  };

  return {
    sourceDir,
    outputPath: path.join(sourceDir, "crowclaw-next.config.json"),
    config,
    detected: {
      configJson: fs.existsSync(configPath),
      settingsJson: fs.existsSync(settingsPath),
      autopoiesisDirectory: fs.existsSync(path.join(sourceDir, "autopoiesis"))
    }
  };
}

export function writeMigratedConfig(result: ConfigMigrationResult, outputPath = result.outputPath): string {
  const payload = `${JSON.stringify(result.config, null, 2)}\n`;
  fs.writeFileSync(outputPath, payload, "utf8");
  return outputPath;
}
