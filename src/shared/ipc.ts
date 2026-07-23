// Shared IPC contract between main, preload and renderer.
// The spike keeps a single window; channels are flat strings.

import type { ThemeSpec } from './themes';

export type PresetId = 'shell' | 'claude' | 'codex' | 'gemini' | 'stress';

/** Persisted app settings (terminal theming + notifications). */
export interface AppSettings {
  themeName: string;
  lightThemeName: string;
  followSystem: boolean;
  notifyOnAttention: boolean;
}

export interface SpawnOptions {
  preset: PresetId;
  name: string;
  cols: number;
  rows: number;
  /** Owning workspace — terminals outlive a workspace switch (background). */
  workspaceId: string;
  /** Persistent node id, so a returning canvas can re-adopt this terminal. */
  stableId: string;
  cwd: string;
}

export interface SpawnResult {
  id: string;
}

/** A terminal already running for a workspace, offered for re-adoption. */
export interface LiveTerminal {
  id: string;
  stableId: string;
  name: string;
  preset: PresetId;
}

/** [terminalId, chunk] pairs, batched per animation-ish frame in main. */
export type DataBatch = Array<[string, string]>;

export interface ProcessMetric {
  type: string;
  pid: number;
  cpuPercent: number;
  memoryMB: number;
}

export type NodeKind = 'terminal' | 'note';

/** A node in the authoritative main-process graph (identity only, no layout). */
export interface GraphNode {
  id: string;
  name: string;
  kind: NodeKind;
  preset?: PresetId;
}

/** An undirected connection ("leash") between two node ids. */
export interface GraphEdge {
  id: string;
  a: string;
  b: string;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
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

interface BaseSpec {
  stableId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A terminal's persisted layout: identity + geometry (no live PTY state). */
export interface TerminalSpec extends BaseSpec {
  kind: 'terminal';
  preset: PresetId;
}

/** A note's persisted layout; its markdown body lives in a file keyed by id. */
export interface NoteSpec extends BaseSpec {
  kind: 'note';
}

export type NodeSpec = TerminalSpec | NoteSpec;

/** Everything needed to reconstruct a workspace's canvas. */
export interface WorkspaceLayout {
  nodes: NodeSpec[];
  /** Connections as unordered stable-id pairs. */
  edges: Array<[string, string]>;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  icon: string;
  /** Working directory terminals start in (PRODUCT.md §12). */
  cwd: string;
}

export interface WorkspaceFile extends WorkspaceMeta {
  layout: WorkspaceLayout;
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
  /** A terminal started/stopped needing attention (ARCHITECTURE.md §6). */
  onAttention(cb: (e: { id: string; value: boolean }) => void): () => void;
  /** Show an OS notification (renderer gates this by focus + setting). */
  notify(title: string, body: string): void;

  // Graph (authoritative in main; renderer reflects it).
  graph(): Promise<GraphSnapshot>;
  connect(a: string, b: string): Promise<void>;
  disconnect(edgeId: string): Promise<void>;
  onGraph(cb: (snapshot: GraphSnapshot) => void): () => void;

  /** Message history between two nodes (both directions), newest last. */
  history(a: string, b: string): Promise<HistoryEntry[]>;
  /** Fires when a leash's history gains an entry (renderer refreshes). */
  onHistory(cb: (pair: { a: string; b: string }) => void): () => void;

  // Workspaces (persisted in main under userData/workspaces).
  listWorkspaces(): Promise<{ workspaces: WorkspaceMeta[]; active: string }>;
  createWorkspace(name: string, icon: string): Promise<WorkspaceMeta>;
  loadWorkspace(id: string): Promise<WorkspaceFile>;
  saveLayout(id: string, layout: WorkspaceLayout): Promise<void>;
  renameWorkspace(
    id: string,
    name: string,
    icon: string,
    cwd?: string,
  ): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  setActiveWorkspace(id: string): Promise<void>;
  /** Terminals still running for a workspace (adopted instead of respawned). */
  listTerminals(workspaceId: string): Promise<LiveTerminal[]>;
  /** Release a workspace's terminals and notes; its layout is untouched. */
  hibernateWorkspace(workspaceId: string): Promise<void>;
  /** Native folder picker; resolves to the chosen path or ''. */
  pickDirectory(): Promise<string>;
  /** Open a path with the OS default handler (editor/file manager). */
  openPath(path: string): Promise<void>;

  // Notes. A note is a markdown file keyed by stableId, registered in the graph
  // so it can be wired to terminals (and other notes) and reached by the CLI.
  registerNote(id: string, name: string): Promise<string>; // ensures file+graph node; returns content
  renameNote(id: string, name: string): Promise<void>;
  readNote(id: string): Promise<string>;
  saveNote(id: string, content: string): Promise<void>;
  /** Remove the note's graph node but keep its file (workspace switch). */
  unloadNote(id: string): Promise<void>;
  /** Delete the note's graph node and file (user delete). */
  deleteNote(id: string): Promise<void>;
  /** Fires when a note's content changes out-of-band (e.g. an agent wrote it). */
  onNoteUpdate(cb: (id: string) => void): () => void;

  // Prompt composer.
  /** Submit a composed prompt to a terminal (atomic bracketed-paste inject). */
  sendPrompt(terminalId: string, text: string): void;
  getDraft(stableId: string): Promise<string>;
  setDraft(stableId: string, text: string): void;
  /** Write a pasted image to a temp file; returns the absolute path to embed. */
  saveDropImage(name: string, bytes: Uint8Array): Promise<string>;

  // Settings & themes.
  getSettings(): Promise<AppSettings>;
  setSettings(partial: Partial<AppSettings>): Promise<AppSettings>;
  /** Custom terminal themes read from userData/terminal-themes/*.json. */
  listCustomThemes(): Promise<ThemeSpec[]>;
}

declare global {
  interface Window {
    dw: DwApi;
  }
}
