import type { EventBus } from "../kernel/event-bus.js";
import type { RuntimeModule } from "../kernel/contracts.js";

export interface AutopoiesisContext {
  sessionId: string;
  eventBus: EventBus;
}

export interface AutopoiesisSubsystem extends RuntimeModule {
  enabled: boolean;
  attach(context: AutopoiesisContext): Promise<void>;
  sample?(cycles?: number): Promise<Record<string, unknown>>;
}
