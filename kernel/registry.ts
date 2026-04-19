import type { ModuleDescriptor, RuntimeModule } from "./contracts.js";

export class ModuleRegistry {
  private readonly modules = new Map<string, RuntimeModule>();

  register(module: RuntimeModule): void {
    if (this.modules.has(module.descriptor.id)) {
      throw new Error(`Module already registered: ${module.descriptor.id}`);
    }

    this.modules.set(module.descriptor.id, module);
  }

  list(): RuntimeModule[] {
    return [...this.modules.values()].sort((a, b) => a.descriptor.id.localeCompare(b.descriptor.id));
  }

  listDescriptors(): ModuleDescriptor[] {
    return this.list().map((module) => module.descriptor);
  }

  getByKind(kind: ModuleDescriptor["kind"]): RuntimeModule[] {
    return this.list().filter((module) => module.descriptor.kind === kind);
  }
}
