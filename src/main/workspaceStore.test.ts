import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NodeSpec, SidebarEntry } from '../shared/ipc';
import { WorkspaceStore } from './workspaceStore';

const term = (stableId: string): NodeSpec => ({
  kind: 'terminal', stableId, name: stableId, preset: 'shell', x: 0, y: 0, w: 1, h: 1,
});

const floor = (id: string, name: string, path: string) => ({
  id, name, branch: `branch-${id}`, path,
  layout: { nodes: [], edges: [] },
});

type Divider = Extract<SidebarEntry, { kind: 'divider' }>;

/** Find a divider by kind (and optionally id), narrowing the union. */
const dividerOf = (
  sidebar: SidebarEntry[],
  id?: string,
): Divider | undefined =>
  sidebar.find(
    (e): e is Divider => e.kind === 'divider' && (id === undefined || e.id === id),
  );

describe('WorkspaceStore floors', () => {
  let userData: string;
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-ws-'));
  });
  afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

  it('records a floor and makes it the active layer', () => {
    const store = new WorkspaceStore(userData);
    const ws = store.create('proj', '');
    store.addFloor(ws.id, { id: 'fx', name: 'featA', branch: 'feat-a', path: '/tmp/x', layout: { nodes: [], edges: [] } });
    const floors = store.listFloors(ws.id);
    expect(floors.floors.map((f) => f.id)).toContain('fx');
    expect(floors.active).toBe('fx');
  });

  it('keeps each layer’s layout isolated', () => {
    const store = new WorkspaceStore(userData);
    const ws = store.create('proj', '');
    store.addFloor(ws.id, { id: 'fx', name: 'featA', branch: 'feat-a', path: '/tmp/x', layout: { nodes: [], edges: [] } });
    store.saveLayer(ws.id, 'ground', { nodes: [term('g')], edges: [] });
    store.saveLayer(ws.id, 'fx', { nodes: [term('f')], edges: [] });
    expect(store.loadLayer(ws.id, 'ground').nodes.map((n) => n.stableId)).toEqual(['g']);
    expect(store.loadLayer(ws.id, 'fx').nodes.map((n) => n.stableId)).toEqual(['f']);
  });

  it('removes a floor record and falls back to the ground layer', () => {
    const store = new WorkspaceStore(userData);
    const ws = store.create('proj', '');
    store.addFloor(ws.id, { id: 'fx', name: 'featA', branch: 'feat-a', path: '/tmp/x', layout: { nodes: [], edges: [] } });
    store.removeFloorRecord(ws.id, 'fx');
    const after = store.listFloors(ws.id);
    expect(after.floors.some((f) => f.id === 'fx')).toBe(false);
    expect(after.active).toBe('ground');
  });
});

