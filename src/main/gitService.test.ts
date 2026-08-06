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
    run('config', 'core.autocrlf', 'false');
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

  it('adds, lists and removes a worktree on a new branch', async () => {
    await git.commit(repo, 'init');
    const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dw-wt-')), 'featA');
    expect((await git.worktreeAdd(repo, wt, 'feat-a', true)).ok).toBe(true);
    expect(fs.existsSync(wt)).toBe(true);
    expect(await git.worktreeList(repo)).toContainEqual(
      expect.objectContaining({ branch: 'feat-a' }),
    );
    expect((await git.worktreeRemove(repo, wt, true)).ok).toBe(true);
    expect(fs.existsSync(wt)).toBe(false);
    fs.rmSync(path.dirname(wt), { recursive: true, force: true });
  });

  it('lands a clean floor branch and safely aborts a conflicting one', async () => {
    await git.commit(repo, 'init');
    const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-land-'));
    const at = (cwd: string) => (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });

    // Clean land: a disjoint change on a floor branch merges into the ground.
    const floorA = path.join(wtRoot, 'featA');
    await git.worktreeAdd(repo, floorA, 'feat-a', true);
    fs.writeFileSync(path.join(floorA, 'only.txt'), 'from the floor');
    at(floorA)('add', '-A');
    at(floorA)('commit', '-m', 'add only.txt');
    expect((await git.merge(repo, 'feat-a')).ok).toBe(true);
    expect(fs.existsSync(path.join(repo, 'only.txt'))).toBe(true);

    // Conflict land: the same line diverges → merge fails and aborts cleanly.
    const floorB = path.join(wtRoot, 'featB');
    await git.worktreeAdd(repo, floorB, 'feat-b', true);
    fs.writeFileSync(path.join(floorB, 'a.txt'), 'floor-side');
    at(floorB)('add', '-A');
    at(floorB)('commit', '-m', 'floor edits a.txt');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'ground-side');
    at(repo)('add', '-A');
    at(repo)('commit', '-m', 'ground edits a.txt');
    expect((await git.merge(repo, 'feat-b')).ok).toBe(false);
    expect((await git.mergeAbort(repo)).ok).toBe(true);
    expect(await git.isClean(repo)).toBe(true);
    const a = fs.readFileSync(path.join(repo, 'a.txt'), 'utf8');
    expect(a).toContain('ground-side');
    expect(a).not.toContain('<<<<<<<');

    fs.rmSync(wtRoot, { recursive: true, force: true });
  });

  it('prunes worktree records whose directory was deleted outside git', async () => {
    await git.commit(repo, 'init');
    const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-prune-'));
    const wt = path.join(wtRoot, 'gone');
    await git.worktreeAdd(repo, wt, 'feat-r', true);
    fs.rmSync(wt, { recursive: true, force: true }); // vanished outside Dogwalker
    expect((await git.worktreePrune(repo)).ok).toBe(true);
    expect((await git.worktreeList(repo)).some((w) => w.branch === 'feat-r')).toBe(false);
    fs.rmSync(wtRoot, { recursive: true, force: true });
  });

  it('rejects a second worktree on an already-checked-out branch', async () => {
    await git.commit(repo, 'init');
    const branch = (await git.status(repo)).branch; // checked out at the repo root
    const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-dup-'));
    const dup = await git.worktreeAdd(repo, path.join(wtRoot, 'dup'), branch, false);
    expect(dup.ok).toBe(false);
    expect(dup.output).toMatch(/already/i);
    fs.rmSync(wtRoot, { recursive: true, force: true });
  });
});
