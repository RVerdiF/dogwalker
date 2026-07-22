import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
} from '@xyflow/react';
import type { GraphSnapshot, PresetId } from '../shared/ipc';
import { terminals, type Tier } from './terminalService';
import { TerminalNode, type TerminalFlowNode } from './TerminalNode';
import { FloatingLeash } from './FloatingLeash';
import { Hud } from './Hud';
import { HistoryPanel } from './HistoryPanel';
import { runSmoke } from './smoke';

const nodeTypes = { terminal: TerminalNode };
const edgeTypes = { leash: FloatingLeash };

const NODE_W = 560;
const NODE_H = 380;
const GRID_GAP_X = 620;
const GRID_GAP_Y = 440;
const GRID_COLS = 5;
/** Below this zoom, terminal text is unreadable — everything drops to tier 2. */
const READABLE_ZOOM = 0.5;
const VIEWPORT_MARGIN_PX = 100;
const MAX_TIER1 = 8;

const PRESETS: PresetId[] = ['shell', 'claude', 'codex', 'gemini', 'stress'];

function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<TerminalFlowNode>([]);
  const [graph, setGraph] = useState<GraphSnapshot>({ terminals: [], edges: [] });
  const [preset, setPreset] = useState<PresetId>('shell');
  const [mirrorInfo, setMirrorInfo] = useState('');
  const [historyPair, setHistoryPair] = useState<{
    a: string;
    b: string;
    aName: string;
    bName: string;
  } | null>(null);
  const { getViewport, setViewport } = useReactFlow();
  const spawnCount = useRef(0);
  const tierPass = useRef(false);
  const smokeRan = useRef(false);

  useEffect(() => {
    const offData = window.dw.onData((batch) => {
      for (const [id, data] of batch) terminals.write(id, data);
    });
    const offExit = window.dw.onExit((id) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, exited: true } } : n)),
      );
    });
    const offGraph = window.dw.onGraph(setGraph);
    void window.dw.graph().then(setGraph);
    return () => {
      offData();
      offExit();
      offGraph();
    };
  }, [setNodes]);

  // Leash edges are fully derived from the authoritative main-process graph.
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of graph.terminals) m.set(t.id, t.name);
    return m;
  }, [graph.terminals]);

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.a,
        target: e.b,
        // React Flow needs a resolvable source-type and target-type handle to
        // mount an edge. Name any visible source handle and the hidden "sink"
        // target. FloatingLeash recomputes the anchors from geometry, so these
        // names don't affect how the leash looks.
        sourceHandle: 'right',
        targetHandle: 'sink',
        type: 'leash',
      })),
    [graph.edges],
  );

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target && c.source !== c.target) {
      void window.dw.connect(c.source, c.target);
    }
  }, []);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) void window.dw.disconnect(e.id);
  }, []);

  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (_evt, edge) => {
      setHistoryPair({
        a: edge.source,
        b: edge.target,
        aName: nameById.get(edge.source) ?? edge.source,
        bName: nameById.get(edge.target) ?? edge.target,
      });
    },
    [nameById],
  );

  const recomputeTiers = useCallback(() => {
    if (tierPass.current) return;
    tierPass.current = true;
    requestAnimationFrame(() => {
      tierPass.current = false;
      const vp = getViewport();
      setNodes((ns) => {
        const rects = ns.map((n) => {
          const w = (n.measured?.width ?? NODE_W) * vp.zoom;
          const h = (n.measured?.height ?? NODE_H) * vp.zoom;
          const x = n.position.x * vp.zoom + vp.x;
          const y = n.position.y * vp.zoom + vp.y;
          const visible =
            x + w > -VIEWPORT_MARGIN_PX &&
            y + h > -VIEWPORT_MARGIN_PX &&
            x < window.innerWidth + VIEWPORT_MARGIN_PX &&
            y < window.innerHeight + VIEWPORT_MARGIN_PX;
          return { node: n, visible, area: w * h };
        });

        const tier1 = new Set<string>();
        if (vp.zoom >= READABLE_ZOOM) {
          rects
            .filter((r) => r.visible)
            .sort((a, b) => {
              if (a.node.selected !== b.node.selected) return a.node.selected ? -1 : 1;
              return b.area - a.area;
            })
            .slice(0, MAX_TIER1)
            .forEach((r) => tier1.add(r.node.id));
        }

        const desired = new Map<string, Tier>();
        for (const r of rects) {
          desired.set(r.node.id, tier1.has(r.node.id) ? 1 : r.visible ? 2 : 3);
        }

        // Demotions free WebGL contexts before promotions claim them.
        for (const [id, tier] of desired) if (tier === 3) terminals.setTier(id, 3);
        for (const [id, tier] of desired) if (tier === 2) terminals.setTier(id, 2);
        for (const [id, tier] of desired) if (tier === 1) terminals.setTier(id, 1);

        let changed = false;
        const next = ns.map((n) => {
          const tier = desired.get(n.id) ?? 3;
          if (n.data.tier === tier) return n;
          changed = true;
          return { ...n, data: { ...n.data, tier } };
        });
        if (changed) {
          console.log(
            `[tiers] zoom=${vp.zoom.toFixed(2)} x=${Math.round(vp.x)} y=${Math.round(vp.y)} ` +
              `win=${window.innerWidth}x${window.innerHeight} → ` +
              [...desired.entries()].map(([id, t]) => `${id}:${t}`).join(' '),
          );
        }
        return changed ? next : ns;
      });
    });
  }, [getViewport, setNodes]);

  useEffect(() => {
    recomputeTiers();
  }, [nodes.length, recomputeTiers]);

  // Safety tick: onMove can be swallowed by the rAF guard mid-transition,
  // leaving the last viewport unclassified. Recompute is a no-op when nothing
  // changed, so an idle tick is effectively free and self-heals any miss.
  useEffect(() => {
    const tick = window.setInterval(recomputeTiers, 500);
    return () => window.clearInterval(tick);
  }, [recomputeTiers]);

  const spawnOne = useCallback(
    async (p: PresetId) => {
      const n = spawnCount.current++;
      const cols = 80;
      const rows = 24;
      const name = `${p}-${n + 1}`;
      const { id } = await window.dw.spawn({ preset: p, name, cols, rows });
      terminals.create(id);
      const node: TerminalFlowNode = {
        id,
        type: 'terminal',
        dragHandle: '.dw-drag',
        position: {
          x: (n % GRID_COLS) * GRID_GAP_X,
          y: Math.floor(n / GRID_COLS) * GRID_GAP_Y,
        },
        style: { width: NODE_W, height: NODE_H },
        data: { name, preset: p, tier: 3 as Tier, exited: false },
      };
      setNodes((ns) => [...ns, node]);
      return id;
    },
    [setNodes],
  );

  const spawn15 = useCallback(async () => {
    for (let i = 0; i < 15; i++) await spawnOne(preset);
  }, [preset, spawnOne]);

  useEffect(() => {
    if (smokeRan.current) return;
    if (!new URLSearchParams(window.location.search).has('smoke')) return;
    smokeRan.current = true;
    void runSmoke({ spawn: spawnOne, setViewport, getViewport });
  }, [spawnOne, setViewport, getViewport]);

  // Verifies the floating-leash origin fix: node B is placed to the RIGHT of A,
  // so the leash must leave A's right side (x near A's right edge), not its left.
  useEffect(() => {
    if (smokeRan.current) return;
    if (!new URLSearchParams(window.location.search).has('edgetest')) return;
    smokeRan.current = true;
    void (async () => {
      const a = await spawnOne('shell');
      const b = await spawnOne('shell'); // grid places b at x=GRID_GAP_X (right of a)
      await window.dw.connect(a, b);
      await new Promise((r) => setTimeout(r, 800));
      const edgeEls = document.querySelectorAll('.react-flow__edge').length;
      const anyPath = document.querySelectorAll('.react-flow__edge-path').length;
      const pathEl =
        document.querySelector<SVGPathElement>('.dw-leash-path') ??
        document.querySelector<SVGPathElement>('.react-flow__edge-path');
      const d = pathEl?.getAttribute('d') ?? '';
      const m = /M\s*([\d.-]+)[ ,]([\d.-]+)/.exec(d);
      const startX = m ? Number(m[1]) : NaN;
      const node = document.querySelector('.react-flow__node');
      const sides = ['top', 'right', 'bottom', 'left'].filter((s) =>
        node?.querySelector(`.react-flow__handle-${s}`),
      );
      console.log(
        'EDGETEST RESULT ' +
          JSON.stringify({
            edgeEls,
            anyPath,
            pathClass: pathEl?.getAttribute('class') ?? null,
            startX: Math.round(startX),
            leavesRightSide: startX > NODE_W / 2,
            handleSides: sides,
          }),
      );
    })();
  }, [spawnOne]);

  const killAll = useCallback(() => {
    setNodes((ns) => {
      for (const n of ns) {
        window.dw.kill(n.id);
        terminals.dispose(n.id);
      }
      return [];
    });
    spawnCount.current = 0;
  }, [setNodes]);

  const mirrorCheck = useCallback(async () => {
    const selected = nodes.find((n) => n.selected);
    if (!selected) {
      setMirrorInfo('mirror: select a terminal first');
      return;
    }
    const snapshot = await window.dw.serialize(selected.id);
    const lines = snapshot.split('\n');
    const last = lines.filter((l) => l.trim()).slice(-1)[0] ?? '';
    setMirrorInfo(
      `mirror[${selected.id}] tier=${terminals.tierOf(selected.id)} ` +
        `${snapshot.length}B ${lines.length} lines · last: ${last.slice(0, 60)}`,
    );
  }, [nodes]);

  return (
    <div className="dw-root">
      <div className="dw-toolbar">
        <span className="dw-logo">🐕 Dogwalker</span>
        <select value={preset} onChange={(e) => setPreset(e.target.value as PresetId)}>
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button onClick={() => void spawnOne(preset)}>Spawn</button>
        <button onClick={() => void spawn15()}>Spawn 15</button>
        <button onClick={() => void mirrorCheck()}>Mirror check</button>
        <button onClick={killAll}>Kill all</button>
        <span className="dw-hint">drag a node's side handle to another to leash · click a leash for history</span>
        {mirrorInfo && <span className="dw-mirror-info">{mirrorInfo}</span>}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onEdgeClick={onEdgeClick}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={45}
        onMove={recomputeTiers}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
      </ReactFlow>
      <Hud />
      <HistoryPanel pair={historyPair} onClose={() => setHistoryPair(null)} />
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
