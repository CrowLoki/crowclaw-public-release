import type { MemoryQuery, MemoryRecord, MemoryTransport } from "./contracts.js";

export class InProcessMemoryTransport implements MemoryTransport {
  private readonly records = new Map<string, MemoryRecord[]>();

  async read(query: MemoryQuery): Promise<MemoryRecord[]> {
    const records = this.records.get(query.namespace) ?? [];
    const search = query.search.trim().toLowerCase();
    const filtered = search.length === 0
      ? records
      : records.filter((record) => {
          const haystack = `${record.key} ${record.value} ${(record.tags ?? []).join(" ")}`.toLowerCase();
          return haystack.includes(search);
        });

    return filtered.slice(0, query.limit ?? 10);
  }

  async write(record: MemoryRecord): Promise<void> {
    const existing = this.records.get(record.namespace) ?? [];
    existing.push(record);
    this.records.set(record.namespace, existing);
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      mode: "in-memory",
      namespaces: [...this.records.keys()].sort(),
      recordCount: [...this.records.values()].reduce((count, bucket) => count + bucket.length, 0)
    };
  }
}
