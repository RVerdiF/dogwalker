import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WorkspaceStore } from './workspaceStore';
import type { GitService } from './gitService';
import type { HookService } from './hookService';
import type { NodeSpec } from '../shared/ipc';

/**
 * Floors validation (DW_FLOORTEST=1): a throwaway repo exercised through the
 * worktree verbs and the floor store — add/list/remove a worktree, record a
 * floor, prove each layer keeps its own layout, and clean up. Prints one line.
 */
const rmrf = (p: string) => {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* leave for the OS */
  }
};

const term = (stableId: string): NodeSpec => ({
  kind: 'terminal',
  stableId,
  name: stableId,
  preset: 'shell',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
});

export async function runFloorTest(
  workspaces: WorkspaceStore,
  git: GitService,
): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-floortest-'));
  const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-floortest-wt-'));
  const floorPath = path.join(wtRoot, 'featA');
  const results: Record<string, unknown> = {};
  let wsId = '';
  const sh = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString();
  try {
    sh('init', '-b', 'main');
    sh('config', 'user.email', 'test@dogwalker.dev');
    sh('config', 'user.name', 'Dogwalker Test');
    sh('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(repo, 'README.md'), '# floor test\n');
    sh('add', '-A');
    sh('commit', '-m', 'init');

    // Worktree on a new branch.
    const add = await git.worktreeAdd(repo, floorPath, 'feat-a', true);
    results.worktreeAdded = add.ok && fs.existsSync(floorPath);
    const list = await git.worktreeList(repo);
    results.worktreeListed = list.some((w) => w.branch === 'feat-a');

    // Floor record on a real workspace pointed at the repo.
    const ws = workspaces.create('floortest', '🧪');
    wsId = ws.id;
    workspaces.rename(wsId, 'floortest', '🧪', repo);
    workspaces.addFloor(wsId, {
      id: 'fx',
      name: 'featA',
      branch: 'feat-a',
      path: floorPath,
      layout: { nodes: [], edges: [] },
    });
    const floors = workspaces.listFloors(wsId);
    results.floorRecorded = floors.floors.some((f) => f.id === 'fx') && floors.active === 'fx';

    // Each layer keeps its own layout.
    workspaces.saveLayer(wsId, 'ground', { nodes: [term('g')], edges: [] });
    workspaces.saveLayer(wsId, 'fx', { nodes: [term('f')], edges: [] });
    const gl = workspaces.loadLayer(wsId, 'ground');
    const fl = workspaces.loadLayer(wsId, 'fx');
    results.layersIsolated =
      gl.nodes.length === 1 &&
      gl.nodes[0].stableId === 'g' &&
      fl.nodes.length === 1 &&
      fl.nodes[0].stableId === 'f';

    // Remove the floor: record gone (active back to ground) + worktree gone.
    workspaces.removeFloorRecord(wsId, 'fx');
    const rm = await git.worktreeRemove(repo, floorPath, true);
    const after = workspaces.listFloors(wsId);
    results.worktreeRemoved = rm.ok && !fs.existsSync(floorPath);
    results.floorRecordGone = !after.floors.some((f) => f.id === 'fx') && after.active === 'ground';
  } catch (e) {
    results.threw = (e as Error).message;
  }
  console.log('FLOORTEST RESULT ' + JSON.stringify(results));

  if (wsId) workspaces.remove(wsId);
  rmrf(repo);
  rmrf(wtRoot);
}

/**
 * Land validation (DW_LANDTEST=1): a clean floor merges into the ground and its
 * worktree is removed; a conflicting floor surfaces the conflict and is aborted,
 * leaving the ground clean and the worktree intact (no half-merge).
 */
