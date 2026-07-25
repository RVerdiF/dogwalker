import * as net from 'node:net';
import * as fs from 'node:fs';
import type { PtyManager } from './ptyManager';
import type { GraphStore } from './graphStore';
import type { PortalManager } from './portalManager';
import type { BrokerRequest, BrokerResponse } from '../shared/protocol';

/**
 * Portal automation over the real broker (DW_PORTALCLITEST=1). A terminal wired
 * to a portal drives it through the `portal` verb — navigate, dom, type, click,
 * js, screenshot, console — plus a graph-authorization denial and one pass
 * through the actual `dogwalker` shim in a shell. Prints one result line.
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

export async function runPortalCliTest(
  ptys: PtyManager,
  graph: GraphStore,
  portals: PortalManager,
  sock: string,
): Promise<void> {
  const base = { preset: 'shell' as const, cols: 80, rows: 24, workspaceId: 'test', cwd: '' };
  const agent = ptys.spawn({ ...base, name: 'agent', stableId: 'agent' }).id;
  const stranger = ptys.spawn({ ...base, name: 'stranger', stableId: 'stranger' }).id;

  const pid = 'ptl-test';
  portals.create(pid, pid, 'about:blank');
  graph.addNode(pid, 'viewer', 'portal');
  graph.connect(agent, pid);
  portals.setBounds(pid, { x: 0, y: 0, width: 800, height: 600 }, 1, true);

  const r: Record<string, unknown> = {};
  await wait(2500); // shells + blank page

  const html =
    "<title>DWForm</title><input id=name><button id=go onclick=\"document.title='CLICKED'\">go</button>";
  const url = 'data:text/html,' + encodeURIComponent(html);

  const nav = await rpc(sock, { cmd: 'portal', from: agent, op: 'navigate', target: 'viewer', arg: url });
  r.navigate = nav.ok;
  await wait(800);

  const dom = await rpc(sock, { cmd: 'portal', from: agent, op: 'dom', target: 'viewer' });
  r.domHasInput = ((dom.data as { html?: string })?.html ?? '').includes('id="name"') ||
    ((dom.data as { html?: string })?.html ?? '').includes('id=name');

  await rpc(sock, { cmd: 'portal', from: agent, op: 'type', target: 'viewer', arg: '#name', value: 'walker' });
  const typed = await rpc(sock, {
    cmd: 'portal',
    from: agent,
    op: 'js',
    target: 'viewer',
    arg: "document.querySelector('#name').value",
  });
  r.typed = (typed.data as { result?: unknown })?.result === 'walker';

  await rpc(sock, { cmd: 'portal', from: agent, op: 'click', target: 'viewer', arg: '#go' });
  await wait(200);
  const title = await rpc(sock, {
    cmd: 'portal',
    from: agent,
    op: 'js',
    target: 'viewer',
    arg: 'document.title',
  });
  r.clicked = (title.data as { result?: unknown })?.result === 'CLICKED';

  const math = await rpc(sock, { cmd: 'portal', from: agent, op: 'js', target: 'viewer', arg: '1+2' });
  r.jsResult = (math.data as { result?: unknown })?.result === 3;

  // console ring buffer
  await rpc(sock, {
    cmd: 'portal',
    from: agent,
    op: 'js',
    target: 'viewer',
    arg: "console.log('HELLO_CONSOLE')",
  });
  await wait(300);
  const con = await rpc(sock, { cmd: 'portal', from: agent, op: 'console', target: 'viewer' });
  r.console = ((con.data as { output?: string })?.output ?? '').includes('HELLO_CONSOLE');

  const shot = await rpc(sock, { cmd: 'portal', from: agent, op: 'screenshot', target: 'viewer' });
  const shotPath = (shot.data as { path?: string })?.path ?? '';
  let png = false;
  try {
    const buf = fs.readFileSync(shotPath);
    png = buf.length > 100 && buf[0] === 0x89 && buf[1] === 0x50; // \x89PNG
  } catch {
    png = false;
  }
  r.screenshot = png;

  // Authorization: stranger isn't wired to the portal.
  const denied = await rpc(sock, {
    cmd: 'portal',
    from: stranger,
    op: 'navigate',
    target: 'viewer',
    arg: 'https://example.com',
  });
  r.strangerDenied = !denied.ok;

  // The real shim through a shell: `dogwalker portal js viewer "2+2"` → 4.
  ptys.write(agent, 'dogwalker portal js viewer "2+2"\r');
  await wait(2000);
  r.shimShell = ptys.serialize(agent).includes('4');

  console.log('PORTALCLITEST RESULT ' + JSON.stringify(r));

  portals.destroy(pid);
  graph.removeNode(pid);
  ptys.kill(agent);
  ptys.kill(stranger);
}

/**
 * Linked portals + agent-created portals (DW_PORTALLINKTEST=1). Two portals on
 * one partition share cookies (multi-account: same login in two views); a third
 * on its own partition is isolated. Then a terminal creates a portal over the
 * CLI and finds it wired to itself.
 */
export async function runPortalLinkTest(
  ptys: PtyManager,
  graph: GraphStore,
  portals: PortalManager,
  sock: string,
): Promise<void> {
  const r: Record<string, unknown> = {};
  const COOKIE = { url: 'https://dogwalker.test/', name: 'link', value: 'yes' };

  // Two portals sharing a partition, one isolated.
  portals.create('la', 'shared-xyz', 'about:blank');
  portals.create('lb', 'shared-xyz', 'about:blank');
  portals.create('lc', 'iso-1', 'about:blank');
  await wait(600);

  const sA = portals.entry('la')!.view.webContents.session;
  const sB = portals.entry('lb')!.view.webContents.session;
  const sC = portals.entry('lc')!.view.webContents.session;
  await sA.cookies.set(COOKIE);
  const seenByLinked = await sB.cookies.get({ url: COOKIE.url });
  const seenByIsolated = await sC.cookies.get({ url: COOKIE.url });
  r.linkedShareSession = seenByLinked.some((k) => k.name === 'link' && k.value === 'yes');
  r.isolatedSeparate = !seenByIsolated.some((k) => k.name === 'link');

  // Agent-created portal via the CLI.
  const agent = ptys.spawn({
    preset: 'shell',
    cols: 80,
    rows: 24,
    workspaceId: 'test',
    cwd: '',
    name: 'creator',
    stableId: 'creator',
  }).id;
  await wait(1500);
  const made = await rpc(sock, { cmd: 'portal', from: agent, op: 'new', target: '', arg: 'about:blank' });
  const data = made.data as { name?: string; id?: string };
  r.agentCreated = made.ok && typeof data.name === 'string';
  const newId = data.id ?? '';
  r.agentPortalExists = portals.has(newId) && graph.kindOf(newId) === 'portal';
  r.agentPortalWired = graph.areConnected(agent, newId);

  console.log('PORTALLINKTEST RESULT ' + JSON.stringify(r));

  // Let the renderer finish materializing the agent-created node (its
  // portal:created handler runs once) before removing it, so cleanup doesn't
  // race the add. Removing the graph node then reconciles the canvas node away.
  await wait(1200);
  for (const id of ['la', 'lb', 'lc', newId]) portals.destroy(id);
  graph.removeNode(newId);
  ptys.kill(agent);
}
