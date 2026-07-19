// Shared IPC contract between main, preload and renderer.
// The spike keeps a single window; channels are flat strings.

export type PresetId = 'shell' | 'claude' | 'codex' | 'gemini' | 'stress';

export interface SpawnOptions {
  preset: PresetId;
  cols: number;
  rows: number;
}

export interface SpawnResult {
  id: string;
}

/** [terminalId, chunk] pairs, batched per animation-ish frame in main. */
export type DataBatch = Array<[string, string]>;

export interface ProcessMetric {
  type: string;
  pid: number;
  cpuPercent: number;
  memoryMB: number;
}

export interface DwApi {
  spawn(opts: SpawnOptions): Promise<SpawnResult>;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  /** Serialized screen+scrollback from the main-process headless mirror. */
  serialize(id: string): Promise<string>;
  metrics(): Promise<ProcessMetric[]>;
  onData(cb: (batch: DataBatch) => void): () => void;
  onExit(cb: (id: string) => void): () => void;
}

declare global {
  interface Window {
    dw: DwApi;
  }
}
