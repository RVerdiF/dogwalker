import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WorkspaceStore } from './workspaceStore';
import type { GitService } from './gitService';
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
