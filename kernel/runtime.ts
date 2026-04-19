import crypto from "node:crypto";

import type { CrowClawConfig, RuntimeModule } from "./contracts.js";
import { EventBus } from "./event-bus.js";
import { buildRuntimeManifest } from "./manifest.js";
import { ModuleRegistry } from "./registry.js";
import type { AutopoiesisSubsystem } from "../autopoiesis/contracts.js";
import type { HostIntegration } from "../integrations/contracts.js";
import { IntegrationRegistry } from "../integrations/registry.js";
import type { AdvancedMemoryAdapter, MemoryAdapter, MemoryIndexRequest, MemoryQuery, MemoryRecord } from "../memory/contracts.js";
import type { ModelRequest, ModelResponse, ProviderAdapter } from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { ProviderRouter } from "../providers/router.js";

export interface CrowClawRuntimeOptions {
  config: CrowClawConfig;
  providers?: ProviderAdapter[];
  memory?: MemoryAdapter;
  autopoiesis?: AutopoiesisSubsystem;
  integrations?: HostIntegration[];
}

export class CrowClawRuntime implements RuntimeModule {
  readonly descriptor = {
    id: "kernel.runtime",
    kind: "kernel" as const,
    version: "0.2.0",
    description: "Provider-neutral CrowClaw runtime kernel.",
    capabilities: ["config", "events", "modules", "manifest", "provider-routing"]
  };

  readonly eventBus = new EventBus();
  readonly modules = new ModuleRegistry();
  readonly providers = new ProviderRegistry();
  readonly integrations = new IntegrationRegistry();
  readonly sessionId = crypto.randomUUID();
  readonly providerRouter: ProviderRouter;

  constructor(private readonly options: CrowClawRuntimeOptions) {
    this.providerRouter = new ProviderRouter(this.providers, options.config, this.eventBus);
    this.modules.register(this);

    for (const provider of options.providers ?? []) {
      this.providers.register(provider);
      this.modules.register(provider);
    }

    if (options.memory) {
      this.modules.register(options.memory);
    }

    if (options.autopoiesis) {
      this.modules.register(options.autopoiesis);
    }

    for (const integration of options.integrations ?? []) {
      this.integrations.register(integration);
      this.modules.register(integration);
    }
  }

  get config(): CrowClawConfig {
    return this.options.config;
  }

  async start(): Promise<void> {
    await this.eventBus.emit("runtime.starting", {
      sessionId: this.sessionId,
      product: this.options.config.productName
    });

    for (const module of this.modules.list()) {
      if (module.descriptor.id === this.descriptor.id || !module.start) {
        continue;
      }
      await module.start();
    }

    for (const integration of this.options.integrations ?? []) {
      await integration.connect({ workspaceDir: this.options.config.workspaceDir });
    }

    if (this.options.autopoiesis) {
      await this.options.autopoiesis.attach({
        sessionId: this.sessionId,
        eventBus: this.eventBus
      });
    }

    await this.eventBus.emit("runtime.started", {
      sessionId: this.sessionId,
      manifest: this.getManifest()
    });
  }

  async stop(): Promise<void> {
    await this.eventBus.emit("runtime.stopping", { sessionId: this.sessionId });

    for (const module of [...this.modules.list()].reverse()) {
      if (module.descriptor.id === this.descriptor.id || !module.stop) {
        continue;
      }
      await module.stop();
    }

    await this.eventBus.emit("runtime.stopped", { sessionId: this.sessionId });
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    return this.providerRouter.generate({
      ...request,
      model: request.model || this.options.config.defaultModel || "default"
    });
  }

  async memoryRead(query: MemoryQuery): Promise<MemoryRecord[]> {
    if (!this.options.memory) {
      throw new Error("No memory adapter configured.");
    }

    await this.eventBus.emit("memory.read.requested", query);
    const result = await this.options.memory.read(query);
    await this.eventBus.emit("memory.read.completed", {
      namespace: query.namespace,
      count: result.length
    });
    return result;
  }

  async memoryWrite(record: MemoryRecord): Promise<void> {
    if (!this.options.memory) {
      throw new Error("No memory adapter configured.");
    }

    await this.eventBus.emit("memory.write.requested", {
      namespace: record.namespace,
      key: record.key
    });
    await this.options.memory.write(record);
    await this.eventBus.emit("memory.write.completed", {
      namespace: record.namespace,
      key: record.key
    });
  }

  async memoryIndex(request: MemoryIndexRequest): Promise<string> {
    const adapter = this.options.memory as AdvancedMemoryAdapter | undefined;
    if (!adapter?.indexPath) {
      throw new Error("This runtime does not support CrowQuant indexing.");
    }

    return adapter.indexPath(request);
  }

  async memorySemanticSearch(query: string, limit?: number): Promise<string> {
    const adapter = this.options.memory as AdvancedMemoryAdapter | undefined;
    if (!adapter?.semanticSearch) {
      throw new Error("This runtime does not support CrowQuant semantic search.");
    }

    return adapter.semanticSearch(query, limit);
  }

  async memoryStatus(): Promise<string> {
    const adapter = this.options.memory as AdvancedMemoryAdapter | undefined;
    if (!adapter?.status) {
      throw new Error("This runtime does not support CrowQuant status.");
    }

    return adapter.status();
  }

  getManifest() {
    return buildRuntimeManifest(this.options.config, this.modules);
  }

  async getDiagnostics(): Promise<Record<string, unknown>> {
    return {
      sessionId: this.sessionId,
      defaultProvider: this.options.config.defaultProvider,
      defaultModel: this.options.config.defaultModel,
      features: {
        crowquant: this.options.config.crowquant,
        autopoiesis: this.options.config.autopoiesis
      },
      providers: this.providers.list().map((provider) => provider.providerId),
      integrations: this.integrations.list().map((integration) => integration.descriptor.id),
      eventBus: this.eventBus.getDiagnostics(),
      memory: this.options.memory ? await this.options.memory.getDiagnostics() : null,
      autopoiesis: this.options.autopoiesis ? await this.options.autopoiesis.getDiagnostics() : null
    };
  }
}
