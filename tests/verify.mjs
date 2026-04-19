import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildDefaultCrowClawConfig, loadCrowClawConfig, writeCrowClawConfig } from "../dist/kernel/config.js";
import { buildRuntimeManifest } from "../dist/kernel/manifest.js";
import { detectPython, getBundledAutopoiesisRuntime, getBundledCrowQuantRoot } from "../dist/kernel/python-runtime.js";
import { ModuleRegistry } from "../dist/kernel/registry.js";

function runChecks() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "crowclaw-home-"));
  const config = buildDefaultCrowClawConfig({ HOME: home });

  assert.equal(config.crowquant.enabled, false);
  assert.equal(config.autopoiesis.enabled, false);
  assert.equal(config.defaultProvider, "in-memory");

  writeCrowClawConfig({
    ...config,
    crowquant: {
      ...config.crowquant,
      enabled: true
    },
    autopoiesis: {
      ...config.autopoiesis,
      enabled: true
    }
  });

  const persisted = JSON.parse(fs.readFileSync(path.join(home, ".crowclaw", "crowclaw.config.json"), "utf8"));
  const reloaded = loadCrowClawConfig({ HOME: home });

  assert.equal(persisted.crowquant.enabled, true);
  assert.equal(persisted.autopoiesis.enabled, true);
  assert.equal(reloaded.crowquant.enabled, true);
  assert.equal(reloaded.autopoiesis.enabled, true);

  const modules = new ModuleRegistry();
  modules.register({
    descriptor: {
      id: "kernel.runtime",
      kind: "kernel",
      version: "0.3.0",
      description: "test runtime",
      capabilities: []
    },
    getDiagnostics() {
      return {};
    }
  });

  const manifest = buildRuntimeManifest({
    ...reloaded,
    crowquant: {
      ...reloaded.crowquant,
      enabled: true
    }
  }, modules);

  assert.equal(manifest.features.crowquantEnabled, true);
  assert.equal(manifest.features.autopoiesisEnabled, true);

  if (process.env.CROWCLAW_PYTHON_PATH) {
    const python = detectPython(process.env.CROWCLAW_PYTHON_PATH);
    assert.equal(python.available, true);
  }

  assert.equal(fs.existsSync(getBundledAutopoiesisRuntime()), true);
  assert.equal(fs.existsSync(getBundledCrowQuantRoot()), true);
}

runChecks();
console.log("verify: ok");
