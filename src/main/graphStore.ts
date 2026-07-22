import { EventEmitter } from 'node:events';
import type {
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  NodeKind,
  PresetId,
} from '../shared/ipc';

/**
 * Authoritative connection graph (ARCHITECTURE.md §2, §11): identity of every
 * node (terminal or note) and every leash between them. The renderer reflects
 * this for drawing; the broker authorizes CLI requests strictly against it — a
 * terminal can only reach what it is wired to. Layout/positions are NOT here
 * (those are renderer/persistence concerns).
 */
export class GraphStore extends EventEmitter {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private nextEdge = 1;

  addNode(id: string, name: string, kind: NodeKind, preset?: PresetId): void {
    this.nodes.set(id, { id, name, kind, preset });
    this.emitChange();
  }

  removeNode(id: string): void {
    if (!this.nodes.delete(id)) return;
    for (const [edgeId, e] of this.edges) {
      if (e.a === id || e.b === id) this.edges.delete(edgeId);
    }
    this.emitChange();
  }

  rename(id: string, name: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.name = name;
    this.emitChange();
  }

  kindOf(id: string): NodeKind | null {
    return this.nodes.get(id)?.kind ?? null;
  }

  name(id: string): string {
    return this.nodes.get(id)?.name ?? id;
  }

  /** Resolve a caller-supplied target (id or name) among the caller's peers. */
  resolvePeer(from: string, target: string, kind?: NodeKind): string | null {
    const peers = this.neighbors(from);
    const ok = (id: string) => !kind || this.nodes.get(id)?.kind === kind;
    if (peers.has(target) && ok(target)) return target;
    for (const peerId of peers) {
      if (this.nodes.get(peerId)?.name === target && ok(peerId)) return peerId;
    }
    return null;
  }

  /** Resolve any node by id or name (used by the `connect` verb). */
  resolveAny(target: string): string | null {
    if (this.nodes.has(target)) return target;
    for (const n of this.nodes.values()) {
      if (n.name === target) return n.id;
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
    if (a === b || !this.nodes.has(a) || !this.nodes.has(b)) return null;
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
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()],
    };
  }

  private emitChange(): void {
    this.emit('change', this.snapshot());
  }
}
