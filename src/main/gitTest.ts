import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GitService } from './gitService';
import { computeLanes } from '../app/gitGraph';
import { parseDiff } from '../app/diffParse';
import type { GitCommit } from '../shared/ipc';

/**
 * Git validation (DW_GITTEST=1): a throwaway local repo (no remote) exercised
 * through GitService — status, branches, commit, branch, checkout, a clean
 * merge, diff — plus the pure lane layout and diff parser against known inputs.
 */
export async function runGitTest(git: GitService): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-gittest-'));
  const results: Record<string, unknown> = {};
  const sh = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString();
  const write = (name: string, body: string) =>
    fs.writeFileSync(path.join(dir, name), body);
  try {
    sh('init', '-b', 'main');
    sh('config', 'user.email', 'test@dogwalker.dev');
    sh('config', 'user.name', 'Dogwalker Test');
    sh('config', 'commit.gpgsign', 'false');

    // c1 on main
    write('a.txt', 'one\n');
    sh('add', '-A');
    sh('commit', '-m', 'c1');

    // Branch off and add b.txt (disjoint from main's future edit → clean merge).
    const branched = await git.createBranch(dir, 'feature');
    write('b.txt', 'from feature\n');
    sh('add', '-A');
    const committed = await git.commit(dir, 'c2 feature');

    // Back on main, change a.txt and commit.
    const checkedOut = await git.checkout(dir, 'main');
    write('a.txt', 'one\nmain change\n');
    sh('add', '-A');
    sh('commit', '-m', 'c3 main');

    // Merge feature into main (no overlap → succeeds, makes a merge commit).
    const merged = await git.merge(dir, 'feature');

    // Query surface.
    const branches = await git.branches(dir);
    const status0 = await git.status(dir);

    // Dirty the tree, then status + diff should reflect it.
    write('a.txt', 'one\nmain change\nuncommitted line\n');
    const status1 = await git.status(dir);
    const diff = await git.diff(dir);
    const parsed = parseDiff(diff);
    const aFile = parsed.find((f) => f.path === 'a.txt');

    // Stash the change away and back.
    const stashed = await git.stash(dir);
    const cleanAfterStash = (await git.status(dir)).files.length === 0;
    const popped = await git.stashPop(dir);

    // Graph lanes from the real log (the merge commit has two parents).
    const log = await git.log(dir, 50);
    const lanes = computeLanes(log);
    const mergeRow = lanes.find((r) => r.commit.parents.length === 2);

    // Pure lane layout on a synthetic diamond: D->(B,C)->A.
    const synth: GitCommit[] = [
      { hash: 'D', parents: ['B', 'C'], refs: [], author: '', subject: 'merge', time: 4 },
      { hash: 'C', parents: ['A'], refs: [], author: '', subject: 'c', time: 3 },
      { hash: 'B', parents: ['A'], refs: [], author: '', subject: 'b', time: 2 },
      { hash: 'A', parents: [], refs: [], author: '', subject: 'a', time: 1 },
    ];
    const sl = computeLanes(synth);

    results.branchCreated = branched.ok;
    results.committed = committed.ok;
    results.checkedOut = checkedOut.ok;
    results.merged = merged.ok;
    results.branchesListed =
      branches.some((b) => b.name === 'feature') &&
      branches.some((b) => b.name === 'main' && b.current);
    results.statusClean = status0.isRepo && status0.branch === 'main' && status0.files.length === 0;
    results.statusDirty = status1.files.some((f) => f.path === 'a.txt');
    results.diffParsed = !!aFile && aFile.rows.some((r) => r.kind === 'add');
    results.stashed = stashed.ok && cleanAfterStash;
    results.popped = popped.ok;
    results.logHasMerge = log.some((c) => c.parents.length === 2);
    results.mergeLaneWidth = !!mergeRow && mergeRow.laneCount >= 2;
    // Diamond: the merge (row 0) spans two lanes; the root (row 3) collapses
    // back to a single column.
    results.diamondBranches = sl[0].laneCount >= 2 && sl[3].col === 0;

    // parseDiff pairing on a hand-written hunk.
    const hunk = [
      'diff --git a/x.txt b/x.txt',
      'index 111..222 100644',
      '--- a/x.txt',
      '+++ b/x.txt',
      '@@ -1,2 +1,2 @@',
      ' keep',
      '-old',
      '+new',
    ].join('\n');
    const pd = parseDiff(hunk);
    results.diffPairing =
      pd.length === 1 &&
      pd[0].rows.some(
        (r) => r.kind === 'del' && r.oldText === 'old' && r.newText === 'new',
      );
  } catch (e) {
    results.threw = (e as Error).message;
  }
  console.log('GITTEST RESULT ' + JSON.stringify(results));
  // Best-effort cleanup: on Windows git leaves read-only packed objects that
  // can briefly EPERM, so retry and never let teardown mask the result.
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
}
