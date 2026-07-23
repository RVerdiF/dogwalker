import * as net from 'node:net';
import * as crypto from 'node:crypto';
import type { GraphStore } from './graphStore';
import type { PtyManager } from './ptyManager';
import type { History } from './history';
import type { NoteStore } from './noteStore';
import {
  encode,
  type BrokerRequest,
  type BrokerResponse,
} from '../shared/protocol';

interface Pending {
  socket: net.Socket;
  from: string;
  to: string;
  timer: NodeJS.Timeout;
}

const ASK_TIMEOUT_MS = 120_000;

/**
 * The single agent-facing authority (ARCHITECTURE.md §5). Every capability a
 * terminal's CLI can invoke lives here; the shim is a dumb pipe. Authorization
 * is strictly the connection graph — a terminal reaches only what it is wired
 * to. No ambient authority.
 */
export class Broker {
  private server: net.Server;
  private pending = new Map<string, Pending>();

  constructor(
    private pipePath: string,
    private graph: GraphStore,
    private ptys: PtyManager,
    private history: History,
    private notes: NoteStore,
  ) {
    this.server = net.createServer((socket) => this.onConnection(socket));
  }

  listen(): void {
    // On Windows `pipePath` is a \\.\pipe\ name; on posix a filesystem socket.
    this.server.listen(this.pipePath);
  }

  close(): void {
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
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
        return this.handleAsk(socket, req.from, req.target, req.body);
      case 'reply':
        return this.handleReply(socket, req.from, req.msgId, req.body);
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
      default:
        return this.respond(socket, { ok: false, error: 'unknown command' });
    }
  }

  private handleAsk(
    socket: net.Socket,
    from: string,
    target: string,
    body: string,
  ): void {
    const to = this.graph.resolvePeer(from, target);
    if (!to) {
      return this.respond(socket, {
        ok: false,
        error: `no connected terminal named "${target}"`,
      });
    }
    const msgId = crypto.randomBytes(3).toString('hex');
    this.history.append({ ts: Date.now(), kind: 'ask', from, to, msgId, body });

    const fromName = this.graph.name(from);
    const delivery =
      `[dogwalker] message from ${fromName} (id ${msgId}). When done, reply with:\n` +
      `dogwalker reply ${msgId} --stdin  (end with a line containing only EOF)\n` +
      body;
    this.ptys.inject(to, delivery);

    const timer = setTimeout(() => {
      this.pending.delete(msgId);
      this.respond(socket, { ok: false, error: 'timed out waiting for reply' });
    }, ASK_TIMEOUT_MS);
    this.pending.set(msgId, { socket, from, to, timer });
  }

  private handleReply(
    socket: net.Socket,
    from: string,
    msgId: string,
    body: string,
  ): void {
    const pending = this.pending.get(msgId);
    if (!pending) {
      return this.respond(socket, {
        ok: false,
        error: 'unknown or expired message id',
      });
    }
    if (pending.to !== from) {
      return this.respond(socket, {
        ok: false,
        error: 'only the addressed terminal may reply',
      });
    }
    clearTimeout(pending.timer);
    this.pending.delete(msgId);
    this.history.append({
      ts: Date.now(),
      kind: 'reply',
      from,
      to: pending.from,
      msgId,
      body,
    });
    // Unblock the original asker on its held connection.
    this.respond(pending.socket, { ok: true, data: { body } });
    // Acknowledge the replier.
    this.respond(socket, { ok: true });
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
    const peers = [...this.graph.neighbors(from)].map((id) => ({
      id,
      name: this.graph.name(id),
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

  private respond(socket: net.Socket, res: BrokerResponse): void {
    if (socket.destroyed) return;
    socket.write(encode(res));
  }
}
