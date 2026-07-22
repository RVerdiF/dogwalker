import { EventEmitter } from 'node:events';
import type {
  GraphEdge,
  GraphSnapshot,
  GraphTerminal,
  PresetId,
} from '../shared/ipc';

/**
 * Authoritative connection graph (ARCHITECTURE.md §2, §11): identity of every
 * terminal and every leash between nodes. The renderer reflects this for
 * drawing; the broker authorizes CLI requests strictly against it — a terminal
 * can only reach what it is wired to. Layout/positions are NOT here (those are
 * renderer/persistence concerns).
 */
export class GraphStore extends EventEmitter {
  private terminals = new Map<string, GraphTerminal>();
  private edges = new Map<string, GraphEdge>();
  private nextEdge = 1;

  addTerminal(id: string, name: string, preset: PresetId): void {
    this.terminals.set(id, { id, name, preset });
    this.emitChange();
  }

  removeTerminal(id: string): void {
    if (!this.terminals.delete(id)) return;
    for (const [edgeId, e] of this.edges) {
      if (e.a === id || e.b === id) this.edges.delete(edgeId);
    }
    this.emitChange();
  }

  name(id: string): string {
    return this.terminals.get(id)?.name ?? id;
  }

  /** Resolve a caller-supplied target (id or name) among the caller's peers. */
  resolvePeer(from: string, target: string): string | null {
    const peers = this.neighbors(from);
    if (peers.has(target)) return target;
    for (const peerId of peers) {
      if (this.terminals.get(peerId)?.name === target) return peerId;
    }
    return null;
  }

  /** Resolve any terminal by id or name (used by the `connect` verb). */
  resolveAny(target: string): string | null {
    if (this.terminals.has(target)) return target;
    for (const t of this.terminals.values()) {
      if (t.name === target) return t.id;
    }
    return null;
  }

  neighbors(id: string): Set<string> {
    const out = new Set<string>();
    for (const e of this.edges.values()) {
      if (e.a === id) out.add(e.b);
      else if (e.b === id) out.add(e.a);
    }
    return out;
  }

  areConnected(a: string, b: string): boolean {
    return this.neighbors(a).has(b);
  }

  connect(a: string, b: string): GraphEdge | null {
    if (a === b || !this.terminals.has(a) || !this.terminals.has(b)) return null;
    if (this.areConnected(a, b)) return null;
    const edge: GraphEdge = { id: `e${this.nextEdge++}`, a, b };
    this.edges.set(edge.id, edge);
    this.emitChange();
    return edge;
  }

  disconnect(edgeId: string): void {
    if (this.edges.delete(edgeId)) this.emitChange();
  }

  snapshot(): GraphSnapshot {
    return {
      terminals: [...this.terminals.values()],
      edges: [...this.edges.values()],
    };
  }

  private emitChange(): void {
    this.emit('change', this.snapshot());
  }
}
