import * as net from 'node:net';
import type { PtyManager } from './ptyManager';
import type { GraphStore } from './graphStore';
import type { ContractStore } from './contractStore';
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
  contracts: ContractStore,
  sock: string,
): Promise<void> {
  const base = { preset: 'shell' as const, cols: 80, rows: 24, workspaceId: 'test', cwd: '' };
  const a = ptys.spawn({ ...base, name: 'lead', stableId: 'lead' }).id;
  const b = ptys.spawn({ ...base, name: 'reviewer', stableId: 'reviewer' }).id;
  const d = ptys.spawn({ ...base, name: 'tester', stableId: 'tester' }).id;
  const c = ptys.spawn({ ...base, name: 'stranger', stableId: 'stranger' }).id;
  graph.connect(a, b);
  graph.connect(a, d);
  const contract = contracts.create({
    name: 'broker-test-contract',
    schema: { type: 'object', required: ['decision'], properties: { decision: { type: 'string' } } },
    maxAttempts: 2,
    timeoutMs: 15_000,
    rejectionPrompt: 'echo CONTRACT_REJECTION_PROMPT',
    fallback: { decision: 'FALLBACK' },
  });

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

  const team = await rpc(sock, { cmd: 'ask', from: a, all: true, body: 'echo TEAM_ASK_OK' });
  const teamResults = (team.data as { results?: Array<{ name: string; ok: boolean; body?: string }> })?.results ?? [];
  result.teamAsk = team.ok && teamResults.length === 2 && teamResults.every((x) => x.ok && x.body?.includes('TEAM_ASK_OK'));
  result.teamAskOrder = teamResults.map((x) => x.name).join(',');

  // A schema-valid answer comes straight back as the value.
  const contractAsk = await rpc(sock, { cmd: 'ask', from: a, target: 'reviewer', body: 'echo {"decision":"approve"}', contract: contract.id });
  result.contractValidated = contractAsk.ok && (contractAsk.data as { decision?: string })?.decision === 'approve';

  // A never-valid answer loops to the attempt budget, re-injects the rejection
  // prompt, and the asker receives the contract's fallback value.
  const rejectedAsk = await rpc(sock, { cmd: 'ask', from: a, target: 'reviewer', body: 'echo {"decision":7}', contract: contract.id });
  await wait(1000);
  result.contractFallback =
    rejectedAsk.ok &&
    (rejectedAsk.data as { decision?: string })?.decision === 'FALLBACK' &&
    (await ptys.serialize(b)).includes('CONTRACT_REJECTION_PROMPT');

  // contract management CLI: create → list → inspect → edit → delete.
  const schema = '{"type":"object","required":["ok"],"properties":{"ok":{"type":"boolean"}}}';
  const cCreate = await rpc(sock, { cmd: 'contract', from: a, op: 'create', target: 'cli-contract', schema, attempts: 2, timeoutMs: 5000, rejectionPrompt: 'fix it', fallback: '{"ok":false}' });
  result.contractCreate = cCreate.ok && (cCreate.data as { name?: string })?.name === 'cli-contract';
  const cList = await rpc(sock, { cmd: 'contract', from: a, op: 'list' });
  result.contractList = cList.ok && ((cList.data as { contracts?: string[] })?.contracts ?? []).includes('cli-contract');
  const cInspect = await rpc(sock, { cmd: 'contract', from: a, op: 'inspect', target: 'cli-contract' });
  const inspected = (cInspect.data as { contract?: { maxAttempts?: number; fallback?: { ok?: boolean } } })?.contract;
  result.contractInspect = cInspect.ok && inspected?.maxAttempts === 2 && inspected?.fallback?.ok === false;
  const cEdit = await rpc(sock, { cmd: 'contract', from: a, op: 'edit', target: 'cli-contract', attempts: 5 });
  const cInspect2 = await rpc(sock, { cmd: 'contract', from: a, op: 'inspect', target: 'cli-contract' });
  result.contractEdit = cEdit.ok && (cInspect2.data as { contract?: { maxAttempts?: number } })?.contract?.maxAttempts === 5;
  const cBadSchema = await rpc(sock, { cmd: 'contract', from: a, op: 'create', target: 'bad-contract', schema: '{not json}' });
  result.contractBadSchemaRejected = !cBadSchema.ok;
  const cDelete = await rpc(sock, { cmd: 'contract', from: a, op: 'delete', target: 'cli-contract' });
  const cList2 = await rpc(sock, { cmd: 'contract', from: a, op: 'list' });
  result.contractDelete = cDelete.ok && !((cList2.data as { contracts?: string[] })?.contracts ?? []).includes('cli-contract');

  // 6. authorization — stranger (unwired) may not ask reviewer.
  const denied = await rpc(sock, { cmd: 'ask', from: c, target: 'reviewer', body: 'hi' });
  result.strangerDenied = !denied.ok;

  // 7. the actual shim through a shell: `dogwalker list` in the lead terminal.
  ptys.write(a, 'dogwalker list\r');
  await wait(1500);
  result.shimShellList = ptys.serialize(a).includes('reviewer');

  // 8. shim ask with --timeout: lead asks reviewer (a shell) to echo; the
  // captured response prints back to lead's stdout.
  ptys.write(a, 'dogwalker ask reviewer "echo TIMEOUT_OK" --timeout 15\r');
  await wait(6000);
  result.shimAskTimeout = ptys.serialize(a).includes('TIMEOUT_OK');

  ptys.write(a, 'dogwalker ask --all "echo SHIM_TEAM_OK" --json\r');
  await wait(6000);
  result.shimTeamJson = ptys.serialize(a).includes('SHIM_TEAM_OK') && ptys.serialize(a).includes('broadcastId');

  // The shim should print the bare value object (validated JSON, or the
  // contract's fallback) — never the old {valid,value,errors} envelope. (The
  // exact value depends on how the host shell escapes the inline JSON, so we
  // assert on the shape, not the specific decision.)
  ptys.write(a, 'dogwalker ask reviewer "echo {\"decision\":\"approve\"}" --contract broker-test-contract\r');
  await wait(6000);
  const leadScreen = await ptys.serialize(a);
  result.shimSingleContractResult = leadScreen.includes('"decision":') && !leadScreen.includes('"valid":');

  console.log('BROKERTEST RESULT ' + JSON.stringify(result));

  ptys.kill(a);
  ptys.kill(b);
  ptys.kill(d);
  ptys.kill(c);
  contracts.remove(contract.id);
}
