#!/usr/bin/env node
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { LocalAutopoiesisSubsystem } from "../autopoiesis/local-autopoiesis.js";
import { WorkspaceFilesystemIntegration } from "../integrations/workspace-filesystem.js";
import { loadCrowClawConfig, writeCrowClawConfig } from "../kernel/config.js";
import { detectPython, getBundledAutopoiesisRuntime, getBundledCrowQuantRoot } from "../kernel/python-runtime.js";
import { CrowClawRuntime } from "../kernel/runtime.js";
import { CrowQuantAdapter } from "../memory/crowquant-adapter.js";
import { FileJournalMemoryTransport } from "../memory/file-journal-transport.js";
import { InMemoryProvider } from "../providers/in-memory-provider.js";
import { LegacyFunctionProvider } from "../providers/legacy-function-provider.js";

type FeatureName = "crowquant" | "autopoiesis";

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  const [command = "diag", ...rest] = positionals;
  return { command, positionals: rest, flags };
}

function parseFeatureValue(value: string | boolean | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on", "enabled"].includes(value.trim().toLowerCase());
}

function buildRuntime() {
  const rawConfig = loadCrowClawConfig();
  const config = {
    ...rawConfig,
    defaultProvider: rawConfig.defaultProvider ?? "in-memory",
    defaultModel: rawConfig.defaultModel ?? "diagnostic-model"
  };
  const memory = new CrowQuantAdapter(
    new FileJournalMemoryTransport(config.crowquant.journalDir ?? path.join(config.workspaceDir, ".crowquant-journal")),
    config
  );
  const autopoiesis = new LocalAutopoiesisSubsystem(
    config.autopoiesis.enabled,
    config.autopoiesis.pythonPath,
    config.autopoiesis.runtimePath,
    config.autopoiesis.sampleCycles
  );

  const runtime = new CrowClawRuntime({
    config,
    providers: [
      new InMemoryProvider(),
      new LegacyFunctionProvider({
        providerId: "legacy-echo",
        description: "Bridge example for migrating existing handlers into the new provider contract.",
        handler: async (request) => ({
          provider: "legacy-echo",
          model: request.model,
          output: `[legacy:${request.model}] ${request.prompt.toUpperCase()}`,
          usage: {
            inputTokens: request.prompt.length,
            outputTokens: request.prompt.length
          }
        })
      })
    ],
    memory,
    autopoiesis,
    integrations: [new WorkspaceFilesystemIntegration()]
  });

  return { runtime, config, memory, autopoiesis };
}

async function promptBoolean(question: string, fallback: boolean): Promise<boolean> {
  if (!process.stdout.isTTY) {
    return fallback;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question(`${question} ${fallback ? "[Y/n]" : "[y/N]"} `);
    const normalized = answer.trim().toLowerCase();
    if (normalized.length === 0) {
      return fallback;
    }
    return ["y", "yes", "true", "enabled", "on"].includes(normalized);
  } finally {
    rl.close();
  }
}

async function runSetup(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadCrowClawConfig();
  const nonInteractive = Boolean(flags["non-interactive"]);
  const detectedPython = detectPython(typeof flags["python-path"] === "string" ? flags["python-path"] : config.crowquant.pythonPath);
  const crowquantEnabled = nonInteractive
    ? parseFeatureValue(flags.crowquant, config.crowquant.enabled)
    : await promptBoolean("Enable CrowQuant at startup?", config.crowquant.enabled);
  const autopoiesisEnabled = nonInteractive
    ? parseFeatureValue(flags.autopoiesis, config.autopoiesis.enabled)
    : await promptBoolean("Enable Autopoiesis at startup?", config.autopoiesis.enabled);
  const pythonPath = typeof flags["python-path"] === "string"
    ? flags["python-path"]
    : detectedPython.command ?? config.crowquant.pythonPath;

  writeCrowClawConfig({
    ...config,
    crowquant: {
      ...config.crowquant,
      enabled: crowquantEnabled,
      pythonPath
    },
    autopoiesis: {
      ...config.autopoiesis,
      enabled: autopoiesisEnabled,
      pythonPath
    }
  });

  console.log(JSON.stringify({
    ok: true,
    configPath: path.join(config.configDir, "crowclaw.config.json"),
    python: detectedPython,
    features: {
      crowquant: crowquantEnabled,
      autopoiesis: autopoiesisEnabled
    }
  }, null, 2));
}

function ensureFeatureName(value: string | undefined): FeatureName {
  if (value === "crowquant" || value === "autopoiesis") {
    return value;
  }

  throw new Error(`Unknown feature: ${value ?? ""}`);
}

function updateFeature(feature: FeatureName, enabled: boolean, pythonPath?: string): void {
  const config = loadCrowClawConfig();
  if (feature === "crowquant") {
    writeCrowClawConfig({
      ...config,
      crowquant: {
        ...config.crowquant,
        enabled,
        pythonPath: pythonPath ?? config.crowquant.pythonPath
      }
    });
    return;
  }

  writeCrowClawConfig({
    ...config,
    autopoiesis: {
      ...config.autopoiesis,
      enabled,
      pythonPath: pythonPath ?? config.autopoiesis.pythonPath
    }
  });
}

