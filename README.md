# CrowClaw

CrowClaw is a local-first CLI runtime for experimentation, generation, workspace orchestration, memory operations, and optional autopoietic behavior on a user's own machine.

This public release keeps CrowClaw as the product entrypoint while integrating:

- CrowQuant as the core memory substrate
- Autopoiesis as a first-class runtime subsystem
- feature toggles so either subsystem can be enabled at setup time or later

## Install

```bash
npm install
npm run build
npm run diag
```

To expose the public CLI command after packaging:

```bash
npm install -g .
crowclaw diag
```

## First Run

Interactive setup:

```bash
crowclaw setup
```

Non-interactive setup:

```bash
crowclaw setup --non-interactive --crowquant enabled --autopoiesis disabled
```

## Core Commands

```bash
crowclaw diag
crowclaw doctor
crowclaw providers
crowclaw generate -- legacy-echo diagnostic-model hello from crowclaw
crowclaw features
crowclaw features enable crowquant
crowclaw features disable autopoiesis
crowclaw memory write sessions entry hello-memory
crowclaw memory read sessions hello
crowclaw memory index ./notes
crowclaw memory search "continuity protocol"
crowclaw memory status
crowclaw autopoiesis status
crowclaw autopoiesis sample 5
```

## Config

CrowClaw stores configuration in:

`~/.crowclaw/crowclaw.config.json`

Key feature flags:

- `crowquant.enabled`
- `autopoiesis.enabled`

CrowClaw writes safe defaults on first setup and lets you change features later with the CLI.

## Runtime Requirements

- Node.js 18+
- Python is optional for the base CLI, but required for CrowQuant advanced memory commands and Autopoiesis execution

If Python is missing, CrowClaw still runs in base mode and diagnostics explain which features are unavailable.

Use `crowclaw doctor` to inspect the active config, detected Python runtime, and bundled CrowQuant/Autopoiesis asset paths.
