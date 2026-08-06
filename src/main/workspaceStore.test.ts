import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NodeSpec } from '../shared/ipc';
import { WorkspaceStore } from './workspaceStore';

const term = (stableId: string): NodeSpec => ({
  kind: 'terminal', stableId, name: stableId, preset: 'shell', x: 0, y: 0, w: 1, h: 1,
});

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