function buildDoctorReport() {
  const config = loadCrowClawConfig();
  const python = detectPython(config.crowquant.pythonPath ?? config.autopoiesis.pythonPath);

  return {
    ok: true,
    configPath: path.join(config.configDir, "crowclaw.config.json"),
    workspaceDir: config.workspaceDir,
    python,
    bundledAssets: {
      crowquantRoot: getBundledCrowQuantRoot(),
      autopoiesisRuntime: getBundledAutopoiesisRuntime()
    },
    features: {
      crowquant: config.crowquant,
      autopoiesis: config.autopoiesis
    }
  };
}

async function run(): Promise<void> {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));

  if (command === "setup") {
    await runSetup(flags);
    return;
  }

  if (command === "doctor") {
    console.log(JSON.stringify(buildDoctorReport(), null, 2));
    return;
  }

  if (command === "features") {
    const action = positionals[0] ?? "status";
    if (action === "status") {
      console.log(JSON.stringify(buildDoctorReport(), null, 2));
      return;
    }

    const feature = ensureFeatureName(positionals[1]);
    updateFeature(feature, action === "enable", typeof flags["python-path"] === "string" ? flags["python-path"] : undefined);
    console.log(JSON.stringify({ ok: true, feature, enabled: action === "enable" }, null, 2));
    return;
  }

  const { runtime, config, autopoiesis } = buildRuntime();
  await runtime.start();

  try {
    switch (command) {
      case "diag": {
        console.log(
          JSON.stringify(
            {
              manifest: runtime.getManifest(),
              diagnostics: await runtime.getDiagnostics()
            },
            null,
            2
          )
        );
        break;
      }

      case "providers": {
        console.log(JSON.stringify(runtime.providers.list().map((provider) => ({
          providerId: provider.providerId,
          descriptor: provider.descriptor,
          capabilities: provider.capabilitiesMatrix
        })), null, 2));
        break;
      }

      case "generate": {
        const [provider, model = config.defaultModel ?? "diagnostic-model", ...promptParts] = positionals;
        const prompt = promptParts.join(" ").trim();
        const response = await runtime.generate({
          provider: provider === "-" ? undefined : provider,
          model,
          prompt: prompt || "crowclaw diagnostic prompt"
        });
        console.log(JSON.stringify(response, null, 2));
        break;
      }

      case "memory": {
        const subcommand = positionals[0] ?? "status";
        if (subcommand === "write") {
          const [namespace = "sessions", key = "entry", ...valueParts] = positionals.slice(1);
          const value = valueParts.join(" ").trim() || "crowclaw memory entry";
          await runtime.memoryWrite({ namespace, key, value, tags: ["cli"] });
          console.log(JSON.stringify({ ok: true, namespace, key }, null, 2));
          break;
        }

        if (subcommand === "read") {
          const [namespace = "sessions", ...searchParts] = positionals.slice(1);
          const search = searchParts.join(" ").trim();
          const records = await runtime.memoryRead({ namespace, search, limit: 10 });
          console.log(JSON.stringify(records, null, 2));
          break;
        }

        if (subcommand === "index") {
          const [rootPath = config.workspaceDir] = positionals.slice(1);
          console.log(await runtime.memoryIndex({ rootPath }));
          break;
        }

        if (subcommand === "search") {
          const [query = "", limitValue] = positionals.slice(1);
          console.log(await runtime.memorySemanticSearch(query, Number(limitValue ?? "5")));
          break;
        }

        if (subcommand === "status") {
          console.log(await runtime.memoryStatus());
          break;
        }

        throw new Error(`Unknown memory command: ${subcommand}`);
      }

      case "autopoiesis": {
        const subcommand = positionals[0] ?? "status";
        if (subcommand === "status") {
          console.log(JSON.stringify(autopoiesis.getDiagnostics(), null, 2));
          break;
        }

        if (subcommand === "sample") {
          const cycles = Number(positionals[1] ?? config.autopoiesis.sampleCycles);
          console.log(JSON.stringify(await autopoiesis.sample(cycles), null, 2));
          break;
        }

        throw new Error(`Unknown autopoiesis command: ${subcommand}`);
      }

      case "smoke": {
        await runtime.memoryWrite({
          namespace: "smoke",
          key: "prompt",
          value: "CrowClaw public release smoke test",
          tags: ["smoke"]
        });
        const result = await runtime.generate({
          model: config.defaultModel ?? "diagnostic-model",
          prompt: "smoke test"
        });
        const memory = await runtime.memoryRead({ namespace: "smoke", search: "CrowClaw", limit: 5 });
        console.log(JSON.stringify({ result, memory, features: config }, null, 2));
        break;
      }

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    await runtime.stop();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
