import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractJsonObjects, Broker } from './broker';
import { GraphStore } from './graphStore';
import { History } from './history';
import { ContractStore } from './contractStore';
import { PresetStore } from './presetStore';
import { RoleStore } from './roleStore';
import { WorkspaceStore } from './workspaceStore';
import { PtyManager } from './ptyManager';
import type { BrokerRequest, BrokerResponse } from '../shared/protocol';

// ── unit: the contract loop relies on pulling the peer's JSON answer out of a
// noisy terminal capture that may also contain the injected schema's braces.
describe('extractJsonObjects', () => {
  it('returns every top-level JSON object in order', () => {
    expect(extractJsonObjects('noise {"a":1} more {"b":2} end')).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('skips brace runs that are not valid JSON', () => {
    expect(extractJsonObjects('a {not json} b {"ok":true} c')).toEqual([{ ok: true }]);
  });
  it('treats a nested object as one top-level object', () => {
    expect(extractJsonObjects('x {"a":{"b":1}} y')).toEqual([{ a: { b: 1 } }]);
  });
  it('is unfazed by braces inside strings', () => {
    expect(extractJsonObjects('{"s":"a } b {"}')).toEqual([{ s: 'a } b {' }]);
  });
  it('returns nothing when there is no JSON object', () => {
    expect(extractJsonObjects('just some prose, no objects here')).toEqual([]);
  });
});

// ── integration: the real broker over a real socket, driving real PTYs, exactly
// as the CLI shim would (this replaces the DW_BROKERTEST and DW_WALKERTEST
// harnesses). The shim shell-PATH round-trip is left to an e2e test.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rpc(socketPath: string, req: BrokerRequest): Promise<BrokerResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('connect', () => socket.write(JSON.stringify(req) + '\n'));
    socket.on('data', (chunk) => {
      buffer += chunk;
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      resolve(JSON.parse(buffer.slice(0, nl)) as BrokerResponse);
      socket.end();
    });
    socket.on('error', reject);
  });
}

