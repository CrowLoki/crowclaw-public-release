declare module "node:os" {
  const os: {
    homedir(): string;
  };
  export default os;
}

declare module "node:path" {
  const path: {
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    dirname(filePath: string): string;
    basename(filePath: string): string;
  };
  export default path;
}

declare module "node:crypto" {
  const crypto: {
    randomUUID(): string;
  };
  export default crypto;
}

declare module "node:fs" {
  const fs: {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: string): string;
    writeFileSync(path: string, data: string, encoding: string): void;
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    copyFileSync(source: string, destination: string): void;
  };
  export default fs;
}

declare module "node:fs/promises" {
  const fs: {
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    readFile(path: string, encoding: string): Promise<string>;
    appendFile(path: string, data: string, encoding: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    writeFile(path: string, data: string, encoding: string): Promise<void>;
  };
  export default fs;
}

declare module "node:child_process" {
  export interface SpawnSyncReturns<T> {
    status: number | null;
    stdout: T;
    stderr: T;
    error?: Error;
  }

  export function spawnSync(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      encoding?: string;
      env?: Record<string, string | undefined>;
      input?: string;
    }
  ): SpawnSyncReturns<string>;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare module "node:readline/promises" {
  export function createInterface(options: {
    input: unknown;
    output: unknown;
  }): {
    question(prompt: string): Promise<string>;
    close(): void;
  };
}

declare class URL {
  constructor(input: string, base?: string | URL);
}

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdin: unknown;
  stdout: {
    isTTY?: boolean;
    write(value: string): boolean;
  };
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}
