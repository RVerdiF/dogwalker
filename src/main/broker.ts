import * as net from 'node:net';
import * as crypto from 'node:crypto';
import type { GraphStore } from './graphStore';
import type { PtyManager } from './ptyManager';
import type { History } from './history';
import type { NoteStore } from './noteStore';
import type { PortalManager } from './portalManager';
import type { WorkspaceStore } from './workspaceStore';
import type { PresetStore } from './presetStore';
import type { RoleStore } from './roleStore';
import {
  encode,
  type BrokerRequest,
  type BrokerResponse,
} from '../shared/protocol';
import type { PresetId } from '../shared/ipc';

const ASK_TIMEOUT_DEFAULT_MS = 180_000;
const ASK_TIMEOUT_MIN_MS = 1_000;
const ASK_TIMEOUT_MAX_MS = 3_600_000;

/**
 * The single agent-facing authority (ARCHITECTURE.md §5). Every capability a
 * terminal's CLI can invoke lives here; the shim is a dumb pipe. Authorization
 * is strictly the connection graph — a terminal reaches only what it is wired
 * to. No ambient authority.
 */
export class Broker {
  private server: net.Server;

  constructor(
    private pipePath: string,
    private graph: GraphStore,
    private ptys: PtyManager,
    private history: History,
    private notes: NoteStore,
    private portals: PortalManager,
    private workspaces: WorkspaceStore,
    private presets: PresetStore,
    private roles: RoleStore,
  ) {
    this.server = net.createServer((socket) => this.onConnection(socket));
  }

  listen(): void {
    // On Windows `pipePath` is a \\.\pipe\ name; on posix a filesystem socket.
    this.server.listen(this.pipePath);
  }

  close(): void {
    this.server.close();
  }