export async function runLandTest(git: GitService): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-landtest-'));
  const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-landtest-wt-'));
  const floorA = path.join(wtRoot, 'featA');
  const floorB = path.join(wtRoot, 'featB');
  const results: Record<string, unknown> = {};
  const at = (cwd: string) => (...args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
  const sh = at(repo);
  try {
    sh('init', '-b', 'main');
    sh('config', 'user.email', 'test@dogwalker.dev');
    sh('config', 'user.name', 'Dogwalker Test');
    sh('config', 'commit.gpgsign', 'false');
    sh('config', 'core.autocrlf', 'false');
    fs.writeFileSync(path.join(repo, 'README.md'), 'base\n');
    sh('add', '-A');
    sh('commit', '-m', 'init');

    // --- Clean land: a disjoint change merges. ---
    await git.worktreeAdd(repo, floorA, 'feat-a', true);
    fs.writeFileSync(path.join(floorA, 'only.txt'), 'from the floor\n');
    at(floorA)('add', '-A');
    at(floorA)('commit', '-m', 'add only.txt');
    const m1 = await git.merge(repo, 'feat-a');
    results.cleanMerge = m1.ok;
    results.mergedFile = fs.existsSync(path.join(repo, 'only.txt'));
    const rm = await git.worktreeRemove(repo, floorA, true);
    results.worktreeGone = rm.ok && !fs.existsSync(floorA);

    // --- Conflict land: same line diverges → surfaced + aborted. ---
    await git.worktreeAdd(repo, floorB, 'feat-b', true); // branches off current main
    fs.writeFileSync(path.join(floorB, 'README.md'), 'feat-side\n');
    at(floorB)('add', '-A');
    at(floorB)('commit', '-m', 'floor edits readme');
    // Diverge the same line on the ground.
    fs.writeFileSync(path.join(repo, 'README.md'), 'main-side\n');
    sh('add', '-A');
    sh('commit', '-m', 'ground edits readme');

    const m2 = await git.merge(repo, 'feat-b');
    results.conflictDetected = !m2.ok;
    const ab = await git.mergeAbort(repo);
    results.aborted = ab.ok;
    results.groundCleanAfterAbort = await git.isClean(repo);
    // Intact = the ground's own content survives, with no conflict markers left.
    const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
    results.readmeIntact = readme.includes('main-side') && !readme.includes('<<<<<<<');
    results.floorIntact = fs.existsSync(floorB);
  } catch (e) {
    results.threw = (e as Error).message;
  }
  console.log('LANDTEST RESULT ' + JSON.stringify(results));
  rmrf(repo);
  rmrf(wtRoot);
}

/**
 * Hook validation (DW_HOOKTEST=1): a project's `.dogwalker/hooks.json` runs in
 * the floor dir with the DOGWALKER_* env — setup writes a marker, run prints,
 * teardown writes to the root; and a repo without hooks reports "not run".
 */
export async function runHookTest(hooks: HookService, git: GitService): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hooktest-'));
  const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hooktest-wt-'));
  const floorA = path.join(wtRoot, 'featA');
  const results: Record<string, unknown> = {};
  const sh = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString();
  try {
    sh('init', '-b', 'main');
    sh('config', 'user.email', 'test@dogwalker.dev');
    sh('config', 'user.name', 'Dogwalker Test');
    sh('config', 'commit.gpgsign', 'false');
    fs.mkdirSync(path.join(repo, '.dogwalker'), { recursive: true });
    const hookConfig = {
      setup:
        "node -e \"require('fs').writeFileSync('setup-marker.txt',[process.env.DOGWALKER_FLOOR_NAME,process.env.DOGWALKER_BRANCH_NAME,process.env.DOGWALKER_FLOOR_PATH,process.env.DOGWALKER_ROOT_PATH,process.env.DOGWALKER_PROJECT_NAME].join('|'))\"",
      run: "node -e \"console.log('RUN_HOOK_OK ' + process.env.DOGWALKER_FLOOR_NAME)\"",
      teardown:
        "node -e \"require('fs').writeFileSync(require('path').join(process.env.DOGWALKER_ROOT_PATH,'teardown-marker.txt'),process.env.DOGWALKER_FLOOR_NAME)\"",
    };
    fs.writeFileSync(path.join(repo, '.dogwalker', 'hooks.json'), JSON.stringify(hookConfig));
    fs.writeFileSync(path.join(repo, 'README.md'), 'base\n');
    sh('add', '-A');
    sh('commit', '-m', 'init');

    await git.worktreeAdd(repo, floorA, 'feat', true);
    const ctx = { floorName: 'featA', branch: 'feat', floorPath: floorA, rootPath: repo };

    const setup = await hooks.runHook('setup', ctx);
    const marker = fs.readFileSync(path.join(floorA, 'setup-marker.txt'), 'utf8').split('|');
    results.setupRan = setup.ran && setup.ok;
    results.setupEnv =
      marker[0] === 'featA' &&
      marker[1] === 'feat' &&
      marker[2] === floorA &&
      marker[3] === repo &&
      marker[4] === path.basename(repo);

    const runHook = await hooks.runHook('run', ctx);
    results.runHook = runHook.ran && runHook.ok && runHook.output.includes('RUN_HOOK_OK featA');

    const teardown = await hooks.runHook('teardown', ctx);
    results.teardown =
      teardown.ran &&
      fs.readFileSync(path.join(repo, 'teardown-marker.txt'), 'utf8') === 'featA';

    // A project without hooks reports "not run".
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hooktest-bare-'));
    const none = await hooks.runHook('run', { ...ctx, rootPath: bare });
    results.noHookNotRun = none.ran === false;
    rmrf(bare);
  } catch (e) {
    results.threw = (e as Error).message;
  }
  console.log('HOOKTEST RESULT ' + JSON.stringify(results));
  rmrf(repo);
  rmrf(wtRoot);
}
