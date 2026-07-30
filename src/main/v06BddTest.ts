import * as net from 'node:net';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PtyManager } from './ptyManager';
import type { GraphStore } from './graphStore';
import type { NoteStore } from './noteStore';
import type { RoutineService } from './routineService';
import type { WorkspaceStore } from './workspaceStore';
import type { GitService } from './gitService';
import type { BrokerRequest, BrokerResponse } from '../shared/protocol';

/**
 * v0.6 dogfooding, BDD-style (DW_V06BDD=1). End-to-end user scenarios over the
 * real broker: a Walker assembles a team sharing a SPEC note; a routine chain
 * (build && test && write-to-note) runs clean; dismissing a recruit cleans up
 * fully; and a recruit on another floor answers its Walker. One result line.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const rmrf = (p: string) => {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* leave for the OS */
  }
};

export async function runV06Bdd(
  ptys: PtyManager,
  graph: GraphStore,
  notes: NoteStore,
  routines: RoutineService,
  workspaces: WorkspaceStore,
  git: GitService,
  sock: string,
): Promise<void> {
  const r: Record<string, unknown> = {};
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-bdd-'));
  const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-bdd-wt-'));
  const floorPath = path.join(wtRoot, 'feat');
  let wsId = '';
  try {
    // --- Setup: a real repo + workspace + one floor ------------------------
    const sh = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
    sh('init', '-b', 'main');
    sh('config', 'user.email', 'test@dogwalker.dev');
    sh('config', 'user.name', 'Dogwalker Test');
    sh('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(repo, 'README.md'), 'bdd\n');
    sh('add', '-A');
    sh('commit', '-m', 'init');
    wsId = workspaces.create('bdd', '🧪').id;
    workspaces.rename(wsId, 'bdd', '🧪', repo);
    await git.worktreeAdd(repo, floorPath, 'feat-bdd', true);
    workspaces.addFloor(wsId, {
      id: 'bdd-floor',
      name: 'feat',
      branch: 'feat-bdd',
      path: floorPath,
      layout: { nodes: [], edges: [] },
    });

    notes.register('bdd-spec', 'SPEC');
    notes.write('bdd-spec', 'BUILD THE WIDGET');
    notes.register('bdd-summary', 'SUMMARY');
    notes.write('bdd-summary', '');

    const boss = ptys.spawn({
      preset: 'shell',
      cols: 80,
      rows: 24,
      workspaceId: wsId,
      floorName: 'ground',
      cwd: repo,
      stableId: 'bdd-boss',
      name: 'boss',
      walker: true,
    }).id;
    await wait(2500);

    // --- Scenario 1: Walker assembles a team sharing the SPEC note ---------
    // GIVEN a Walker  WHEN it recruits coder+reviewer+tester and shares SPEC
    // THEN all three are wired to it and can read SPEC.
    const roles = ['coder', 'reviewer', 'tester'];
    const team: Record<string, { id: string; stableId: string }> = {};
    for (const role of roles) {
      const res = await rpc(sock, { cmd: 'recruit', from: boss, agent: 'shell', role });
      const d = res.data as { id: string; stableId: string };
      team[role] = d;
      await rpc(sock, { cmd: 'connect', from: d.id, target: 'SPEC' });
    }
    await wait(500);
    const allWired = roles.every((role) => graph.areConnected(boss, team[role].id));
    let allRead = true;
    for (const role of roles) {
      const read = await rpc(sock, { cmd: 'note', from: team[role].id, op: 'read', target: 'SPEC' });
      if (!((read.data as { content?: string })?.content ?? '').includes('BUILD THE WIDGET')) {
        allRead = false;
      }
    }
    r.teamAssembledWired = allWired;
    r.teamReadsSpec = allRead;

    // --- Scenario 2: a routine chain writes build+test result to a note ----
    // GIVEN the coder connected to SUMMARY  WHEN a build&&test&&note routine runs
    // THEN SUMMARY records it and the routine returns to idle (no zombie).
    await rpc(sock, { cmd: 'connect', from: team.coder.id, target: 'SUMMARY' });
    const routine = routines.create(wsId, {
      name: 'ci',
      targetStableId: team.coder.stableId,
      prompt: 'echo BUILD_OK && echo TEST_OK && dogwalker note append SUMMARY built_and_tested',
      intervalMs: 3_600_000,
    });
    await routines.runNow(routine.id);
    await wait(500);
    r.routineWroteNote = notes.read('bdd-summary').includes('built_and_tested');
    r.routineIdleNoZombie = routines.list(wsId).find((x) => x.id === routine.id)?.status === 'idle';
    routines.remove(routine.id);

    // --- Scenario 3: dismissing a recruit cleans up everything -------------
    // GIVEN the wired reviewer  WHEN the Walker dismisses it
    // THEN its terminal, node and edges (to Walker and SPEC) are gone.
    const reviewerId = team.reviewer.id;
    const specNode = graph.resolveAny('SPEC') ?? '';
    await rpc(sock, { cmd: 'dismiss', from: boss, target: 'reviewer' });
    await wait(400);
    r.dismissRemoved = !ptys.has(reviewerId) && graph.kindOf(reviewerId) === null;
    r.dismissUnwired =
      !graph.areConnected(boss, reviewerId) && !graph.neighbors(specNode).has(reviewerId);

    // --- Scenario 4: a recruit on another floor answers its Walker ---------
    // GIVEN a floor  WHEN the Walker recruits onto it  THEN ask round-trips.
    const rec = await rpc(sock, {
      cmd: 'recruit',
      from: boss,
      agent: 'shell',
      role: 'fielder',
      floor: 'feat',
    });
    const fielder = rec.data as { id: string };
    await wait(2000);
    r.recruitOnFloor =
      rec.ok && ptys.workspaceOf(fielder.id) === 'bdd-floor' && graph.areConnected(boss, fielder.id);
    const ask = await rpc(sock, {
      cmd: 'ask',
      from: boss,
      target: 'fielder',
      body: 'echo CROSSFLOOR_RECRUIT_OK',
    });
    r.crossFloorRecruitAsk =
      ask.ok && ((ask.data as { body?: string })?.body ?? '').includes('CROSSFLOOR_RECRUIT_OK');

    // Cleanup live terminals.
    for (const role of roles) if (role !== 'reviewer') ptys.kill(team[role].id);
    ptys.kill(fielder.id);
    ptys.kill(boss);
  } catch (e) {
    r.threw = (e as Error).message;
  }
  console.log('V06BDD RESULT ' + JSON.stringify(r));

  notes.delete('bdd-spec');
  notes.delete('bdd-summary');
  if (wsId) workspaces.remove(wsId);
  await git.worktreeRemove(repo, floorPath, true).catch(() => undefined);
  rmrf(repo);
  rmrf(wtRoot);
}
