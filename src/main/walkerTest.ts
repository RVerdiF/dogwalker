import * as net from 'node:net';
import type { PtyManager } from './ptyManager';
import type { GraphStore } from './graphStore';
import type { BrokerRequest, BrokerResponse } from '../shared/protocol';

/**
 * Walker mode (DW_WALKERTEST=1): a Walker terminal recruits a teammate (spawned
 * wired to it), a non-Walker is denied, assign relabels the recruit's role, and
 * dismiss removes it (terminal + graph node). Over the real broker socket.
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

export async function runWalkerTest(
  ptys: PtyManager,
  graph: GraphStore,
  sock: string,
): Promise<void> {
  const base = { preset: 'shell' as const, cols: 80, rows: 24, workspaceId: 'walker-ws', cwd: '' };
  const boss = ptys.spawn({ ...base, name: 'boss', stableId: 'w-boss', walker: true }).id;
  const grunt = ptys.spawn({ ...base, name: 'grunt', stableId: 'w-grunt', walker: false }).id;

  const results: Record<string, unknown> = {};
  await wait(2500);

  // Walker recruits a reviewer, wired to the Walker.
  const rec = await rpc(sock, { cmd: 'recruit', from: boss, agent: 'shell', role: 'reviewer' });
  const recId = (rec.data as { id?: string })?.id ?? '';
  results.recruited = rec.ok && (rec.data as { name?: string })?.name === 'reviewer';
  results.recruitWired = !!recId && graph.areConnected(boss, recId) && ptys.has(recId);
  results.recruitNamed = graph.name(recId) === 'reviewer';

  // A non-Walker may not recruit.
  const denied = await rpc(sock, { cmd: 'recruit', from: grunt, agent: 'shell', role: 'nope' });
  results.nonWalkerDenied = !denied.ok;

  // Reassign the recruit's role in place.
  const assigned = await rpc(sock, { cmd: 'assign', from: boss, target: 'reviewer', role: 'auditor' });
  results.assigned = assigned.ok && graph.name(recId) === 'auditor';

  // Dismiss it — terminal and graph node gone.
  const dis = await rpc(sock, { cmd: 'dismiss', from: boss, target: 'auditor' });
  await wait(400);
  results.dismissed = dis.ok && !ptys.has(recId) && graph.kindOf(recId) === null;

  console.log('WALKERTEST RESULT ' + JSON.stringify(results));
  ptys.kill(boss);
  ptys.kill(grunt);
}
