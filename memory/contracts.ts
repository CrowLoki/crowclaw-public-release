import type { RuntimeModule } from "../kernel/contracts.js";

export interface MemoryRecord {
  namespace: string;
  key: string;
  value: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryQuery {
  namespace: string;
  search: string;
  limit?: number;
}

export interface MemoryIndexRequest {
  rootPath: string;
}

export interface MemorySearchHit {
  score: number;
  sourcePath: string;
  text: string;
}

export interface MemoryTransport {
  read(query: MemoryQuery): Promise<MemoryRecord[]>;
  write(record: MemoryRecord): Promise<void>;
  getDiagnostics(): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface MemoryAdapter extends RuntimeModule {
  read(query: MemoryQuery): Promise<MemoryRecord[]>;
  write(record: MemoryRecord): Promise<void>;
}

export interface AdvancedMemoryAdapter extends MemoryAdapter {
  indexPath(request: MemoryIndexRequest): Promise<string>;
  semanticSearch(query: string, limit?: number): Promise<string>;
  status(): Promise<string>;
}
