import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DraftStore } from './draftStore';

/** Poll until `fn` is true (or throws), so async best-effort writes settle. */
function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        if (fn()) return resolve();
      } catch {
        /* fn threw (e.g. partial write) — keep polling */
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('waitFor: condition not met in time'));
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe('DraftStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-drafts-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty and returns "" for missing drafts when no file exists', () => {
    const store = new DraftStore(dir);
    expect(store.get('missing')).toBe('');
    expect(store.get('another')).toBe('');
  });

  it('starts empty when drafts.json is corrupted', () => {
    fs.writeFileSync(path.join(dir, 'drafts.json'), 'not json{{');
    expect(new DraftStore(dir).get('anything')).toBe('');
  });

  it('loads pre-existing drafts from disk', () => {
    fs.writeFileSync(path.join(dir, 'drafts.json'), JSON.stringify({ a: 'hello' }));
    const store = new DraftStore(dir);
    expect(store.get('a')).toBe('hello');
    expect(store.get('b')).toBe('');
  });

  it('stores a draft and persists it for a fresh instance', async () => {
    const file = path.join(dir, 'drafts.json');
    new DraftStore(dir).set('term-1', 'hello world');
    await waitFor(() => {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
      return raw['term-1'] === 'hello world';
    });
    expect(new DraftStore(dir).get('term-1')).toBe('hello world');
  });

  it('overwrites an existing draft with a newer value', () => {
    const store = new DraftStore(dir);
    store.set('term-1', 'v1');
    store.set('term-1', 'v2');
    expect(store.get('term-1')).toBe('v2');
  });

  it('removes the key when set with an empty string, and persists the deletion', async () => {
    const file = path.join(dir, 'drafts.json');
    const store = new DraftStore(dir);
    store.set('term-1', 'hello');
    await waitFor(() => {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
      return raw['term-1'] === 'hello';
    });
    store.set('term-1', '');
    expect(store.get('term-1')).toBe('');
    await waitFor(() => {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
      return raw['term-1'] === undefined;
    });
    expect(new DraftStore(dir).get('term-1')).toBe('');
  });
});
