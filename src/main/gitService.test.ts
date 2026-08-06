import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitService } from './gitService';

const git = new GitService();

describe('GitService', () => {
  let repo: string;
  const run = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-git-'));
    run('init');
    run('config', 'user.email', 'test@dogwalker.dev');
    run('config', 'user.name', 'Test');
    run('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one');
    run('add', '-A');
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  it('reports a real repo with its staged files', async () => {
    const s = await git.status(repo);
    expect(s.isRepo).toBe(true);
    expect(s.files.map((f) => f.path)).toContain('a.txt');
  });

  it('reports isRepo:false outside a repository', async () => {
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-nogit-'));
    try {
      expect((await git.status(notRepo)).isRepo).toBe(false);
    } finally {
      fs.rmSync(notRepo, { recursive: true, force: true });
    }
  });

  it('commits and then sees a clean tree until a file is added', async () => {
    expect((await git.commit(repo, 'init')).ok).toBe(true);
    expect(await git.isClean(repo)).toBe(true);
    fs.writeFileSync(path.join(repo, 'b.txt'), 'two');
    expect(await git.isClean(repo)).toBe(false);
  });

  it('creates and checks out a branch, reflected in branches() and status()', async () => {
    await git.commit(repo, 'init');
    expect((await git.createBranch(repo, 'feature')).ok).toBe(true);
    expect((await git.checkout(repo, 'feature')).ok).toBe(true);
    expect((await git.status(repo)).branch).toBe('feature');
    expect(await git.branches(repo)).toContainEqual({ name: 'feature', current: true });
  });
});
