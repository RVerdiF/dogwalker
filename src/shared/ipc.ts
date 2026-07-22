// Shared IPC contract between main, preload and renderer.
// The spike keeps a single window; channels are flat strings.

export type PresetId = 'shell' | 'claude' | 'codex' | 'gemini' | 'stress';

export interface SpawnOptions {
  preset: PresetId;
  name: string;
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

/** A node in the authoritative main-process graph (identity only, no layout). */
export interface GraphTerminal {
  id: string;
  name: string;
  preset: PresetId;
}

/** An undirected connection ("leash") between two node ids. */
export interface GraphEdge {
  id: string;
  a: string;
  b: string;
}

export interface GraphSnapshot {
  terminals: GraphTerminal[];
  edges: GraphEdge[];
}

/** One logged line of the ask/reply/check conversation on a leash. */
export interface HistoryEntry {
  ts: number;
  kind: 'ask' | 'reply' | 'check';
  from: string;
  to: string;
  msgId?: string;
  body: string;
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

  // Graph (authoritative in main; renderer reflects it).
  graph(): Promise<GraphSnapshot>;
  connect(a: string, b: string): Promise<void>;
  disconnect(edgeId: string): Promise<void>;
  onGraph(cb: (snapshot: GraphSnapshot) => void): () => void;

  /** Message history between two nodes (both directions), newest last. */
  history(a: string, b: string): Promise<HistoryEntry[]>;
  /** Fires when a leash's history gains an entry (renderer refreshes). */
  onHistory(cb: (pair: { a: string; b: string }) => void): () => void;
}

declare global {
  interface Window {
    dw: DwApi;
  }
}
