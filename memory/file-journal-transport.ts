import fs from "node:fs/promises";
import path from "node:path";

import type { MemoryQuery, MemoryRecord, MemoryTransport } from "./contracts.js";

interface JournalEntry {
  timestamp: string;
  record: MemoryRecord;
}

export class FileJournalMemoryTransport implements MemoryTransport {
  constructor(private readonly journalDir: string) {}

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.journalDir, { recursive: true });
  }

  private fileForNamespace(namespace: string): string {
    const safeNamespace = namespace.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(this.journalDir, `${safeNamespace}.ndjson`);
  }

  async read(query: MemoryQuery): Promise<MemoryRecord[]> {
    await this.ensureDir();
    const filePath = this.fileForNamespace(query.namespace);

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const entries = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JournalEntry)
      .map((entry) => entry.record);

    const search = query.search.trim().toLowerCase();
    const filtered = search.length === 0
      ? entries
      : entries.filter((record) => {
          const haystack = `${record.key} ${record.value} ${(record.tags ?? []).join(" ")}`.toLowerCase();
          return haystack.includes(search);
        });

    return filtered.slice(0, query.limit ?? 10);
  }

  async write(record: MemoryRecord): Promise<void> {
    await this.ensureDir();
    const filePath = this.fileForNamespace(record.namespace);
    const entry: JournalEntry = {
      timestamp: new Date().toISOString(),
      record
    };

    await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async getDiagnostics(): Promise<Record<string, unknown>> {
    await this.ensureDir();
    const files = await fs.readdir(this.journalDir);

    return {
      mode: "file-journal",
      journalDir: this.journalDir,
      namespaceFiles: files.sort()
    };
  }
}
