import * as net from 'node:net';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PtyManager } from './ptyManager';
import type { GraphStore } from './graphStore';
import type { GitService } from './gitService';
import type { BrokerRequest, BrokerResponse } from '../shared/protocol';

/**
 * Floor-aware broker/CLI (DW_CROSSFLOORTEST=1): terminals on different layers,
 * wired together, prove `list` reports each peer's floor and `ask` reaches a
 * cross-floor target; plus the one-checkout-per-branch worktree constraint
 * surfaces as an error.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rpc(sock: string, req: BrokerRequest): Promise<BrokerResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(sock);
    socket.setEncoding('utf8');
    let buf = '';
    socket.on('connect', () => socket.write(JSON.stringify(req) + '\n'));
    socket.on('data', (chunk) => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      socket.end();
      resolve(JSON.parse(buf.slice(0, nl)) as BrokerResponse);
    });
    socket.on('error', reject);
  });
}

export async function runCrossFloorTest(
  ptys: PtyManager,
  graph: GraphStore,
  git: GitService,
  sock: string,
): Promise<void> {
  const base = { preset: 'shell' as const, cols: 80, rows: 24, cwd: '' };
  const lead = ptys.spawn({
    ...base,
    name: 'lead',
    stableId: 'cf-lead',
    workspaceId: 'cf-ws',
    floorName: 'ground',
  }).id;
  const worker = ptys.spawn({
    ...base,
    name: 'worker',
    stableId: 'cf-worker',
    workspaceId: 'cf-floor', // a different layer id → a floor
    floorName: 'featX',
  }).id;
  graph.connect(lead, worker);

  const results: Record<string, unknown> = {};
  await wait(2500);

  // `list` from ground shows the worker tagged with its floor.
  const listRes = await rpc(sock, { cmd: 'list', from: lead });
  const peers = (listRes.data as { peers?: Array<{ name: string; floor?: string }> })?.peers ?? [];
  results.listShowsFloor = peers.some((p) => p.name === 'worker' && p.floor === 'featX');

  // `ask` reaches the cross-floor target (a shell echoes the marker back).
  const askRes = await rpc(sock, {
    cmd: 'ask',
    from: lead,
    target: 'worker',
    body: 'echo CROSSFLOOR_OK',
  });
  const body = (askRes.data as { body?: string })?.body ?? '';
  results.crossFloorAsk = askRes.ok && body.includes('CROSSFLOOR_OK');

  // One-checkout-per-branch: a worktree on an already-checked-out branch fails.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-cftest-'));
  const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-cftest-wt-'));
  try {
    const sh = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
    sh('init', '-b', 'main');
    sh('config', 'user.email', 'test@dogwalker.dev');
    sh('config', 'user.name', 'Dogwalker Test');
    sh('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
    sh('add', '-A');
    sh('commit', '-m', 'init');
    // main is checked out at the repo root, so a second checkout must fail.
    const dup = await git.worktreeAdd(repo, path.join(wtRoot, 'dup'), 'main', false);
    results.branchInUseRejected = !dup.ok && /already/i.test(dup.output);
  } finally {
    try {
      fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      fs.rmSync(wtRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* leave for the OS */
    }
  }

  console.log('CROSSFLOORTEST RESULT ' + JSON.stringify(results));
  ptys.kill(lead);
  ptys.kill(worker);
}
