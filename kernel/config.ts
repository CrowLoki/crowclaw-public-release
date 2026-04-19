import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CrowClawConfig, CrowClawEnvironment } from "./contracts.js";
import { getBundledAutopoiesisRuntime } from "./python-runtime.js";

interface PartialCrowClawConfig extends Partial<Omit<CrowClawConfig, "crowquant" | "autopoiesis">> {
  crowquant?: Partial<CrowClawConfig["crowquant"]>;
  autopoiesis?: Partial<CrowClawConfig["autopoiesis"]>;
}

function parseEnvironment(value: string | undefined): CrowClawEnvironment {
  switch (value) {
    case "production":
    case "test":
      return value;
    default:
      return "development";
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function readConfigFile(configDir: string): PartialCrowClawConfig {
  const filePath = path.join(configDir, "crowclaw.config.json");
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as PartialCrowClawConfig;
}

function resolveAutopoiesisRuntimePath(
  configuredPath: string | undefined,
  fallbackPath: string | undefined
): string {
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  return fallbackPath ?? getBundledAutopoiesisRuntime();
}

function resolveConfiguredPythonPath(envPath: string | undefined, fallbackPath: string | undefined): string | undefined {
  return envPath ?? fallbackPath;
}

export function getCrowClawConfigPath(configDir: string): string {
  return path.join(configDir, "crowclaw.config.json");
}

export function buildDefaultCrowClawConfig(env: NodeJS.ProcessEnv = process.env): CrowClawConfig {
  const home = env.HOME ?? os.homedir();
  const configDir = env.CROWCLAW_HOME ?? path.join(home, ".crowclaw");
  const workspaceDir = env.CROWCLAW_WORKSPACE ?? path.join(configDir, "workspace");

  return {
    productName: "CrowClaw",
    configDir,
    workspaceDir,
    environment: parseEnvironment(env.NODE_ENV),
    defaultProvider: env.CROWCLAW_DEFAULT_PROVIDER ?? "in-memory",
    defaultModel: env.CROWCLAW_DEFAULT_MODEL ?? "diagnostic-model",
    crowquant: {
      enabled: parseBoolean(env.CROWCLAW_CROWQUANT_ENABLED, false),
      mode: "file-journal",
      endpoint: env.CROWQUANT_ENDPOINT,
      apiKeyEnvVar: env.CROWQUANT_API_KEY_ENV_VAR ?? "CROWQUANT_API_KEY",
      journalDir: env.CROWQUANT_JOURNAL_DIR ?? path.join(workspaceDir, ".crowquant-journal"),
      memoryDbPath: env.CROWQUANT_MEMORY_DB_PATH ?? path.join(workspaceDir, ".crowquant", "memory.sqlite"),
      pythonPath: resolveConfiguredPythonPath(env.CROWCLAW_PYTHON_PATH, undefined),
      provider: (env.CROWQUANT_MEMORY_PROVIDER as "hash" | "ollama" | undefined) ?? "hash",
      ollamaUrl: env.CROWQUANT_OLLAMA_URL ?? "http://localhost:11434"
    },
    autopoiesis: {
      enabled: parseBoolean(env.CROWCLAW_AUTOPOIESIS_ENABLED, false),
      pythonPath: resolveConfiguredPythonPath(env.CROWCLAW_PYTHON_PATH, undefined),
      runtimePath: env.CROWCLAW_AUTOPOIESIS_RUNTIME_PATH ?? getBundledAutopoiesisRuntime(),
      sampleCycles: Number(env.CROWCLAW_AUTOPOIESIS_SAMPLE_CYCLES ?? "5")
    }
  };
}

export function loadCrowClawConfig(env: NodeJS.ProcessEnv = process.env): CrowClawConfig {
  const defaults = buildDefaultCrowClawConfig(env);
  const configDir = defaults.configDir;
  const fileConfig = readConfigFile(configDir);
  const workspaceDir = env.CROWCLAW_WORKSPACE ?? fileConfig.workspaceDir ?? defaults.workspaceDir;

  return {
    productName: "CrowClaw",
    configDir,
    workspaceDir,
    environment: parseEnvironment(env.NODE_ENV ?? fileConfig.environment ?? defaults.environment),
    defaultProvider: env.CROWCLAW_DEFAULT_PROVIDER ?? fileConfig.defaultProvider ?? defaults.defaultProvider,
    defaultModel: env.CROWCLAW_DEFAULT_MODEL ?? fileConfig.defaultModel ?? defaults.defaultModel,
    crowquant: {
      enabled: parseBoolean(
        env.CROWCLAW_CROWQUANT_ENABLED,
        fileConfig.crowquant?.enabled ?? defaults.crowquant.enabled
      ),
      mode:
        (env.CROWQUANT_MODE as CrowClawConfig["crowquant"]["mode"] | undefined) ??
        fileConfig.crowquant?.mode ??
        defaults.crowquant.mode,
      endpoint: env.CROWQUANT_ENDPOINT ?? fileConfig.crowquant?.endpoint ?? defaults.crowquant.endpoint,
      apiKeyEnvVar:
        env.CROWQUANT_API_KEY_ENV_VAR ?? fileConfig.crowquant?.apiKeyEnvVar ?? defaults.crowquant.apiKeyEnvVar,
      journalDir:
        env.CROWQUANT_JOURNAL_DIR ??
        fileConfig.crowquant?.journalDir ??
        path.join(workspaceDir, ".crowquant-journal"),
      memoryDbPath:
        env.CROWQUANT_MEMORY_DB_PATH ??
        fileConfig.crowquant?.memoryDbPath ??
        path.join(workspaceDir, ".crowquant", "memory.sqlite"),
      pythonPath: resolveConfiguredPythonPath(env.CROWCLAW_PYTHON_PATH, defaults.crowquant.pythonPath),
      provider:
        (env.CROWQUANT_MEMORY_PROVIDER as CrowClawConfig["crowquant"]["provider"] | undefined) ??
        fileConfig.crowquant?.provider ??
        defaults.crowquant.provider,
      ollamaUrl: env.CROWQUANT_OLLAMA_URL ?? fileConfig.crowquant?.ollamaUrl ?? defaults.crowquant.ollamaUrl
    },
    autopoiesis: {
      enabled: parseBoolean(
        env.CROWCLAW_AUTOPOIESIS_ENABLED,
        fileConfig.autopoiesis?.enabled ?? defaults.autopoiesis.enabled
      ),
      pythonPath: resolveConfiguredPythonPath(env.CROWCLAW_PYTHON_PATH, defaults.autopoiesis.pythonPath),
      runtimePath:
        env.CROWCLAW_AUTOPOIESIS_RUNTIME_PATH ??
        resolveAutopoiesisRuntimePath(fileConfig.autopoiesis?.runtimePath, defaults.autopoiesis.runtimePath),
      sampleCycles: Number(
        env.CROWCLAW_AUTOPOIESIS_SAMPLE_CYCLES ??
        fileConfig.autopoiesis?.sampleCycles ??
        defaults.autopoiesis.sampleCycles
      )
    }
  };
}

export function writeCrowClawConfig(config: CrowClawConfig): void {
  fs.mkdirSync(config.configDir, { recursive: true });
  fs.writeFileSync(getCrowClawConfigPath(config.configDir), JSON.stringify(config, null, 2), "utf8");
}
