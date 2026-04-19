import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crowclaw-release-"));
const cacheDir = path.join(tempRoot, "npm-cache");
const prefixDir = path.join(tempRoot, "npm-prefix");
const homeDir = path.join(tempRoot, "home");
const npmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function run(command, args, options = {}) {
  const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
  const { env: extraEnv, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: useShell,
    env: {
      ...process.env,
      HOME: homeDir,
      ...extraEnv
    },
    ...spawnOptions
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );

  return result.stdout.trim();
}

function installedCliPath() {
  const candidates = process.platform === "win32"
    ? [
        path.join(prefixDir, "crowclaw.cmd"),
        path.join(prefixDir, "crowclaw"),
        path.join(prefixDir, "bin", "crowclaw.cmd"),
        path.join(prefixDir, "bin", "crowclaw")
      ]
    : [
        path.join(prefixDir, "bin", "crowclaw"),
        path.join(prefixDir, "crowclaw")
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

run(process.execPath, [npmCliPath, "pack", "--ignore-scripts", "--cache", cacheDir]);

const tarballPath = path.join(repoRoot, "crowclaw-0.1.0.tgz");
assert.equal(fs.existsSync(tarballPath), true, "release tarball was not created");

run(process.execPath, [npmCliPath, "install", "-g", tarballPath, "--prefix", prefixDir, "--cache", cacheDir]);

const cliPath = installedCliPath();
assert.equal(fs.existsSync(cliPath), true, "installed crowclaw launcher was not created");

run(cliPath, ["setup", "--non-interactive", "--crowquant", "enabled", "--autopoiesis", "enabled"]);

const featuresStatus = run(cliPath, ["features", "status"], {
  env: process.env.CROWCLAW_PYTHON_PATH
    ? { CROWCLAW_PYTHON_PATH: process.env.CROWCLAW_PYTHON_PATH }
    : {}
});

const featuresPayload = JSON.parse(featuresStatus);
assert.equal(featuresPayload.features.crowquant.enabled, true);
assert.equal(featuresPayload.features.autopoiesis.enabled, true);

if (process.env.CROWCLAW_PYTHON_PATH) {
  const memoryStatus = run(cliPath, ["memory", "status"], {
    env: { CROWCLAW_PYTHON_PATH: process.env.CROWCLAW_PYTHON_PATH }
  });
  assert.match(memoryStatus, /db_path:/);

  const autopoiesisSample = run(cliPath, ["autopoiesis", "sample", "3"], {
    env: { CROWCLAW_PYTHON_PATH: process.env.CROWCLAW_PYTHON_PATH }
  });
  const autopoiesisPayload = JSON.parse(autopoiesisSample);
  assert.equal(autopoiesisPayload.cycles, 3);
}

console.log("release-verify: ok");
