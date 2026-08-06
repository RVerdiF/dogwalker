import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PresetStore, BUILTIN_PRESETS } from './presetStore';

describe('PresetStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-presets-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists every built-in preset out of the box', () => {
    const names = new PresetStore(dir).list().map((p) => p.name);
    for (const b of BUILTIN_PRESETS) expect(names).toContain(b.name);
  });

  it('creates and persists a custom preset', () => {
    new PresetStore(dir).create({ name: 'my-agent', icon: 'robot', command: 'my-agent --go' });
    const reopened = new PresetStore(dir).list();
    expect(reopened.find((p) => p.name === 'my-agent')?.command).toBe('my-agent --go');
  });

  it('deletes a built-in by hiding it, and the hide persists', () => {
    const store = new PresetStore(dir);
    expect(store.remove('claude')).toBe(true);
    expect(store.list().some((p) => p.id === 'claude')).toBe(false);
    expect(new PresetStore(dir).list().some((p) => p.id === 'claude')).toBe(false);
  });

  it('never deletes the last remaining preset', () => {
    const store = new PresetStore(dir);
    const builtinIds = BUILTIN_PRESETS.map((b) => b.id);
    // Hide all but the last built-in; the final removal must be refused.
    for (const id of builtinIds.slice(0, -1)) store.remove(id);
    expect(store.list()).toHaveLength(1);
    expect(store.remove(builtinIds[builtinIds.length - 1])).toBe(false);
    expect(store.list()).toHaveLength(1);
  });
});