describe('Broker (integration, real PTYs)', () => {
  let dir: string;
  let sock: string;
  let broker: Broker;
  let ptys: PtyManager;
  let graph: GraphStore;
  let lead = '';
  let reviewer = '';
  let tester = '';
  let boss = '';
  let grunt = '';

  const stub = <T>() => ({}) as unknown as T;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-broker-'));
    sock = process.platform === 'win32'
      ? `\\\\.\\pipe\\dogwalker-test-${Math.random().toString(36).slice(2)}`
      : path.join(dir, 'broker.sock');
    graph = new GraphStore();
    const history = new History(path.join(dir, 'history'));
    const contracts = new ContractStore(dir);
    contracts.create({
      name: 'verdict',
      schema: { type: 'object', required: ['decision'], properties: { decision: { type: 'string' } } },
      maxAttempts: 2,
      timeoutMs: 3_000,
      rejectionPrompt: 'echo RETRY_PLEASE',
      fallback: { decision: 'FALLBACK' },
    });
    const presets = new PresetStore(dir);
    const roles = new RoleStore(dir);
    roles.create({ name: 'scout', instructions: 'Scout ahead.' });
    roles.create({ name: 'sentry', instructions: 'Stand guard.' });
    const workspaces = new WorkspaceStore(dir);
    const webContents = { send: () => {}, isDestroyed: () => false } as unknown as ConstructorParameters<typeof PtyManager>[0];
    ptys = new PtyManager(webContents, graph, { socketPath: sock, shimDir: dir });
    broker = new Broker(sock, graph, ptys, history, stub(), stub(), workspaces, presets, roles, contracts);
    broker.listen();
    await wait(500);

    const base = { preset: 'shell' as const, cols: 80, rows: 24, workspaceId: 'test', cwd: '' };
    lead = ptys.spawn({ ...base, name: 'lead', stableId: 'lead' }).id;
    reviewer = ptys.spawn({ ...base, name: 'reviewer', stableId: 'reviewer' }).id;
    tester = ptys.spawn({ ...base, name: 'tester', stableId: 'tester' }).id;
    boss = ptys.spawn({ ...base, name: 'boss', stableId: 'boss', walker: true, cwd: dir }).id;
    grunt = ptys.spawn({ ...base, name: 'grunt', stableId: 'grunt' }).id;
    graph.connect(lead, reviewer);
    graph.connect(lead, tester);
    await wait(3000); // let the shells finish initializing
  }, 30_000);

  afterAll(() => {
    for (const id of [lead, reviewer, tester, boss, grunt]) ptys?.kill(id);
    broker?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('delivers a message and returns the peer’s captured output', async () => {
    const res = await rpc(sock, { cmd: 'ask', from: lead, target: 'reviewer', body: 'echo ASK_OK' });
    expect(res.ok).toBe(true);
    expect((res.data as { body?: string }).body).toContain('ASK_OK');
  }, 30_000);

  it('lists only the terminals the caller is wired to', async () => {
    const res = await rpc(sock, { cmd: 'list', from: lead });
    const names = (res.data as { peers?: Array<{ name: string }> }).peers?.map((p) => p.name) ?? [];
    expect(names.sort()).toEqual(['reviewer', 'tester']);
  }, 30_000);

  it('denies an ask from an unwired terminal', async () => {
    const res = await rpc(sock, { cmd: 'ask', from: 'nope', target: 'reviewer', body: 'hi' });
    expect(res.ok).toBe(false);
  }, 30_000);

  it('fans out an ask to every connected terminal', async () => {
    const res = await rpc(sock, { cmd: 'ask', from: lead, all: true, body: 'echo TEAM_OK' });
    const results = (res.data as { results?: Array<{ ok: boolean; body?: string }> }).results ?? [];
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok && r.body?.includes('TEAM_OK'))).toBe(true);
  }, 30_000);

  it('validates a contract answer and returns just the value', async () => {
    const res = await rpc(sock, { cmd: 'ask', from: lead, target: 'reviewer', body: 'echo {"decision":"approve"}', contract: 'verdict' });
    expect(res.ok).toBe(true);
    expect((res.data as { decision?: string }).decision).toBe('approve');
  }, 30_000);

  it('returns the fallback when the peer never satisfies the contract', async () => {
    const res = await rpc(sock, { cmd: 'ask', from: lead, target: 'reviewer', body: 'echo {"decision":7}', contract: 'verdict' });
    expect(res.ok).toBe(true);
    expect((res.data as { decision?: string }).decision).toBe('FALLBACK');
  }, 30_000);

  it('lets a Walker recruit, reassign and dismiss a teammate', async () => {
    const rec = await rpc(sock, { cmd: 'recruit', from: boss, agent: 'shell', role: 'scout' });
    expect(rec.ok).toBe(true);
    const recId = (rec.data as { id?: string }).id ?? '';
    expect(recId).toBeTruthy();
    expect(graph.areConnected(boss, recId)).toBe(true);
    expect(graph.name(recId)).toBe('scout');

    const assigned = await rpc(sock, { cmd: 'assign', from: boss, target: 'scout', role: 'sentry' });
    expect(assigned.ok).toBe(true);
    expect(graph.name(recId)).toBe('sentry');

    const dis = await rpc(sock, { cmd: 'dismiss', from: boss, target: 'sentry' });
    await wait(400);
    expect(dis.ok).toBe(true);
    expect(ptys.has(recId)).toBe(false);
    expect(graph.kindOf(recId)).toBeNull();
  }, 30_000);

  it('denies Walker verbs from a non-Walker terminal', async () => {
    const res = await rpc(sock, { cmd: 'recruit', from: grunt, agent: 'shell', role: 'scout' });
    expect(res.ok).toBe(false);
  }, 30_000);

  it('fails fast (not hang) when the target terminal has died', async () => {
    const victim = ptys.spawn({ preset: 'shell', cols: 80, rows: 24, workspaceId: 'test', cwd: '', name: 'victim', stableId: 'victim' }).id;
    graph.connect(lead, victim);
    ptys.kill(victim);
    await wait(600); // let onExit drop its graph node
    const t0 = Date.now();
    const res = await rpc(sock, { cmd: 'ask', from: lead, target: 'victim', body: 'echo hi' });
    expect(res.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(3000); // instant, not the ask timeout
  }, 30_000);
});
