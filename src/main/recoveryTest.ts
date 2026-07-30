import * as net from 'node:net';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PtyManager } from './ptyManager';
import type { GraphStore } from './graphStore';
import type { WorkspaceStore } from './workspaceStore';
import type { GitService } from './gitService';
import type { BrokerRequest, BrokerResponse } from '../shared/protocol';

/**
 * Failure recovery (DW_RECOVERYTEST=1): a floor whose worktree was deleted
 * outside Dogwalker is reconciled away (record dropped, git metadata pruned);
 * and an `ask`/`check` to a terminal that has died fails fast and cleanly
 * instead of hanging.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rmrf = (p: string) => {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* leave for the OS */
  }
};

function rpc(sock: string, req: BrokerRequest): Promise<BrokerResponse> {
  return new Promise((resolve, reject) => {
    const s = net.connect(sock);
    s.setEncoding('utf8');
    let buf = '';
    s.on('connect', () => s.write(JSON.stringify(req) + '\n'));
    s.on('data', (c) => {
      buf += c;
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      s.end();
      resolve(JSON.parse(buf.slice(0, nl)) as BrokerResponse);
    });
    s.on('error', reject);
  });
}

export async function runRecoveryTest(
  ptys: PtyManager,
  graph: GraphStore,
  workspaces: WorkspaceStore,
  git: GitService,
  sock: string,
): Promise<void> {
  const results: Record<string, unknown> = {};

  // --- Orphaned worktree reconciliation ----------------------------------
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-rec-'));
  const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-rec-wt-'));
  const floorPath = path.join(wtRoot, 'gone');
  let wsId = '';
  try {
    const sh = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
    sh('init', '-b', 'main');
    sh('config', 'user.email', 'test@dogwalker.dev');
    sh('config', 'user.name', 'Dogwalker Test');
    sh('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(repo, 'r.txt'), 'x\n');
    sh('add', '-A');
    sh('commit', '-m', 'init');
    wsId = workspaces.create('rec', '🧪').id;
    workspaces.rename(wsId, 'rec', '🧪', repo);
    await git.worktreeAdd(repo, floorPath, 'feat-r', true);
    workspaces.addFloor(wsId, {
      id: 'rec-floor',
      name: 'gone',
      branch: 'feat-r',
      path: floorPath,
      layout: { nodes: [], edges: [] },
    });
    results.floorPresent = workspaces.listFloors(wsId).floors.some((f) => f.id === 'rec-floor');

    // Simulate the worktree being deleted outside Dogwalker.
    rmrf(floorPath);

    // Reconcile (the same steps the floor:reconcile handler runs).
    for (const f of workspaces.listFloors(wsId).floors) {
      if (!fs.existsSync(f.path)) workspaces.removeFloorRecord(wsId, f.id);
    }
    await git.worktreePrune(repo);

    results.recordReconciled = !workspaces.listFloors(wsId).floors.some((f) => f.id === 'rec-floor');
    const wl = await git.worktreeList(repo);
    results.gitPruned = !wl.some((w) => w.branch === 'feat-r');
  } catch (e) {
    results.reconcileThrew = (e as Error).message;
  } finally {
    if (wsId) workspaces.remove(wsId);
    rmrf(repo);
    rmrf(wtRoot);
  }

  // --- ask/check to a dead target fails fast, not hangs -------------------
  const base = { preset: 'shell' as const, cols: 80, rows: 24, workspaceId: 'rec-ws', cwd: '' };
  const lead = ptys.spawn({ ...base, name: 'lead', stableId: 'rec-lead' }).id;
  const victim = ptys.spawn({ ...base, name: 'victim', stableId: 'rec-victim' }).id;
  graph.connect(lead, victim);
  await wait(2000);
  ptys.kill(victim); // the target dies mid-session
  await wait(600); // let onExit remove its graph node

  const t0 = Date.now();
  const askDead = await rpc(sock, { cmd: 'ask', from: lead, target: 'victim', body: 'echo hi' });
  const elapsed = Date.now() - t0;
  results.askDeadFailed = !askDead.ok;
  results.askDeadFast = elapsed < 3000; // instant, not the ask timeout
  const checkDead = await rpc(sock, { cmd: 'check', from: lead, target: 'victim' });
  results.checkDeadFailed = !checkDead.ok;

  console.log('RECOVERYTEST RESULT ' + JSON.stringify(results));
  ptys.kill(lead);
}
