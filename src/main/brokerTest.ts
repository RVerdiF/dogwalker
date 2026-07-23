import * as net from 'node:net';
import type { PtyManager } from './ptyManager';
import type { GraphStore } from './graphStore';
import type { BrokerRequest, BrokerResponse } from '../shared/protocol';

/**
 * End-to-end broker validation (DW_BROKERTEST=1). Exercises the real broker
 * over the real socket against real PTYs: ask→inject→reply correlation, check,
 * list, and graph authorization. Prints one `BROKERTEST RESULT {...}` line.
 *
 * The socket clients here stand in for shim processes (same wire protocol); a
 * final step drives the actual `dogwalker` shim through a shell to prove PATH
 * injection and the wrapper scripts.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rpc(
  socketPath: string,
  req: BrokerRequest,
  { hold = false } = {},
): Promise<BrokerResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('connect', () => socket.write(JSON.stringify(req) + '\n'));
    socket.on('data', (chunk) => {
      buffer += chunk;
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      const res = JSON.parse(buffer.slice(0, nl)) as BrokerResponse;
      if (!hold) socket.end();
      resolve(res);
    });
    socket.on('error', reject);
  });
}

export async function runBrokerTest(
  ptys: PtyManager,
  graph: GraphStore,
  sock: string,
): Promise<void> {
  const a = ptys.spawn({ preset: 'shell', name: 'lead', cols: 80, rows: 24 }).id;
  const b = ptys.spawn({ preset: 'shell', name: 'reviewer', cols: 80, rows: 24 }).id;
  const c = ptys.spawn({ preset: 'shell', name: 'stranger', cols: 80, rows: 24 }).id;
  graph.connect(a, b);

  const result: Record<string, unknown> = {};

  await wait(2500); // let shells initialize

  // 1. ask (held) — broker injects delivery into reviewer's PTY.
  // 1. ask — the broker injects the message into reviewer (a shell), waits for
  // it to go quiet, and returns reviewer's output. A shell runs the message as a
  // command, so a known echo comes back as the captured response.
  const askRes = await rpc(sock, {
    cmd: 'ask',
    from: a,
    target: 'reviewer',
    body: 'echo ASK_CAPTURE_OK',
  });
  const askReceived = (askRes.data as { body?: string })?.body ?? '';
  result.askOk = askRes.ok;
  result.askCaptured = askReceived.includes('ASK_CAPTURE_OK');

  // 4. check — lead reads reviewer's screen.
  const checkRes = await rpc(sock, { cmd: 'check', from: a, target: 'reviewer' });
  result.checkOk = checkRes.ok && typeof (checkRes.data as { screen?: string })?.screen === 'string';

  // 5. list — lead sees exactly [reviewer].
  const listRes = await rpc(sock, { cmd: 'list', from: a });
  result.listPeers = (listRes.data as { peers?: Array<{ name: string }> })?.peers?.map((p) => p.name);

  // 6. authorization — stranger (unwired) may not ask reviewer.
  const denied = await rpc(sock, { cmd: 'ask', from: c, target: 'reviewer', body: 'hi' });
  result.strangerDenied = !denied.ok;

  // 7. the actual shim through a shell: `dogwalker list` in the lead terminal.
  ptys.write(a, 'dogwalker list\r');
  await wait(1500);
  result.shimShellList = ptys.serialize(a).includes('reviewer');

  console.log('BROKERTEST RESULT ' + JSON.stringify(result));

  ptys.kill(a);
  ptys.kill(b);
  ptys.kill(c);
}
