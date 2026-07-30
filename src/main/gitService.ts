import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  GitBranch,
  GitCommit,
  GitFileStatus,
  GitResult,
  GitStatus,
} from '../shared/ipc';

const run = promisify(execFile);
const UNIT = '\x1f'; // field separator inside a log line

/**
 * Git for File Tree nodes (PRODUCT.md §8, ARCHITECTURE.md §1 — we shell out to
 * the system `git` rather than bundling a JS reimplementation). Every call is
 * scoped to a directory; read calls degrade to empty/`isRepo:false`, and the
 * branch-menu operations return `{ ok, output }` so the UI can surface a failure
 * (merge conflict, no upstream) instead of throwing across the bridge.
 */
export class GitService {
  private async git(
    cwd: string,
    args: string[],
  ): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await run('git', args, {
        cwd,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      });
      return { ok: true, stdout, stderr };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return {
        ok: false,
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? err.message ?? 'git failed',
      };
    }
  }

  private op(cwd: string, args: string[]): Promise<GitResult> {
    return this.git(cwd, args).then((r) => ({
      ok: r.ok,
      output: (r.stdout + r.stderr).trim(),
    }));
  }

  async status(cwd: string): Promise<GitStatus> {
    const r = await this.git(cwd, ['status', '--porcelain=v1', '-b']);
    if (!r.ok) {
      return { isRepo: false, branch: '', ahead: 0, behind: 0, files: [] };
    }
    const lines = r.stdout.split('\n').filter(Boolean);
    let branch = '';
    let ahead = 0;
    let behind = 0;
    const files: GitFileStatus[] = [];
    for (const line of lines) {
      if (line.startsWith('##')) {
        // "## main...origin/main [ahead 1, behind 2]" or "## main"
        const head = line.slice(3);
        branch = head.split('...')[0].split(' ')[0].trim();
        const ab = /\[(.*)\]/.exec(head);
        if (ab) {
          const a = /ahead (\d+)/.exec(ab[1]);
          const b = /behind (\d+)/.exec(ab[1]);
          if (a) ahead = Number(a[1]);
          if (b) behind = Number(b[1]);
        }
      } else {
        files.push({
          index: line[0],
          work: line[1],
          path: line.slice(3),
        });
      }
    }
    return { isRepo: true, branch, ahead, behind, files };
  }

  async branches(cwd: string): Promise<GitBranch[]> {
    const r = await this.git(cwd, [
      'branch',
      '--format=%(HEAD)%00%(refname:short)',
    ]);
    if (!r.ok) return [];
    return r.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [head, name] = line.split('\x00');
        return { name, current: head === '*' };
      });
  }

  async log(cwd: string, limit: number): Promise<GitCommit[]> {
    const fmt = ['%H', '%P', '%D', '%an', '%ct', '%s'].join(UNIT);
    const r = await this.git(cwd, [
      'log',
      '--all',
      `--max-count=${Math.max(1, Math.min(limit, 2000))}`,
      `--pretty=format:${fmt}`,
    ]);
    if (!r.ok) return [];
    return r.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, parents, refs, author, time, subject] = line.split(UNIT);
        return {
          hash,
          parents: parents ? parents.split(' ').filter(Boolean) : [],
          refs: refs
            ? refs.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          author,
          time: Number(time) || 0,
          subject: subject ?? '',
        };
      });
  }

  async diff(cwd: string, file?: string): Promise<string> {
    // vs HEAD captures staged + unstaged; fall back to plain diff in an empty
    // repo (no commits yet, so HEAD doesn't resolve).
    const base = ['diff', '--no-color'];
    const args = file ? [...base, 'HEAD', '--', file] : [...base, 'HEAD'];
    const r = await this.git(cwd, args);
    if (r.ok) return r.stdout;
    const fallback = file ? ['diff', '--no-color', '--', file] : ['diff', '--no-color'];
    return (await this.git(cwd, fallback)).stdout;
  }

  commit(cwd: string, message: string): Promise<GitResult> {
    return this.op(cwd, ['commit', '-a', '-m', message]);
  }
  checkout(cwd: string, branch: string): Promise<GitResult> {
    return this.op(cwd, ['checkout', branch]);
  }
  createBranch(cwd: string, name: string): Promise<GitResult> {
    return this.op(cwd, ['checkout', '-b', name]);
  }
  merge(cwd: string, branch: string): Promise<GitResult> {
    return this.op(cwd, ['merge', branch]);
  }
  /** Undo an in-progress merge — used to keep a Land conflict from half-merging. */
  mergeAbort(cwd: string): Promise<GitResult> {
    return this.op(cwd, ['merge', '--abort']);
  }
  stash(cwd: string): Promise<GitResult> {
    return this.op(cwd, ['stash', 'push']);
  }
  stashPop(cwd: string): Promise<GitResult> {
    return this.op(cwd, ['stash', 'pop']);
  }
  fetch(cwd: string): Promise<GitResult> {
    return this.op(cwd, ['fetch', '--all']);
  }
  pull(cwd: string): Promise<GitResult> {
    return this.op(cwd, ['pull']);
  }
  push(cwd: string): Promise<GitResult> {
    return this.op(cwd, ['push']);
  }

  // ---- Worktrees (Floors, ARCHITECTURE.md §8) -----------------------------

  /** True if the working tree has no staged or unstaged changes. */
  async isClean(cwd: string): Promise<boolean> {
    const r = await this.git(cwd, ['status', '--porcelain']);
    return r.ok && r.stdout.trim() === '';
  }

  /** Paths + branches of every worktree of the repo. */
  async worktreeList(cwd: string): Promise<Array<{ path: string; branch: string }>> {
    const r = await this.git(cwd, ['worktree', 'list', '--porcelain']);
    if (!r.ok) return [];
    const out: Array<{ path: string; branch: string }> = [];
    let path = '';
    let branch = '';
    for (const line of r.stdout.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice(9).trim();
      else if (line.startsWith('branch ')) branch = line.slice(7).replace('refs/heads/', '').trim();
      else if (line.trim() === '') {
        if (path) out.push({ path, branch });
        path = '';
        branch = '';
      }
    }
    if (path) out.push({ path, branch });
    return out;
  }

  /**
   * Add a worktree. With `createBranch`, cut a new branch off HEAD (`-b`);
   * otherwise check out the existing branch. Fails (surfaced via `output`) if
   * the branch is already checked out elsewhere — the one-checkout constraint.
   */
  worktreeAdd(
    cwd: string,
    path: string,
    branch: string,
    createBranch: boolean,
  ): Promise<GitResult> {
    const args = createBranch
      ? ['worktree', 'add', '-b', branch, path]
      : ['worktree', 'add', path, branch];
    return this.op(cwd, args);
  }

  worktreeRemove(cwd: string, path: string, force: boolean): Promise<GitResult> {
    const args = ['worktree', 'remove', ...(force ? ['--force'] : []), path];
    return this.op(cwd, args);
  }

  deleteBranch(cwd: string, branch: string, force: boolean): Promise<GitResult> {
    return this.op(cwd, ['branch', force ? '-D' : '-d', branch]);
  }

  /** Diff stat of a branch vs a base (for the Land dialog preview). */
  async diffStat(cwd: string, base: string, branch: string): Promise<string> {
    const r = await this.git(cwd, ['diff', '--stat', `${base}...${branch}`]);
    return r.ok ? r.stdout.trim() : '';
  }
}