describe('WorkspaceStore bootstrap & index', () => {
  let userData: string;
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-ws-'));
  });
  afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

  const indexPath = () => path.join(userData, 'workspaces', 'index.json');

  it('bootstraps a first workspace and index on an empty dir', () => {
    const store = new WorkspaceStore(userData);
    const out = store.list();
    expect(out.workspaces).toHaveLength(1);
    expect(out.workspaces[0].name).toBe('My Workspace');
    expect(out.workspaces[0].cwd).toBe(os.homedir());
    expect(out.active).toBe(out.workspaces[0].id);
    expect(out.sidebar).toEqual([{ kind: 'workspace', id: out.workspaces[0].id }]);
  });

  it('does not bootstrap a second workspace when the index already exists', () => {
    new WorkspaceStore(userData);
    new WorkspaceStore(userData);
    expect(new WorkspaceStore(userData).list().workspaces).toHaveLength(1);
  });

  it('persists everything to disk: a fresh instance reads the same state', () => {
    const s1 = new WorkspaceStore(userData);
    const id = s1.create('proj', '🚀').id;
    s1.setSyncAgentDocs(id, true);
    s1.saveLayer(id, 'ground', { nodes: [term('g')], edges: [] });
    s1.addFloor(id, floor('fx', 'featA', '/tmp/featA'));
    s1.saveLayer(id, 'fx', { nodes: [term('f')], edges: [] });
    const s2 = new WorkspaceStore(userData);
    const meta = s2.list().workspaces.find((w) => w.id === id)!;
    expect(meta.name).toBe('proj');
    expect(meta.icon).toBe('🚀');
    expect(s2.syncEnabled()).toEqual([{ id, cwd: os.homedir() }]);
    expect(s2.loadLayer(id, 'ground').nodes.map((n) => n.stableId)).toEqual(['g']);
    expect(s2.loadLayer(id, 'fx').nodes.map((n) => n.stableId)).toEqual(['f']);
    expect(s2.listFloors(id).floors.map((f) => f.id)).toEqual(['fx']);
  });

  it('drops rail entries for workspaces whose file vanished, keeps dividers', () => {
    const store = new WorkspaceStore(userData);
    const boot = store.list().workspaces[0].id;
    const keep = store.create('keep', '').id;
    const gone = store.create('gone', '').id;
    store.addDivider('Dev');
    const divider = store.list().sidebar.find((e) => e.kind === 'divider')!;
    fs.unlinkSync(path.join(userData, 'workspaces', `${gone}.json`));
    const out = store.list();
    expect(out.workspaces.map((w) => w.id)).toEqual([boot, keep]);
    expect(out.sidebar.some((e) => e.id === divider.id)).toBe(true);
  });

  it('falls back to the home directory when a workspace file lacks a cwd', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', '').id;
    const file = path.join(userData, 'workspaces', `${id}.json`);
    const ws = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete ws.cwd;
    fs.writeFileSync(file, JSON.stringify(ws));
    expect(store.list().workspaces.find((w) => w.id === id)!.cwd).toBe(os.homedir());
  });

  it('migrates the pre-divider order format to entries on read', () => {
    const store = new WorkspaceStore(userData);
    const a = store.create('a', '').id;
    const b = store.create('b', '').id;
    fs.writeFileSync(indexPath(), JSON.stringify({ active: b, order: [b, a] }));
    const out = store.list();
    expect(out.sidebar.map((e) => e.id)).toEqual([b, a]);
    expect(out.active).toBe(b);
    // The migration persists on the next index write.
    store.setActive(b);
    const raw = JSON.parse(fs.readFileSync(indexPath(), 'utf8'));
    expect(raw.entries).toEqual([
      { kind: 'workspace', id: b },
      { kind: 'workspace', id: a },
    ]);
    expect(raw.order).toBeUndefined();
  });

  it('throws when index.json is corrupted', () => {
    const store = new WorkspaceStore(userData);
    fs.writeFileSync(indexPath(), '{not json');
    expect(() => store.list()).toThrow();
  });

  it('throws when a workspace file is corrupted', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', '').id;
    fs.writeFileSync(path.join(userData, 'workspaces', `${id}.json`), '{not json');
    expect(() => store.load(id)).toThrow();
    expect(() => store.list()).toThrow();
  });
});

describe('WorkspaceStore rail (dividers & reorder)', () => {
  let userData: string;
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-ws-'));
  });
  afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

  it('adds, renames and removes a divider', () => {
    const store = new WorkspaceStore(userData);
    store.addDivider('Dev');
    const div = dividerOf(store.list().sidebar)!;
    expect(div.label).toBe('Dev');
    store.renameDivider(div.id, 'Prod');
    expect(dividerOf(store.list().sidebar, div.id)!.label).toBe('Prod');
    store.removeDivider(div.id);
    expect(store.list().sidebar.some((e) => e.id === div.id)).toBe(false);
  });

  it('defaults the divider label and keeps it when renaming with an empty label', () => {
    const store = new WorkspaceStore(userData);
    store.addDivider('');
    const div = dividerOf(store.list().sidebar)!;
    expect(div.label).toBe('Section');
    store.renameDivider(div.id, '');
    expect(dividerOf(store.list().sidebar, div.id)!.label).toBe('Section');
  });

  it('reorders the rail: discards unknown ids, dedupes, re-appends missing entries', () => {
    const store = new WorkspaceStore(userData);
    const w0 = store.list().workspaces[0].id;
    const a = store.create('a', '').id;
    const b = store.create('b', '').id;
    store.reorder([
      { kind: 'workspace', id: b },
      { kind: 'workspace', id: 'zzz' },
      { kind: 'workspace', id: b },
      { kind: 'workspace', id: a },
    ]);
    expect(store.list().sidebar.map((e) => e.id)).toEqual([b, a, w0]);
  });
});

