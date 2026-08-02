// Shared IPC contract between main, preload and renderer.
// The spike keeps a single window; channels are flat strings.

import type { ThemeSpec } from './themes';

export type PresetId = string;
export interface AgentPreset { id: PresetId; name: string; icon: string; command: string; builtin?: boolean; }
export interface Role { id: string; name: string; instructions: string; }
export type ContractScalar = 'string' | 'number' | 'boolean' | 'array';
export interface ResponseContract {
  id: string;
  name: string;
  instructions: string;
  /** Optional follow-up delivered when captured output fails validation. */
  rejectionPrompt?: string;
  schema: { required: string[]; fields: Record<string, ContractScalar> };
}

/** Persisted app settings (terminal theming + notifications). */
export interface AppSettings {
  themeName: string;
  lightThemeName: string;
  followSystem: boolean;
  notifyOnAttention: boolean;
  /** Collapse the workspace rail to icon-only (PRODUCT.md §12). */
  miniSidebar: boolean;
}

export interface SpawnOptions {
  preset: PresetId;
  name: string;
  cols: number;
  rows: number;
  /** Owning workspace — terminals outlive a workspace switch (background). */
  workspaceId: string;
  /** Human floor label ('ground' or a floor name) — shown in `list` (§10). */
  floorName?: string;
  /** Persistent node id, so a returning canvas can re-adopt this terminal. */
  stableId: string;
  cwd: string;
  /** 0 = off. Above it, the heaviest child process is killed. */
  memoryLimitMB?: number;
  /** Flag this terminal as a Walker (manager agent, PRODUCT.md §5.4). */
  walker?: boolean;
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

export type NodeKind = 'terminal' | 'note' | 'portal';

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
  /** Groups the individual leash entries created by one team ask. */
  broadcastId?: string;
  body: string;
}

interface BaseSpec {
  stableId: string;
  name: string;
  /** Relative to the parent group when `parentStableId` is set. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Group this node belongs to, if any (PRODUCT.md §3.3). */
  parentStableId?: string;
}

/** A terminal's persisted layout: identity + geometry (no live PTY state). */
export interface TerminalSpec extends BaseSpec {
  kind: 'terminal';
  preset: PresetId;
  roleId?: string;
  /** Runaway guard in MB; 0/absent = off. */
  memoryLimitMB?: number;
  /** Manager agent (PRODUCT.md §5.4): may recruit/dismiss/assign teammates. */
  walker?: boolean;
}

/** A note's persisted layout; its markdown body lives in a file keyed by id. */
export interface NoteSpec extends BaseSpec {
  kind: 'note';
}

/** A labeled frame binding nodes; pure layout, never a graph/CLI node. */
export interface GroupSpec extends BaseSpec {
  kind: 'group';
}

/** A File Tree node rooted at a directory (PRODUCT.md §8). Pure layout. */
export interface FileTreeSpec extends BaseSpec {
  kind: 'filetree';
  /** Directory the tree is rooted at; defaults to the workspace cwd. */
  rootPath: string;
}

/** A read-only file preview dropped on the canvas (PRODUCT.md §8). */
export interface PreviewSpec extends BaseSpec {
  kind: 'preview';
  filePath: string;
}

/** An embedded, automatable browser (PRODUCT.md §9). */
export interface PortalSpec extends BaseSpec {
  kind: 'portal';
  url: string;
  /** Session partition; isolated (own stableId) unless linked to share one. */
  partition: string;
}

export type NodeSpec =
  | TerminalSpec
  | NoteSpec
  | GroupSpec
  | FileTreeSpec
  | PreviewSpec
  | PortalSpec;

/** A portal's navigation state, pushed to the renderer to drive its URL bar. */
export interface PortalState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

/** One entry in a directory listing (File Tree). */
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  /** Modified time, ms since epoch. */
  mtime: number;
}

/** A directory's immediate children, or an error if it couldn't be read. */
export interface DirListing {
  path: string;
  entries: FileEntry[];
  error?: string;
}

/** A content-search hit: a matching line in a file (File Tree search). */
export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

/** A changed file in `git status` (porcelain codes for index + worktree). */
export interface GitFileStatus {
  path: string;
  /** Staged (index) status code, e.g. 'M', 'A', 'D', ' '. */
  index: string;
  /** Worktree status code. */
  work: string;
}

/** Working-tree summary for a File Tree's repo (PRODUCT.md §8). */
export interface GitStatus {
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  error?: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
}

