import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContractStore } from './contractStore';

describe('ContractStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-contracts-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const schema = { type: 'object', required: ['decision'] };

  it('creates a contract and returns it by name and id', () => {
    const store = new ContractStore(dir);
    const created = store.create({ name: 'verdict', schema, maxAttempts: 2, timeoutMs: 5000, rejectionPrompt: 'fix', fallback: { decision: 'unknown' } });
    expect(created.id).toMatch(/^contract-/);
    expect(store.list().map((c) => c.name)).toContain('verdict');
    expect(store.get(created.id)?.maxAttempts).toBe(2);
  });

  it('fills in defaults for missing/invalid fields', () => {
    const store = new ContractStore(dir);
    // maxAttempts <= 0 and no timeout should fall back to the defaults.
    const c = store.create({ name: 'loose', schema, maxAttempts: 0, timeoutMs: 0, rejectionPrompt: '', fallback: null });
    expect(c.maxAttempts).toBe(3);
    expect(c.timeoutMs).toBe(180000);
    expect(c.fallback).toBeNull();
  });

  it('persists across instances on the same directory', () => {
    new ContractStore(dir).create({ name: 'persisted', schema, maxAttempts: 4, timeoutMs: 1000, rejectionPrompt: '', fallback: null });
    const reopened = new ContractStore(dir);
    expect(reopened.list().map((c) => c.name)).toEqual(['persisted']);
  });

  it('updates only the given fields', () => {
    const store = new ContractStore(dir);
    const c = store.create({ name: 'edit-me', schema, maxAttempts: 2, timeoutMs: 1000, rejectionPrompt: 'a', fallback: null });
    store.update(c.id, { ...c, maxAttempts: 9 });
    expect(store.get(c.id)?.maxAttempts).toBe(9);
    expect(store.get(c.id)?.name).toBe('edit-me');
  });

  it('removes a contract and reports whether anything was removed', () => {
    const store = new ContractStore(dir);
    const c = store.create({ name: 'gone', schema, maxAttempts: 1, timeoutMs: 1000, rejectionPrompt: '', fallback: null });
    expect(store.remove(c.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.remove(c.id)).toBe(false);
  });
});
