export interface CrowClawEvent<TPayload = unknown> {
  name: string;
  timestamp: string;
  payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (event: CrowClawEvent<TPayload>) => void | Promise<void>;

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  on<TPayload>(name: string, handler: EventHandler<TPayload>): () => void {
    const bucket = this.handlers.get(name) ?? new Set<EventHandler>();
    bucket.add(handler as EventHandler);
    this.handlers.set(name, bucket);

    return () => {
      bucket.delete(handler as EventHandler);
      if (bucket.size === 0) {
        this.handlers.delete(name);
      }
    };
  }

  async emit<TPayload>(name: string, payload: TPayload): Promise<void> {
    const bucket = this.handlers.get(name);
    if (!bucket || bucket.size === 0) {
      return;
    }

    const event: CrowClawEvent<TPayload> = {
      name,
      timestamp: new Date().toISOString(),
      payload
    };

    for (const handler of bucket) {
      await handler(event);
    }
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      listenerCount: [...this.handlers.values()].reduce((count, set) => count + set.size, 0),
      eventNames: [...this.handlers.keys()].sort()
    };
  }
}