/** One commit for the graph view; `parents`/`refs` drive the lanes. */
export interface GitCommit {
  hash: string;
  parents: string[];
  refs: string[];
  author: string;
  subject: string;
  /** Commit time, seconds since epoch. */
  time: number;
}

/** The result of a git operation the branch menu invokes. */
export interface GitResult {
  ok: boolean;
  output: string;
}

/** Everything needed to reconstruct a workspace's canvas. */
export interface WorkspaceLayout {
  nodes: NodeSpec[];
  /** Connections as unordered stable-id pairs. */
  edges: Array<[string, string]>;
  /** Camera position, so returning to a workspace looks where you left off. */
  viewport?: { x: number; y: number; zoom: number };
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  icon: string;
  /** Working directory terminals start in (PRODUCT.md §12). */
  cwd: string;
  /** Keep CLAUDE.md ↔ AGENTS.md in sync in the cwd (PRODUCT.md §12). */
  syncAgentDocs?: boolean;
}

/**
 * A floor: a git-worktree layer of the workspace's repo with its own canvas
 * (PRODUCT.md §10). The workspace's own `layout`/`cwd` is the implicit "ground".
 */
export interface FloorRecord {
  id: string;
  name: string;
  branch: string;
  /** Absolute worktree path; terminals on this floor are rooted here. */
  path: string;
  layout: WorkspaceLayout;
}

/** Floor identity without its (potentially large) layout, for listing. */
export interface FloorMeta {
  id: string;
  name: string;
  branch: string;
  path: string;
}

/** A scheduled prompt aimed at an agent terminal (PRODUCT.md §11). */
export interface Routine {
  id: string;
  workspaceId: string;
  name: string;
  /** The agent terminal this drives, by persistent stableId. */
  targetStableId: string;
  /** Prompt text; `&&`/newlines chain steps that wait on turn completion. */
  prompt: string;
  intervalMs: number;
  enabled: boolean;
  status: 'idle' | 'running' | 'paused';
  lastRun?: number;
  lastError?: string;
}

/** The outcome of running a floor lifecycle hook (PRODUCT.md §10). */
export interface HookResult {
  /** False when no such hook is configured. */
  ran: boolean;
  ok: boolean;
  output: string;
}

export interface WorkspaceFile extends WorkspaceMeta {
  layout: WorkspaceLayout;
  floors?: FloorRecord[];
  /** 'ground' or a floor id; which layer is shown. */
  activeFloor?: string;
}

/**
 * One row in the workspace rail: either a workspace or a named divider that
 * opens a section (PRODUCT.md §12 — folders / group dividers). The rail is a
 * flat ordered list; dividers partition it into labeled groups.
 */
