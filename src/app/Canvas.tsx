import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
} from '@xyflow/react';
import type { GraphSnapshot, NodeSpec, PresetId, WorkspaceLayout } from '../shared/ipc';
import { terminals, type Tier } from './terminalService';
import { TerminalNode, type TerminalFlowNode } from './TerminalNode';
import { FloatingLeash } from './FloatingLeash';
import { Hud } from './Hud';
import { HistoryPanel } from './HistoryPanel';
import { DevBar } from './DevBar';
import { TerminalPalette } from './TerminalPalette';
import { runSmoke } from './smoke';

const nodeTypes = { terminal: TerminalNode };
const edgeTypes = { leash: FloatingLeash };

const NODE_W = 560;
const NODE_H = 380;
const GRID_GAP_X = 620;
const GRID_GAP_Y = 440;
const GRID_COLS = 5;
const READABLE_ZOOM = 0.5;
const VIEWPORT_MARGIN_PX = 100;
const MAX_TIER1 = 8;
const SAVE_DEBOUNCE_MS = 400;

interface Props {
  workspaceId: string;
  isDev: boolean;
}

export function Canvas({ workspaceId, isDev }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TerminalFlowNode>([]);
  const [graph, setGraph] = useState<GraphSnapshot>({ terminals: [], edges: [] });
  const [historyPair, setHistoryPair] = useState<{
    a: string;
    b: string;
    aName: string;
    bName: string;
  } | null>(null);
  const { getViewport, setViewport } = useReactFlow();
  const spawnCount = useRef(0);
  const tierPass = useRef(false);
  const harnessRan = useRef(false);
  const loaded = useRef(false);
  const tearingDown = useRef(false);
  const stableToLive = useRef(new Map<string, string>());

  // ---- live PTY data / graph subscriptions ---------------------------------
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

  // ---- spawn helpers -------------------------------------------------------
  const addNode = useCallback(
    async (spec: NodeSpec) => {
      const { id } = await window.dw.spawn({
        preset: spec.preset,
        name: spec.name,
        cols: 80,
        rows: 24,
      });
      terminals.create(id);
      stableToLive.current.set(spec.stableId, id);
      const node: TerminalFlowNode = {
        id,
        type: 'terminal',
        dragHandle: '.dw-drag',
        position: { x: spec.x, y: spec.y },
        style: { width: spec.w, height: spec.h },
        data: {
          name: spec.name,
          preset: spec.preset,
          tier: 3 as Tier,
          exited: false,
          stableId: spec.stableId,
        },
      };
      setNodes((ns) => [...ns, node]);
      return id;
    },
    [setNodes],
  );

  const spawnNew = useCallback(
    (preset: PresetId) => {
      const n = spawnCount.current++;
      return addNode({
        stableId: crypto.randomUUID(),
        name: `${preset}-${n + 1}`,
        preset,
        x: (n % GRID_COLS) * GRID_GAP_X,
        y: Math.floor(n / GRID_COLS) * GRID_GAP_Y,
        w: NODE_W,
        h: NODE_H,
      });
    },
    [addNode],
  );

  // ---- load this workspace's layout, then wire its connections -------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ws = await window.dw.loadWorkspace(workspaceId);
      if (cancelled) return;
      for (const spec of ws.layout.nodes) {
        await addNode(spec);
        spawnCount.current = Math.max(spawnCount.current, ws.layout.nodes.length);
      }
      for (const [sa, sb] of ws.layout.edges) {
        const la = stableToLive.current.get(sa);
        const lb = stableToLive.current.get(sb);
        if (la && lb) await window.dw.connect(la, lb);
      }
      loaded.current = true;
    })();
    return () => {
      cancelled = true;
      // Stop persistence BEFORE killing terminals: teardown empties the graph
      // (removeTerminal drops edges), and a debounced save must not clobber the
      // stored layout with nodes-minus-edges. Switching kills this workspace's
      // terminals (keep-alive is v0.2).
      tearingDown.current = true;
      loaded.current = false;
      setNodes((ns) => {
        for (const n of ns) {
          window.dw.kill(n.id);
          terminals.dispose(n.id);
        }
        return [];
      });
      stableToLive.current.clear();
      spawnCount.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // ---- persistence: debounced layout snapshot ------------------------------
  const persist = useCallback(() => {
    if (!loaded.current || tearingDown.current) return;
    const liveToStable = new Map<string, string>();
    const specs: NodeSpec[] = nodes.map((n) => {
      liveToStable.set(n.id, n.data.stableId);
      const w =
        n.measured?.width ??
        (typeof n.style?.width === 'number' ? n.style.width : NODE_W);
      const h =
        n.measured?.height ??
        (typeof n.style?.height === 'number' ? n.style.height : NODE_H);
      return {
        stableId: n.data.stableId,
        name: n.data.name,
        preset: n.data.preset,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        w: Math.round(w),
        h: Math.round(h),
      };
    });
    const edges: Array<[string, string]> = [];
    for (const e of graph.edges) {
      const sa = liveToStable.get(e.a);
      const sb = liveToStable.get(e.b);
      if (sa && sb) edges.push([sa, sb]);
    }
    const layout: WorkspaceLayout = { nodes: specs, edges };
    void window.dw.saveLayout(workspaceId, layout);
  }, [nodes, graph.edges, workspaceId]);

  useEffect(() => {
    if (!loaded.current) return;
    const t = window.setTimeout(persist, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [persist]);

  // ---- leash edges (derived from the authoritative graph) ------------------
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

  // ---- rendering degradation ladder ----------------------------------------
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
        return changed ? next : ns;
      });
    });
  }, [getViewport, setNodes]);

  useEffect(() => {
    recomputeTiers();
  }, [nodes.length, recomputeTiers]);

  useEffect(() => {
    const tick = window.setInterval(recomputeTiers, 500);
    return () => window.clearInterval(tick);
  }, [recomputeTiers]);

  // ---- dev harnesses (query-param gated) -----------------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (harnessRan.current) return;
    if (params.has('smoke')) {
      harnessRan.current = true;
      void runSmoke({ spawn: spawnNew, setViewport, getViewport });
    }
  }, [spawnNew, setViewport, getViewport]);

  // Palette create path: click a preset chip, assert a terminal is born.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('palettetest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      await sleep(600);
      const chips = document.querySelectorAll<HTMLButtonElement>('.dw-palette-chip');
      const before = (await window.dw.graph()).terminals.length;
      chips[1]?.click(); // the "Claude" chip
      await sleep(1200);
      const g = await window.dw.graph();
      const devBtns = document.querySelectorAll('.dw-devbar button').length;
      console.log(
        'PALETTETEST RESULT ' +
          JSON.stringify({
            chips: chips.length,
            devBtns,
            before,
            after: g.terminals.length,
            spawnedName: g.terminals.at(-1)?.name,
          }),
      );
    })();
  }, []);

  // Persistence round-trip: launch 1 (empty layout) creates 2 nodes + a leash
  // and saves; launch 2 (non-empty) restores on mount — we assert the live
  // graph, then clear so the test workspace doesn't linger.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('persisttest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      const ws0 = await window.dw.loadWorkspace(workspaceId);
      if (ws0.layout.nodes.length === 0) {
        const a = await spawnNew('shell');
        const b = await spawnNew('shell');
        await window.dw.connect(a, b);
        await sleep(1000); // > save debounce
        const saved = await window.dw.loadWorkspace(workspaceId);
        const ids = new Set(saved.layout.nodes.map((n) => n.stableId));
        console.log(
          'PERSISTTEST SAVED ' +
            JSON.stringify({
              nodes: saved.layout.nodes.length,
              edges: saved.layout.edges.length,
              geomOk: saved.layout.nodes.every((n) => n.w > 0 && n.h > 0),
              namesOk: saved.layout.nodes.every((n) => !!n.name && !!n.preset),
              edgeIntegrity: saved.layout.edges.every(
                ([x, y]) => ids.has(x) && ids.has(y),
              ),
              hint: 'relaunch with the same flag to test restore',
            }),
        );
      } else {
        await sleep(1400); // allow mount-restore + wiring
        const g = await window.dw.graph();
        console.log(
          'PERSISTTEST RESTORED ' +
            JSON.stringify({
              specNodes: ws0.layout.nodes.length,
              specEdges: ws0.layout.edges.length,
              liveNodes: g.terminals.length,
              liveEdges: g.edges.length,
              match:
                g.terminals.length === ws0.layout.nodes.length &&
                g.edges.length === ws0.layout.edges.length,
            }),
        );
        // Clean up: stop persistence, kill live terminals, store empty layout.
        loaded.current = false;
        for (const t of g.terminals) window.dw.kill(t.id);
        await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
      }
    })();
  }, [workspaceId, spawnNew]);

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

  return (
    <div className="dw-canvas-host">
      <TerminalPalette onSpawn={(p) => void spawnNew(p)} />
      {isDev && (
        <DevBar
          onSpawn15={() => {
            void (async () => {
              for (let i = 0; i < 15; i++) await spawnNew('stress');
            })();
          }}
          onKillAll={killAll}
        />
      )}
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
      {isDev && <Hud />}
      <HistoryPanel pair={historyPair} onClose={() => setHistoryPair(null)} />
    </div>
  );
}
