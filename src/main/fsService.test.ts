import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FsService } from './fsService';

describe('FsService', () => {
  let root: string;
  const svc = new FsService();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-fs-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('round-trips file contents', async () => {
    const f = path.join(root, 'note.txt');
    await svc.writeFile(f, 'hello');
    expect(await svc.readFile(f)).toBe('hello');
  });

  it('lists a directory folders-first, then alphabetically', async () => {
    await svc.create(path.join(root, 'zeta.txt'), false);
    await svc.create(path.join(root, 'alpha.txt'), false);
    await svc.create(path.join(root, 'sub'), true);
    const listing = await svc.readDir(root);
    expect(listing.error).toBeUndefined();
    expect(listing.entries.map((e) => e.name)).toEqual(['sub', 'alpha.txt', 'zeta.txt']);
  });

  it('degrades a failed listing to an error field instead of throwing', async () => {
    const listing = await svc.readDir(path.join(root, 'does-not-exist'));
    expect(listing.entries).toEqual([]);
    expect(listing.error).toBeTruthy();
  });

  it('creates, renames, stats and removes an entry', async () => {
    const a = await svc.create(path.join(root, 'a.txt'), false);
    expect(await svc.stat(a)).toMatchObject({ isDir: false, name: 'a.txt' });
    await svc.rename(a, path.join(root, 'b.txt'));
    expect(await svc.stat(a)).toBeNull();
    expect(await svc.stat(path.join(root, 'b.txt'))).not.toBeNull();
    await svc.remove(path.join(root, 'b.txt'));
    expect(await svc.stat(path.join(root, 'b.txt'))).toBeNull();
  });

  it('refuses to create over an existing file', async () => {
    const f = path.join(root, 'once.txt');
    await svc.create(f, false);
    await expect(svc.create(f, false)).rejects.toThrow();
  });

  it('finds files by name and content, skipping ignored dirs', async () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'node_modules'));
    await svc.writeFile(path.join(root, 'src', 'widget.ts'), 'export const answer = 42;\n');
    await svc.writeFile(path.join(root, 'node_modules', 'dep.ts'), 'const answer = 0;\n');
    const names = await svc.searchFiles(root);
    expect(names.some((p) => p.endsWith('widget.ts'))).toBe(true);
    expect(names.some((p) => p.includes('node_modules'))).toBe(false);
    const hits = await svc.grepFiles(root, 'answer');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ line: 1 });
    expect(hits[0].path).toContain('widget.ts');
  });
});