describe('WorkspaceStore CRUD', () => {
  let userData: string;
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-ws-'));
  });
  afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

  it('creates a workspace with the given name/icon and makes it active', () => {
    const store = new WorkspaceStore(userData);
    const meta = store.create('proj', '🚀');
    expect(meta).toMatchObject({ name: 'proj', icon: '🚀', cwd: os.homedir() });
    expect(store.list().active).toBe(meta.id);
    expect(store.load(meta.id).layout).toEqual({ nodes: [], edges: [] });
  });

  it('defaults an empty name to Workspace and icon to empty string', () => {
    const store = new WorkspaceStore(userData);
    const meta = store.create('', '');
    expect(meta.name).toBe('Workspace');
    expect(meta.icon).toBe('');
  });

  it('load returns the raw workspace file', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', 'i').id;
    expect(store.load(id)).toMatchObject({ id, name: 'a', icon: 'i' });
  });

  it('persists a layout snapshot via saveLayout', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', '').id;
    store.saveLayout(id, { nodes: [term('t1')], edges: [['t1', 't2']] });
    expect(store.load(id).layout).toEqual({
      nodes: [term('t1')],
      edges: [['t1', 't2']],
    });
  });

  it('saveLayout is a no-op for a missing workspace', () => {
    const store = new WorkspaceStore(userData);
    expect(() => store.saveLayout('w-nope', { nodes: [], edges: [] })).not.toThrow();
  });

  it('renames a workspace: name, icon and cwd', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('old', 'a').id;
    store.rename(id, 'new', 'b', '/work/dir');
    expect(store.list().workspaces.find((w) => w.id === id)).toMatchObject({
      name: 'new', icon: 'b', cwd: '/work/dir',
    });
  });

  it('rename with an empty cwd resets to the home directory', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('old', '').id;
    store.rename(id, 'new', '', '');
    expect(store.list().workspaces.find((w) => w.id === id)!.cwd).toBe(os.homedir());
  });

  it('rename without a cwd keeps the existing cwd', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('old', '').id;
    store.rename(id, 'new', '', '/work/dir');
    store.rename(id, 'newer', '');
    expect(store.list().workspaces.find((w) => w.id === id)!.cwd).toBe('/work/dir');
  });

  it('rename is a no-op for a missing workspace', () => {
    const store = new WorkspaceStore(userData);
    expect(() => store.rename('w-nope', 'x', '')).not.toThrow();
  });

  it('removes a workspace and its file', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', '').id;
    store.remove(id);
    expect(fs.existsSync(path.join(userData, 'workspaces', `${id}.json`))).toBe(false);
    expect(store.list().workspaces.some((w) => w.id === id)).toBe(false);
  });

  it('switches active to the first remaining workspace when the active one is removed', () => {
    const store = new WorkspaceStore(userData);
    const first = store.list().workspaces[0].id;
    store.create('b', '');
    const third = store.create('c', '').id;
    store.setActive(third);
    store.remove(third);
    expect(store.list().active).toBe(first);
  });

  it('keeps at least one workspace: removing the last remaining is a no-op', () => {
    const store = new WorkspaceStore(userData);
    const survivor = store.list().workspaces[0].id;
    store.remove(survivor);
    expect(store.list().workspaces.map((w) => w.id)).toEqual([survivor]);
    expect(fs.existsSync(path.join(userData, 'workspaces', `${survivor}.json`))).toBe(true);
  });

  it('remove tolerates a workspace file that is already gone', () => {
    const store = new WorkspaceStore(userData);
    const a = store.create('a', '').id;
    store.create('b', '');
    fs.unlinkSync(path.join(userData, 'workspaces', `${a}.json`));
    expect(() => store.remove(a)).not.toThrow();
    expect(store.list().workspaces.some((w) => w.id === a)).toBe(false);
  });

  it('setActive switches the active workspace and persists it', () => {
    const store = new WorkspaceStore(userData);
    const first = store.list().workspaces[0].id;
    const b = store.create('b', '').id;
    store.setActive(first);
    expect(store.list().active).toBe(first);
    store.setActive(b);
    expect(store.list().active).toBe(b);
  });

  it('setActive is a no-op for a missing workspace', () => {
    const store = new WorkspaceStore(userData);
    const active = store.list().active;
    store.setActive('w-nope');
    expect(store.list().active).toBe(active);
  });
});

describe('WorkspaceStore doc-sync', () => {
  let userData: string;
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-ws-'));
  });
  afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

  it('reports only workspaces with doc-sync enabled, in rail order', () => {
    const store = new WorkspaceStore(userData);
    const a = store.create('a', '').id;
    const b = store.create('b', '').id;
    expect(store.syncEnabled()).toEqual([]);
    store.setSyncAgentDocs(b, true);
    store.setSyncAgentDocs(a, true);
    expect(store.syncEnabled()).toEqual([
      { id: a, cwd: os.homedir() },
      { id: b, cwd: os.homedir() },
    ]);
  });

  it('setSyncAgentDocs is a no-op for a missing workspace', () => {
    const store = new WorkspaceStore(userData);
    expect(() => store.setSyncAgentDocs('w-nope', true)).not.toThrow();
    expect(store.syncEnabled()).toEqual([]);
  });
});

