---
title: CrowClaw Architecture Overview
---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Core["CrowClaw Core"]
        direction TB
        CLI[CLI Interface]
        Config[Configuration Manager]
        Runtime[Runtime Orchestrator]
        Memory[Memory Subsystem]
    end

    subgraph Autopoietic["Autopoietic System"]
        direction LR
        Adapter1[Anthropic]
        Adapter2[OpenAI]
        Adapter3[OpenRouter]
        Adapter4[Ollama]
        Adapter5[Vector Memory]
        Adapter6[Observability]
    end

    subgraph Integrations["External Integrations"]
        direction TB
        Discord[Discord]
        Telegram[Telegram]
        K8s[Kubernetes]
        Obsidian[Obsidian]
    end

    subgraph Security["Security & Governance"]
        Policy[Policy Engine]
        Verify[Verification]
        Audit[Audit Logs]
    end

    CLI --> Config
    Config --> Runtime
    Runtime --> Memory
    Runtime --> Autopoietic
    Autopoietic --> Integrations
    Runtime --> Security
    Policy --> Verify
    Verify --> Audit

    style Core fill:#f9f,stroke:#333,stroke-width:2px
    style Autopoietic fill:#bbf,stroke:#333,stroke-width:2px
    style Integrations fill:#bfb,stroke:#333,stroke-width:2px
    style Security fill:#fbb,stroke:#333,stroke-width:2px
end
```

## Component Descriptions

| Component | Description |
|-----------|-------------|
| **CLI Interface** | Command-line interface for user interaction |
| **Configuration Manager** | Environment-driven configuration system |
| **Runtime Orchestrator** | Coordinates execution across subsystems |
| **Memory Subsystem** | Long-term and short-term memory management |
| **Autopoietic System** | Self-maintaining adapter framework |
| **Policy Engine** | Governance and security policies |
| **Verification** | Release-path and public release verification |