export type SidebarEntry =
  | { kind: 'workspace'; id: string }
  | { kind: 'divider'; id: string; label: string };

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
  /** Runaway guard for a terminal, in MB (0 turns it off). */
  setMemoryLimit(id: string, mb: number): void;
  /** Flag/unflag a live terminal as a Walker (manager agent, §5.4). */
  setWalker(id: string, walker: boolean): void;
  listPresets(): Promise<AgentPreset[]>;
  createPreset(input: Pick<AgentPreset, 'name' | 'icon' | 'command'>): Promise<AgentPreset>;
  updatePreset(id: string, input: Pick<AgentPreset, 'name' | 'icon' | 'command'>): Promise<AgentPreset | null>;
  deletePreset(id: string): Promise<boolean>;
  listRoles(): Promise<Role[]>;
  createRole(input: Pick<Role, 'name' | 'instructions'>): Promise<Role>;
  updateRole(id: string, input: Pick<Role, 'name' | 'instructions'>): Promise<Role | null>;
  deleteRole(id: string): Promise<boolean>;
  listContracts(): Promise<ResponseContract[]>;
  createContract(input: Omit<ResponseContract, 'id'>): Promise<ResponseContract>;
  updateContract(id: string, input: Omit<ResponseContract, 'id'>): Promise<ResponseContract | null>;
  deleteContract(id: string): Promise<boolean>;
  assignTerminalRole(id: string, roleId?: string): Promise<string>;
  /** A Walker recruited a teammate — the canvas adopts it near the Walker. */
  onRecruited(
    cb: (e: {
      id: string;
      stableId: string;
      name: string;
      preset: PresetId;
      roleId?: string;
      walkerId: string;
      workspaceId: string;
    }) => void,
  ): () => void;
  /** A recruit was dismissed — the canvas removes its node. */
  onDismissed(cb: (id: string) => void): () => void;
  /** A recruit was reassigned — the canvas relabels its node. */
  onReassigned(cb: (e: { id: string; name: string }) => void): () => void;

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
  listWorkspaces(): Promise<{
    workspaces: WorkspaceMeta[];
    active: string;
    sidebar: SidebarEntry[];
  }>;
  createWorkspace(name: string, icon: string): Promise<WorkspaceMeta>;
  loadWorkspace(id: string): Promise<WorkspaceFile>;
  saveLayout(id: string, layout: WorkspaceLayout): Promise<void>;
  /** Layer-aware layout load: floorId 'ground' = the workspace's own layout. */
  loadLayer(workspaceId: string, floorId: string): Promise<WorkspaceLayout>;
  saveLayer(workspaceId: string, floorId: string, layout: WorkspaceLayout): Promise<void>;

  // Floors (git-worktree layers of a workspace, PRODUCT.md §10).
  listFloors(workspaceId: string): Promise<{ floors: FloorMeta[]; active: string }>;
  /** The outcome of running a floor lifecycle hook (PRODUCT.md §10). */
  // (defined here for reuse by createFloor + hookRun below)
  /** Create a floor: add a worktree on a new/existing branch, own canvas. */
  createFloor(
    workspaceId: string,
    opts: { name: string; branch: string; createBranch: boolean; cloneGround: boolean },
  ): Promise<{
    ok: boolean;
    error?: string;
    floor?: FloorMeta;
    setup?: HookResult;
  }>;
  /** Run the project's `run` hook for a floor (on demand). */
  runFloorHook(workspaceId: string, floorId: string): Promise<HookResult>;
  /** Remove a floor: drop its worktree (and optionally its branch). */
  removeFloor(
    workspaceId: string,
    floorId: string,
    deleteBranch: boolean,
  ): Promise<{ ok: boolean; error?: string }>;
  setActiveFloor(workspaceId: string, floorId: string): Promise<void>;
  /** Drop floor records whose worktree is gone + `git worktree prune` (recovery). */
  reconcileFloors(workspaceId: string): Promise<{ floors: FloorMeta[]; active: string }>;
  /** Local branches of the workspace repo (for the create dialog). */
  repoBranches(workspaceId: string): Promise<string[]>;
  /** Pre-land state for the Land dialog (branches, diff stat, clean checks). */
  landInfo(
    workspaceId: string,
    floorId: string,
  ): Promise<{
    floorBranch: string;
    groundBranch: string;
    branches: string[];
    diffStat: string;
    floorClean: boolean;
    groundClean: boolean;
  }>;
  /**
   * Land a floor: merge its branch into the target, then remove the worktree
   * (and optionally its branch). A conflict is surfaced and safely aborted —
   * the tree is never left half-merged.
   */
  land(
    workspaceId: string,
    floorId: string,
    opts: { targetBranch: string; deleteBranch: boolean },
  ): Promise<{ ok: boolean; stage?: string; error?: string }>;
  renameWorkspace(
    id: string,
    name: string,
    icon: string,
    cwd?: string,
  ): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  setActiveWorkspace(id: string): Promise<void>;
  /** Toggle CLAUDE.md ↔ AGENTS.md sync for a workspace (PRODUCT.md §12). */
  setSyncAgentDocs(id: string, enabled: boolean): Promise<void>;
  /** Terminals still running for a workspace (adopted instead of respawned). */
  listTerminals(workspaceId: string): Promise<LiveTerminal[]>;
  /** Release a workspace's terminals and notes; its layout is untouched. */
  hibernateWorkspace(workspaceId: string): Promise<void>;
  /** Add a named divider (section header) at the end of the rail. */
  addDivider(label: string): Promise<void>;
  /** Rename a divider. */
  renameDivider(id: string, label: string): Promise<void>;
  /** Remove a divider; the workspaces below merge into the previous section. */
  removeDivider(id: string): Promise<void>;
  /** Persist a reordered rail (renderer computes it with pure sidebar ops). */
  reorderSidebar(entries: SidebarEntry[]): Promise<void>;
  /** Native folder picker; resolves to the chosen path or ''. */
  pickDirectory(): Promise<string>;
  /** Open a path with the OS default handler (editor/file manager). */
  openPath(path: string): Promise<void>;

  // File Tree file-system access (main is the only process that touches disk).
  readDir(dir: string): Promise<DirListing>;
  readFile(file: string): Promise<string>;
  writeFile(file: string, content: string): Promise<void>;
  /** Read an image as a `data:` URI for previewing (empty string if it fails). */
  readImage(file: string): Promise<string>;
  /** Create a file or directory (parents made as needed); returns its path. */
  createEntry(target: string, isDir: boolean): Promise<string>;
  /** Rename or move an entry. */
  renameEntry(from: string, to: string): Promise<void>;
  /** Delete an entry (recursive for directories). */
  removeEntry(target: string): Promise<void>;
  statEntry(target: string): Promise<FileEntry | null>;
  // Portals (embedded browsers; the view lives in main, geometry in renderer).
  /** Register the portal as a graph node so it can be leashed + CLI-reached. */
  portalRegister(id: string, name: string): Promise<void>;
  /** Remove the portal's graph node (workspace switch / close). */
  portalUnregister(id: string): Promise<void>;
  portalCreate(id: string, partition: string, url: string): void;
  /** Align the overlaid browser view to the node's on-screen body rect. */
  portalSetBounds(
    id: string,
    rect: { x: number; y: number; width: number; height: number },
    zoom: number,
    visible: boolean,
  ): void;
  portalNavigate(id: string, url: string): void;
  portalBack(id: string): void;
  portalForward(id: string): void;
  portalReload(id: string): void;
  portalDestroy(id: string): void;
  portalState(id: string): Promise<PortalState | null>;
  /** Page navigated (self- or user-driven); renderer refreshes the URL bar. */
  onPortalNav(cb: (e: { id: string } & PortalState) => void): () => void;
  /** An agent created a portal via the CLI; the canvas adds a node for it. */
  onPortalCreated(
    cb: (e: { id: string; name: string; url: string; partition: string }) => void,
  ): () => void;

  /** All file paths under a root (recursive, skips heavy dirs) for fuzzy search. */
  searchFiles(root: string, limit: number): Promise<string[]>;
  /** Case-insensitive content search under a root (`>`-prefixed search). */
  grepFiles(root: string, query: string, limit: number): Promise<SearchHit[]>;

  // Git, scoped to a File Tree's directory (system `git`, ARCHITECTURE.md §1).
  gitStatus(cwd: string): Promise<GitStatus>;
  gitBranches(cwd: string): Promise<GitBranch[]>;
  gitLog(cwd: string, limit: number): Promise<GitCommit[]>;
  /** Unified diff of uncommitted changes (whole repo, or one file). */
  gitDiff(cwd: string, file?: string): Promise<string>;
  gitCommit(cwd: string, message: string): Promise<GitResult>;
  gitCheckout(cwd: string, branch: string): Promise<GitResult>;
  gitCreateBranch(cwd: string, name: string): Promise<GitResult>;
  gitMerge(cwd: string, branch: string): Promise<GitResult>;
  gitStash(cwd: string): Promise<GitResult>;
  gitStashPop(cwd: string): Promise<GitResult>;
  gitFetch(cwd: string): Promise<GitResult>;
  gitPull(cwd: string): Promise<GitResult>;
  gitPush(cwd: string): Promise<GitResult>;

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
  /** Store a pasted image beside the note; returns its absolute path to embed. */
  saveNoteImage(id: string, name: string, bytes: Uint8Array): Promise<string>;
  /** Fires when a note's content changes out-of-band (e.g. an agent wrote it). */
  onNoteUpdate(cb: (id: string) => void): () => void;

  // Prompt composer.
  /** Submit a composed prompt to a terminal (atomic bracketed-paste inject). */
  sendPrompt(terminalId: string, text: string): void;
  getDraft(stableId: string): Promise<string>;
  setDraft(stableId: string, text: string): void;
  /** Write a pasted image to a temp file; returns the absolute path to embed. */
  saveDropImage(name: string, bytes: Uint8Array): Promise<string>;

  // Routines (scheduled prompts to agents, PRODUCT.md §11).
  listRoutines(workspaceId: string): Promise<Routine[]>;
  createRoutine(
    workspaceId: string,
    opts: { name: string; targetStableId: string; prompt: string; intervalMs: number },
  ): Promise<Routine>;
  updateRoutine(id: string, partial: Partial<Routine>): Promise<Routine | null>;
  setRoutineEnabled(id: string, enabled: boolean): Promise<Routine | null>;
  runRoutineNow(id: string): Promise<void>;
  deleteRoutine(id: string): Promise<void>;
  /** Fires when a routine's status changes (renderer updates the indicator). */
  onRoutineUpdate(cb: (r: Routine) => void): () => void;

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