describe('WorkspaceStore floor edge cases', () => {
  let userData: string;
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-ws-'));
  });
  afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

  it('loadLayer returns an empty layout for a missing workspace or unknown floor', () => {
    const store = new WorkspaceStore(userData);
    expect(store.loadLayer('w-nope', 'ground')).toEqual({ nodes: [], edges: [] });
    const id = store.create('a', '').id;
    expect(store.loadLayer(id, 'nope')).toEqual({ nodes: [], edges: [] });
  });

  it('saveLayer with an unknown floor is a no-op', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', '').id;
    expect(() => store.saveLayer(id, 'nope', { nodes: [term('x')], edges: [] })).not.toThrow();
    expect(store.loadLayer(id, 'ground').nodes).toEqual([]);
  });

  it('saveLayer on a missing workspace is a no-op', () => {
    const store = new WorkspaceStore(userData);
    expect(() => store.saveLayer('w-nope', 'ground', { nodes: [], edges: [] })).not.toThrow();
  });

  it('listFloors on a missing workspace reports ground with no floors', () => {
    const store = new WorkspaceStore(userData);
    expect(store.listFloors('w-nope')).toEqual({ floors: [], active: 'ground' });
  });

  it('listFloors defaults active to ground when the workspace has no activeFloor', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', '').id;
    const file = path.join(userData, 'workspaces', `${id}.json`);
    const ws = JSON.parse(fs.readFileSync(file, 'utf8'));
    ws.floors = [{ ...floor('fx', 'featA', '/tmp/featA') }];
    fs.writeFileSync(file, JSON.stringify(ws));
    expect(store.listFloors(id)).toEqual({
      floors: [{ id: 'fx', name: 'featA', branch: 'branch-fx', path: '/tmp/featA' }],
      active: 'ground',
    });
  });

  it('addFloor on a missing workspace is a no-op', () => {
    const store = new WorkspaceStore(userData);
    expect(() => store.addFloor('w-nope', floor('fx', 'featA', '/tmp/featA'))).not.toThrow();
  });

  it('removeFloorRecord on a missing workspace returns null', () => {
    const store = new WorkspaceStore(userData);
    expect(store.removeFloorRecord('w-nope', 'fx')).toBeNull();
  });

  it('removing a non-active floor keeps the active layer and returns the record', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', '').id;
    store.addFloor(id, floor('f1', 'one', '/tmp/1'));
    store.addFloor(id, floor('f2', 'two', '/tmp/2'));
    const removed = store.removeFloorRecord(id, 'f1');
    expect(removed?.id).toBe('f1');
    expect(store.listFloors(id).floors.map((f) => f.id)).toEqual(['f2']);
    expect(store.listFloors(id).active).toBe('f2');
  });

  it('setActiveFloor switches the active layer, including back to ground', () => {
    const store = new WorkspaceStore(userData);
    const id = store.create('a', '').id;
    store.addFloor(id, floor('f1', 'one', '/tmp/1'));
    store.setActiveFloor(id, 'ground');
    expect(store.listFloors(id).active).toBe('ground');
    store.setActiveFloor(id, 'f1');
    expect(store.listFloors(id).active).toBe('f1');
  });

  it('setActiveFloor on a missing workspace is a no-op', () => {
    const store = new WorkspaceStore(userData);
    expect(() => store.setActiveFloor('w-nope', 'f1')).not.toThrow();
  });
});

describe('WorkspaceStore resolveFloorTarget', () => {
  let userData: string;
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-ws-'));
  });
  afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

  const withFloor = (): { store: WorkspaceStore; wsId: string } => {
    const store = new WorkspaceStore(userData);
    const wsId = store.create('proj', '').id;
    store.addFloor(wsId, floor('fx', 'featA', '/tmp/featA'));
    return { store, wsId };
  };

  it('maps the ground layer of the caller’s workspace back to the workspace', () => {
    const { store, wsId } = withFloor();
    expect(store.resolveFloorTarget(wsId, 'ground')).toEqual({
      layerId: wsId, cwd: os.homedir(),
    });
  });

  it('resolves a floor by name to its layer id and worktree path', () => {
    const { store, wsId } = withFloor();
    expect(store.resolveFloorTarget(wsId, 'featA')).toEqual({
      layerId: 'fx', cwd: '/tmp/featA',
    });
  });

  it('resolves when the caller is already on one of the workspace’s floors', () => {
    const { store, wsId } = withFloor();
    expect(store.resolveFloorTarget('fx', 'ground')).toEqual({
      layerId: wsId, cwd: os.homedir(),
    });
  });

  it('returns null for an unknown floor name', () => {
    const { store, wsId } = withFloor();
    expect(store.resolveFloorTarget(wsId, 'nope')).toBeNull();
  });

  it('returns null when the caller layer belongs to no workspace', () => {
    const { store } = withFloor();
    expect(store.resolveFloorTarget('w-stranger', 'ground')).toBeNull();
  });
});
