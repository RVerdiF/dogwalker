import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RoleStore } from './roleStore';

describe('RoleStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-roles-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates a role and returns it by id', () => {
    const store = new RoleStore(dir);
    const r = store.create({ name: 'Reviewer', instructions: 'Review carefully.' });
    expect(r.id).toBeTruthy();
    expect(store.get(r.id)?.name).toBe('Reviewer');
  });

  it('persists roles across instances', () => {
    new RoleStore(dir).create({ name: 'Tester', instructions: 'Break it.' });
    expect(new RoleStore(dir).list().map((r) => r.name)).toEqual(['Tester']);
  });

  it('updates a role in place', () => {
    const store = new RoleStore(dir);
    const r = store.create({ name: 'Coder', instructions: 'a' });
    store.update(r.id, { name: 'Coder', instructions: 'b' });
    expect(store.get(r.id)?.instructions).toBe('b');
  });

  it('removes a role and reports whether anything was removed', () => {
    const store = new RoleStore(dir);
    const r = store.create({ name: 'Gone', instructions: '' });
    expect(store.remove(r.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.remove(r.id)).toBe(false);
  });
});