  private onConnection(socket: net.Socket): void {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.trim()) this.dispatch(socket, line);
      }
    });
    socket.on('error', () => socket.destroy());
  }

  private dispatch(socket: net.Socket, line: string): void {
    let req: BrokerRequest;
    try {
      req = JSON.parse(line) as BrokerRequest;
    } catch {
      return this.respond(socket, { ok: false, error: 'malformed request' });
    }
    if (!req.from || !this.ptys.has(req.from)) {
      return this.respond(socket, { ok: false, error: 'unknown caller' });
    }
    switch (req.cmd) {
      case 'ask':
        void this.handleAsk(socket, req.from, req.target, req.body, req.timeoutMs);
        return;
      case 'check':
        return this.handleCheck(socket, req.from, req.target);
      case 'list':
        return this.handleList(socket, req.from);
      case 'connect':
      case 'disconnect':
        return this.handleWire(socket, req.cmd, req.from, req.target);
      case 'note':
        return this.handleNote(
          socket,
          req.from,
          req.op,
          req.target,
          req.body,
          req.chain,
        );
      case 'portal':
        void this.handlePortal(socket, req);
        return;
      case 'recruit':
      case 'dismiss':
      case 'assign':
        return this.handleWalker(socket, req);
      default:
        return this.respond(socket, { ok: false, error: 'unknown command' });
    }
  }

  /**
   * Send a message to a connected terminal and return whatever it produces in
   * response (ARCHITECTURE.md §5.2). We inject the message, wait for the target
   * to go quiet (the focus-independent quiescence detector, §6), then capture
   * the plain-text output it produced. No cooperation from the target is needed
   * — it works with any agent, shell, or process — so there is no `reply`
   * command and nothing can deadlock waiting for one.
   */
  private async handleAsk(
    socket: net.Socket,
    from: string,
    target: string,
    body: string,
    timeoutMs?: number,
  ): Promise<void> {
    const to = this.graph.resolvePeer(from, target);
    if (!to) {
      return this.respond(socket, {
        ok: false,
        error: `no connected terminal named "${target}"`,
      });
    }
    const timeout = Math.min(
      ASK_TIMEOUT_MAX_MS,
      Math.max(ASK_TIMEOUT_MIN_MS, timeoutMs ?? ASK_TIMEOUT_DEFAULT_MS),
    );
    const msgId = crypto.randomBytes(3).toString('hex');
    this.history.append({ ts: Date.now(), kind: 'ask', from, to, msgId, body });

    const before = this.ptys.plainText(to);
    this.ptys.inject(to, body);
    await this.ptys.awaitQuiet(to, timeout);
    const after = this.ptys.plainText(to);

    // The response is the new output the target produced (echoed prompt + its
    // answer). Falls back to the whole screen if scrollback rolled over.
    const delta = after.startsWith(before) ? after.slice(before.length) : after;
    const response = delta.trim();
    this.history.append({
      ts: Date.now(),
      kind: 'reply',
      from: to,
      to: from,
      msgId,
      body: response,
    });
    this.respond(socket, { ok: true, data: { body: response } });
  }

  private handleCheck(socket: net.Socket, from: string, target: string): void {
    const to = this.graph.resolvePeer(from, target);
    if (!to) {
      return this.respond(socket, {
        ok: false,
        error: `no connected terminal named "${target}"`,
      });
    }
    const screen = this.ptys.serialize(to);
    this.history.append({
      ts: Date.now(),
      kind: 'check',
      from,
      to,
      body: '(read screen)',
    });
    this.respond(socket, { ok: true, data: { screen } });
  }

  /**
   * Follow note↔note leashes from `entry` (BFS, cycle-safe) and concatenate the
   * whole connected note cluster — the "mind-map of context" pattern
   * (PRODUCT.md §6). Each note is delimited so the reading agent can tell them
   * apart. Only note-kind neighbors are followed, so the caller terminal (and
   * any wired agents) are never pulled in.
   */
  private readChain(entry: string): string {
    const visited = new Set<string>();
    const order: string[] = [];
    const queue = [entry];
    while (queue.length) {
      const cur = queue.shift() as string;
      if (visited.has(cur)) continue;
      visited.add(cur);
      order.push(cur);
      for (const nb of this.graph.neighbors(cur)) {
        if (!visited.has(nb) && this.graph.kindOf(nb) === 'note') queue.push(nb);
      }
    }
    return order
      .map((id) => `===== NOTE: ${this.graph.name(id)} =====\n${this.notes.read(id)}`)
      .join('\n\n');
  }

  private handleList(socket: net.Socket, from: string): void {
    // Annotate each peer with its floor (§10) so an agent knows where a
    // connected teammate is working — ground or a specific floor.
    const peers = [...this.graph.neighbors(from)].map((id) => ({
      id,
      name: this.graph.name(id),
      floor: this.graph.kindOf(id) === 'terminal' ? this.ptys.floorOf(id) : '',
    }));
    this.respond(socket, { ok: true, data: { peers } });
  }

  private handleWire(
    socket: net.Socket,
    cmd: 'connect' | 'disconnect',
    from: string,
    target: string,
  ): void {
    if (cmd === 'connect') {
      const to = this.graph.resolveAny(target);
      if (!to || to === from) {
        return this.respond(socket, { ok: false, error: 'no such terminal' });
      }
      this.graph.connect(from, to);
    } else {
      const to = this.graph.resolvePeer(from, target);
      if (!to) return this.respond(socket, { ok: false, error: 'not connected' });
      const edge = this.graph
        .snapshot()
        .edges.find(
          (e) =>
            (e.a === from && e.b === to) || (e.a === to && e.b === from),
        );
      if (edge) this.graph.disconnect(edge.id);
    }
    this.respond(socket, { ok: true });
  }

  private handleNote(
    socket: net.Socket,
    from: string,
    op: 'read' | 'append' | 'write',
    target: string,
    body?: string,
    chain?: boolean,
  ): void {
    // Only notes the caller is wired to are reachable.
    const noteId = this.graph.resolvePeer(from, target, 'note');
    if (!noteId) {
      return this.respond(socket, {
        ok: false,
        error: `no connected note named "${target}"`,
      });
    }
    if (op === 'read') {
      const content = chain
        ? this.readChain(noteId)
        : this.notes.read(noteId);
      this.history.append({
        ts: Date.now(),
        kind: 'check',
        from,
        to: noteId,
        body: chain ? '(read note chain)' : '(read note)',
      });
      return this.respond(socket, { ok: true, data: { content } });
    }
    // append / write mutate; notify the UI to refresh the open editor.
    const text = body ?? '';
    if (op === 'append') this.notes.append(noteId, text, true);
    else this.notes.write(noteId, text, true);
    this.history.append({
      ts: Date.now(),
      kind: 'ask',
      from,
      to: noteId,
      body: `(${op} note) ${text.slice(0, 80)}`,
    });
    this.respond(socket, { ok: true });
  }

  /**
   * Drive a connected portal (PRODUCT.md §9). Authorization is the same as
   * everything else — the caller must be wired to the portal. Automation itself
   * lives in the PortalManager; the broker only gates and shuttles results.
   */
  private async handlePortal(
    socket: net.Socket,
    req: Extract<BrokerRequest, { cmd: 'portal' }>,
  ): Promise<void> {
    // `new` creates a portal wired to the caller (agent-created portals, §9);
    // the renderer then materializes a canvas node for it.
    if (req.op === 'new') {
      const id = 'p' + crypto.randomBytes(4).toString('hex');
      const name = `portal-${id.slice(1, 5)}`;
      const url = req.arg || 'about:blank';
      this.portals.create(id, id, url);
      this.graph.addNode(id, name, 'portal');
      this.graph.connect(req.from, id);
      this.portals.notifyCreated(id, name, url, id);
      this.history.append({
        ts: Date.now(),
        kind: 'ask',
        from: req.from,
        to: id,
        body: `(portal new) ${url}`.slice(0, 100),
      });
      return this.respond(socket, { ok: true, data: { name, id } });
    }
    const portalId = this.graph.resolvePeer(req.from, req.target, 'portal');
    if (!portalId || !this.portals.has(portalId)) {
      return this.respond(socket, {
        ok: false,
        error: `no connected portal named "${req.target}"`,
      });
    }
    this.history.append({
      ts: Date.now(),
      kind: req.op === 'screenshot' || req.op === 'dom' || req.op === 'console' ? 'check' : 'ask',
      from: req.from,
      to: portalId,
      body: `(portal ${req.op}) ${req.arg ?? ''}`.slice(0, 100),
    });
    try {
      switch (req.op) {
        case 'navigate':
          this.portals.navigate(portalId, req.arg ?? '');
          return this.respond(socket, { ok: true, data: { ok: true } });
        case 'click':
          return this.respond(socket, {
            ok: true,
            data: await this.portals.click(portalId, req.arg ?? ''),
          });
        case 'type':
          return this.respond(socket, {
            ok: true,
            data: await this.portals.type(portalId, req.arg ?? '', req.value ?? ''),
          });
        case 'scroll':
          return this.respond(socket, {
            ok: true,
            data: await this.portals.scroll(portalId, req.x ?? 0, req.y ?? 0),
          });
        case 'screenshot':
          return this.respond(socket, {
            ok: true,
            data: { path: await this.portals.screenshot(portalId) },
          });
        case 'js':
          return this.respond(socket, {
            ok: true,
            data: { result: await this.portals.js(portalId, req.arg ?? '') },
          });
        case 'dom':
          return this.respond(socket, {
            ok: true,
            data: { html: await this.portals.dom(portalId, req.arg) },
          });
        case 'console':
          return this.respond(socket, {
            ok: true,
            data: { output: this.portals.consoleLog(portalId) },
          });
        default:
          return this.respond(socket, { ok: false, error: 'unknown portal op' });
      }
    } catch (e) {
      this.respond(socket, { ok: false, error: (e as Error).message });
    }
  }

  /**
   * Walker verbs (PRODUCT.md §5.4): a Walker terminal manages a team. `recruit`
   * spawns a teammate wired to the Walker on the Walker's own layer, inheriting
   * its cwd; `dismiss` removes a connected recruit; `assign` relabels its role.
   * Only a Walker-flagged terminal may call these.
   */
  private handleWalker(
    socket: net.Socket,
    req: Extract<BrokerRequest, { cmd: 'recruit' | 'dismiss' | 'assign' }>,
  ): void {
    if (!this.ptys.isWalker(req.from)) {
      return this.respond(socket, {
        ok: false,
        error: 'not a Walker terminal — flag it as a Walker to manage a team',
      });
    }
    if (req.cmd === 'recruit') {
      const preset = (req.agent || 'shell') as PresetId;
      if (!this.presets.get(preset)) return this.respond(socket, { ok: false, error: `no preset named "${preset}"` });
      const roleRecord = req.role ? this.roles.list().find((r) => r.name === req.role || r.id === req.role) : null;
      if (req.role && !roleRecord) return this.respond(socket, { ok: false, error: `no role named "${req.role}"` });
      const role = roleRecord?.name || preset;
      const stableId = crypto.randomBytes(6).toString('hex');
      // Default to the Walker's own layer; `--floor` places the recruit on a
      // sibling floor of the same workspace (its worktree cwd + layer).
      let layer = this.ptys.workspaceOf(req.from);
      let cwd = this.ptys.cwdOf(req.from);
      let floorName = this.ptys.floorOf(req.from);
      if (req.floor) {
        const t = this.workspaces.resolveFloorTarget(layer, req.floor);
        if (!t) {
          return this.respond(socket, { ok: false, error: `no floor named "${req.floor}"` });
        }
        layer = t.layerId;
        cwd = t.cwd;
        floorName = req.floor;
      }
      const { id } = this.ptys.spawn({
        preset,
        name: role,
        cols: 80,
        rows: 24,
        workspaceId: layer,
        floorName,
        cwd,
        stableId,
        walker: false,
      });
      this.graph.connect(req.from, id);
      if (roleRecord) this.ptys.assignRole(id, roleRecord);
      this.ptys.announceRecruit({
        id,
        stableId,
        name: role,
        preset,
        walkerId: req.from,
        workspaceId: layer,
      });
      this.history.append({
        ts: Date.now(),
        kind: 'ask',
        from: req.from,
        to: id,
        body: `(recruit ${preset} as ${role})`,
      });
      return this.respond(socket, { ok: true, data: { name: role, id, stableId } });
    }
    // dismiss / assign target a connected recruit.
    const target = this.graph.resolvePeer(req.from, req.target ?? '', 'terminal');
    if (!target) {
      return this.respond(socket, {
        ok: false,
        error: `no connected recruit named "${req.target ?? ''}"`,
      });
    }
    if (req.cmd === 'dismiss') {
      this.ptys.announceDismiss(target);
      this.ptys.kill(target); // kill removes its graph node + edges
      return this.respond(socket, { ok: true });
    }
    // assign
    const role = (req.role || '').trim();
    if (!role) return this.respond(socket, { ok: false, error: 'assign needs a role' });
    this.graph.rename(target, role);
    this.ptys.announceReassign(target, role);
    return this.respond(socket, { ok: true, data: { name: role } });
  }

  private respond(socket: net.Socket, res: BrokerResponse): void {
    if (socket.destroyed) return;
    socket.write(encode(res));
  }
}
