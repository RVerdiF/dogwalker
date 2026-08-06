import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  FloorMeta,
  FloorRecord,
  SidebarEntry,
  WorkspaceFile,
  WorkspaceLayout,
  WorkspaceMeta,
} from '../shared/ipc';

interface Index {
  active: string;
  /** Flat rail: workspaces + dividers, in display order (PRODUCT.md §12). */
  entries: SidebarEntry[];
  /** @deprecated pre-divider format; migrated to `entries` on read. */
  order?: string[];
}

const EMPTY_LAYOUT: WorkspaceLayout = { nodes: [], edges: [] };

/**
 * Persists workspaces as plain JSON on disk (PRODUCT.md §14 — open formats):
 * one `<id>.json` per workspace holding metadata + layout, plus `index.json`
 * tracking order and the active workspace. Layout is a renderer-assembled
 * snapshot (node specs + connections as stable-id pairs); main just stores it.
 */
export class WorkspaceStore {
  private dir: string;
  private indexPath: string;

  constructor(userData: string) {
    this.dir = path.join(userData, 'workspaces');
    this.indexPath = path.join(this.dir, 'index.json');
    fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.indexPath)) {
      const first = this.writeWorkspace(this.blank('My Workspace', ''));
      this.writeIndex({
        active: first.id,
        entries: [{ kind: 'workspace', id: first.id }],
      });
    }
  }

  private newDividerId(): string {
    return 'd' + crypto.randomBytes(4).toString('hex');
  }

  private blank(name: string, icon: string): WorkspaceFile {
    return {
      id: 'w' + crypto.randomBytes(4).toString('hex'),
      name,
      icon,
      cwd: os.homedir(),
      layout: { ...EMPTY_LAYOUT },
    };
  }

  private filePath(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private readIndex(): Index {
    const raw = JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as Index;
    if (!raw.entries) {
      // Migrate the pre-divider `{ order }` format.
      raw.entries = (raw.order ?? []).map((id) => ({
        kind: 'workspace' as const,
        id,
      }));
    }
    delete raw.order;
    return raw;
  }

  /** Workspace ids present in the rail, in display order. */
  private wsIds(index: Index): string[] {
    return index.entries
      .filter((e) => e.kind === 'workspace')
      .map((e) => e.id);
  }

  private writeIndex(index: Index): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
  }

  private writeWorkspace(ws: WorkspaceFile): WorkspaceFile {
    fs.writeFileSync(this.filePath(ws.id), JSON.stringify(ws, null, 2));
    return ws;
  }

  private read(id: string): WorkspaceFile {
    return JSON.parse(fs.readFileSync(this.filePath(id), 'utf8')) as WorkspaceFile;
  }

  list(): { workspaces: WorkspaceMeta[]; active: string; sidebar: SidebarEntry[] } {
    const index = this.readIndex();
    // Drop rail entries for workspaces whose files vanished; keep dividers.
    const sidebar = index.entries.filter(
      (e) => e.kind === 'divider' || fs.existsSync(this.filePath(e.id)),
    );
    const workspaces = sidebar
      .filter((e): e is Extract<SidebarEntry, { kind: 'workspace' }> =>
        e.kind === 'workspace',
      )
      .map((e) => {
        const { name, icon, cwd, syncAgentDocs } = this.read(e.id);
        return { id: e.id, name, icon, cwd: cwd || os.homedir(), syncAgentDocs };
      });
    return { workspaces, active: index.active, sidebar };
  }

  create(name: string, icon: string): WorkspaceMeta {
    const ws = this.writeWorkspace(this.blank(name || 'Workspace', icon || ''));
    const index = this.readIndex();
    index.entries.push({ kind: 'workspace', id: ws.id });
    index.active = ws.id;
    this.writeIndex(index);
    return { id: ws.id, name: ws.name, icon: ws.icon, cwd: ws.cwd };
  }

  addDivider(label: string): void {
    const index = this.readIndex();
    index.entries.push({
      kind: 'divider',
      id: this.newDividerId(),
      label: label || 'Section',
    });
    this.writeIndex(index);
  }

  renameDivider(id: string, label: string): void {
    const index = this.readIndex();
    for (const e of index.entries) {
      if (e.kind === 'divider' && e.id === id) e.label = label || e.label;
    }
    this.writeIndex(index);
  }

  removeDivider(id: string): void {
    const index = this.readIndex();
    index.entries = index.entries.filter(
      (e) => !(e.kind === 'divider' && e.id === id),
    );
    this.writeIndex(index);
  }

  /**
   * Persist a renderer-reordered rail. Sanitized against the current index so a
   * stale renderer can't invent, drop, or duplicate entries: unknown ids are
   * discarded and any current entry missing from the input is appended.
   */
  reorder(entries: SidebarEntry[]): void {
    const index = this.readIndex();
    const known = new Map(index.entries.map((e) => [e.id, e]));
    const seen = new Set<string>();
    const next: SidebarEntry[] = [];
    for (const e of entries) {
      const cur = known.get(e.id);
      if (cur && !seen.has(cur.id)) {
        next.push(cur);
        seen.add(cur.id);
      }
    }
    for (const e of index.entries) {
      if (!seen.has(e.id)) next.push(e);
    }
    index.entries = next;
    this.writeIndex(index);
  }

  load(id: string): WorkspaceFile {
    return this.read(id);
  }

  saveLayout(id: string, layout: WorkspaceLayout): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const ws = this.read(id);
    ws.layout = layout;
    this.writeWorkspace(ws);
  }

  rename(id: string, name: string, icon: string, cwd?: string): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const ws = this.read(id);
    ws.name = name;
    ws.icon = icon;
    if (cwd !== undefined) ws.cwd = cwd || os.homedir();
    this.writeWorkspace(ws);
  }

  remove(id: string): void {
    const index = this.readIndex();
    const ids = this.wsIds(index);
    if (ids.length <= 1) return; // keep at least one workspace
    index.entries = index.entries.filter(
      (e) => !(e.kind === 'workspace' && e.id === id),
    );
    if (index.active === id) {
      index.active = this.wsIds(index)[0];
    }
    this.writeIndex(index);
    try {
      fs.unlinkSync(this.filePath(id));
    } catch {
      /* already gone */
    }
  }

  setActive(id: string): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const index = this.readIndex();
    index.active = id;
    this.writeIndex(index);
  }

  setSyncAgentDocs(id: string, enabled: boolean): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const ws = this.read(id);
    ws.syncAgentDocs = enabled;
    this.writeWorkspace(ws);
  }

  /** Workspaces that have doc-sync enabled — armed on startup. */
  syncEnabled(): Array<{ id: string; cwd: string }> {
    const index = this.readIndex();
    const out: Array<{ id: string; cwd: string }> = [];
    for (const wsId of this.wsIds(index)) {
      if (!fs.existsSync(this.filePath(wsId))) continue;
      const ws = this.read(wsId);
      if (ws.syncAgentDocs) out.push({ id: wsId, cwd: ws.cwd });
    }
    return out;
  }

  // ---- Floors (git-worktree layers, PRODUCT.md §10) -----------------------

  /** Layer-aware layout read: 'ground' is the workspace's own layout. */
  loadLayer(id: string, floorId: string): WorkspaceLayout {
    if (!fs.existsSync(this.filePath(id))) return { ...EMPTY_LAYOUT };
    const ws = this.read(id);
    if (floorId === 'ground') return ws.layout;
    const floor = (ws.floors ?? []).find((f) => f.id === floorId);
    return floor ? floor.layout : { ...EMPTY_LAYOUT };
  }

  saveLayer(id: string, floorId: string, layout: WorkspaceLayout): void {
    if (!fs.existsSync(this.filePath(id))) return;
    if (floorId === 'ground') return this.saveLayout(id, layout);
    const ws = this.read(id);
    const floor = (ws.floors ?? []).find((f) => f.id === floorId);
    if (!floor) return;
    floor.layout = layout;
    this.writeWorkspace(ws);
  }

  listFloors(id: string): { floors: FloorMeta[]; active: string } {
    if (!fs.existsSync(this.filePath(id))) return { floors: [], active: 'ground' };
    const ws = this.read(id);
    const floors = (ws.floors ?? []).map(({ id: fid, name, branch, path }) => ({
      id: fid,
      name,
      branch,
      path,
    }));
    return { floors, active: ws.activeFloor ?? 'ground' };
  }

  addFloor(id: string, record: FloorRecord): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const ws = this.read(id);
    ws.floors = [...(ws.floors ?? []), record];
    ws.activeFloor = record.id;
    this.writeWorkspace(ws);
  }

  removeFloorRecord(id: string, floorId: string): FloorRecord | null {
    if (!fs.existsSync(this.filePath(id))) return null;
    const ws = this.read(id);
    const floor = (ws.floors ?? []).find((f) => f.id === floorId) ?? null;
    ws.floors = (ws.floors ?? []).filter((f) => f.id !== floorId);
    if (ws.activeFloor === floorId) ws.activeFloor = 'ground';
    this.writeWorkspace(ws);
    return floor;
  }

  setActiveFloor(id: string, floorId: string): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const ws = this.read(id);
    ws.activeFloor = floorId;
    this.writeWorkspace(ws);
  }

  /**
   * Resolve `recruit --floor <name>` (PRODUCT.md §5.4): given the caller's
   * current layer (a workspace id for ground, or a floor id), find its workspace
   * and the named floor's layer id + cwd. `'ground'` maps back to the workspace.
   */
  resolveFloorTarget(
    walkerLayer: string,
    floorName: string,
  ): { layerId: string; cwd: string } | null {
    const index = this.readIndex();
    for (const wsId of this.wsIds(index)) {
      if (!fs.existsSync(this.filePath(wsId))) continue;
      const ws = this.read(wsId);
      const onThisWs =
        wsId === walkerLayer || (ws.floors ?? []).some((f) => f.id === walkerLayer);
      if (!onThisWs) continue;
      if (floorName === 'ground') return { layerId: wsId, cwd: ws.cwd };
      const floor = (ws.floors ?? []).find((f) => f.name === floorName);
      return floor ? { layerId: floor.id, cwd: floor.path } : null;
    }
    return null;
  }
}
