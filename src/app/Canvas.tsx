import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  useNodesState,
  useReactFlow,
  ViewportPortal,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type OnNodeDrag,
  type NodeMouseHandler,
} from '@xyflow/react';
import type {
  FileTreeSpec,
  GraphSnapshot,
  NodeSpec,
  NoteSpec,
  PortalSpec,
  PresetId,
  PreviewSpec,
  TerminalSpec,
  WorkspaceLayout,
} from '../shared/ipc';
import { terminals, type Tier } from './terminalService';
import { BUILTIN_THEMES } from '../shared/themes';
import { TerminalNode, type TerminalFlowNode } from './TerminalNode';
import { NoteNode, type NoteFlowNode } from './NoteNode';
import { GroupNode, type GroupFlowNode } from './GroupNode';
import { FileTreeNode, type FileTreeFlowNode } from './FileTreeNode';
import { PreviewNode, type PreviewFlowNode } from './PreviewNode';
import { PortalNode, type PortalFlowNode } from './PortalNode';
import { getFileDrag, setFileDrag } from './dnd';
import { fuzzyFilter, fuzzyScore } from './fuzzy';
import { FloatingLeash } from './FloatingLeash';
import { Hud } from './Hud';
import { HistoryPanel } from './HistoryPanel';
import { DevBar } from './DevBar';
import { TerminalPalette } from './TerminalPalette';
import { DogwalkerLogo } from './icons';
import { Composer, type ComposerTarget, type Mention } from './Composer';
import { CanvasMenu } from './CanvasMenu';
import {
  align,
  distribute,
  tidy,
  type AlignKind,
  type Box,
  type DistributeKind,
} from './layoutOps';
import { snapMove, type Guide, type SnapBox } from './snapping';
import { runSmoke } from './smoke';

type DwNode =
  | TerminalFlowNode
  | NoteFlowNode
  | GroupFlowNode
  | FileTreeFlowNode
  | PreviewFlowNode
  | PortalFlowNode;

const nodeTypes = {
  terminal: TerminalNode,
  note: NoteNode,
  group: GroupNode,
  filetree: FileTreeNode,
  preview: PreviewNode,
  portal: PortalNode,
};
const edgeTypes = { leash: FloatingLeash };

const GROUP_PAD = 28;
const GROUP_HEADER = 30;

/**
 * Parented nodes store positions relative to their group, so anything working in
 * screen/world space (viewport culling, align/tidy) must resolve them first.
 */
function absPos(n: DwNode, byId: Map<string, DwNode>): { x: number; y: number } {
  let { x, y } = n.position;
  let parent = n.parentId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const p = byId.get(parent);
    if (!p) break;
    x += p.position.x;
    y += p.position.y;
    parent = p.parentId;
  }
  return { x, y };
}

const NODE_W = 560;
const NODE_H = 380;
const NOTE_W = 320;
const NOTE_H = 240;
const FT_W = 340;
const FT_H = 380;
const PV_W = 320;
const PV_H = 300;
const PORTAL_W = 720;
const PORTAL_H = 520;
const GRID_GAP_X = 620;
const GRID_GAP_Y = 440;
const GRID_COLS = 5;
const READABLE_ZOOM = 0.5;
const VIEWPORT_MARGIN_PX = 100;
const MAX_TIER1 = 8;
const SAVE_DEBOUNCE_MS = 400;

interface Props {
  workspaceId: string;
  workspaceCwd: string;
  /** Which layer is shown: 'ground' or a floor id (PRODUCT.md §10). */
  floorId: string;
  /** Human floor label ('ground' or the floor name), shown in `list`. */
  floorLabel: string;
  isDev: boolean;
  notifyOnAttention: boolean;
}

export function Canvas({
  workspaceId,
  workspaceCwd,
  floorId,
  floorLabel,
  isDev,
  notifyOnAttention,
}: Props) {
  // Terminals + layout are scoped to the layer. Ground reuses the workspace id
  // so pre-floor grouping (and the test harnesses) are unchanged.
  const layerId = floorId === 'ground' ? workspaceId : floorId;
  const [nodes, setNodes, onNodesChange] = useNodesState<DwNode>([]);
  const [graph, setGraph] = useState<GraphSnapshot>({ nodes: [], edges: [] });
  const [historyPair, setHistoryPair] = useState<{
    a: string;
    b: string;
    aName: string;
    bName: string;
  } | null>(null);
  const { getViewport, setViewport, screenToFlowPosition } = useReactFlow();
  const [focusSignal, setFocusSignal] = useState(0);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showHud, setShowHud] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; count: number } | null>(
    null,
  );
  const [guides, setGuides] = useState<Guide[]>([]);
  const spawnCount = useRef(0);
  const tierPass = useRef(false);
  const harnessRan = useRef(false);
  const loaded = useRef(false);
  const tearingDown = useRef(false);
  const stableToLive = useRef(new Map<string, string>());
  /** Latest persist(), so teardown can flush before the canvas goes away. */
  const persistRef = useRef<() => void>(() => undefined);
  // Latest values for event handlers registered once on mount.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const notifyRef = useRef(notifyOnAttention);
  notifyRef.current = notifyOnAttention;

  // ---- live PTY data / graph subscriptions ---------------------------------
  useEffect(() => {
    const offData = window.dw.onData((batch) => {
      for (const [id, data] of batch) terminals.write(id, data);
    });
    const offExit = window.dw.onExit((id) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.type === 'terminal' && n.id === id
            ? { ...n, data: { ...n.data, exited: true } }
            : n,
        ),
      );
    });
    const offAttention = window.dw.onAttention(({ id, value }) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.type === 'terminal' && n.id === id
            ? { ...n, data: { ...n.data, attention: value } }
            : n,
        ),
      );
      // Focus suppresses the notification, never the detection (invariant #8).
      if (value && notifyRef.current) {
        const node = nodesRef.current.find((n) => n.id === id);
        if (node && !node.selected && node.type === 'terminal') {
          window.dw.notify('Dogwalker', `${node.data.name} needs attention`);
        }
      }
    });
    const offGraph = window.dw.onGraph(setGraph);
    void window.dw.graph().then(setGraph);
    return () => {
      offData();
      offExit();
      offAttention();
      offGraph();
    };
  }, [setNodes]);

  // ---- spawn helpers -------------------------------------------------------
  const addTerminal = useCallback(
    async (spec: TerminalSpec, adoptId?: string) => {
      // `adoptId` = a terminal still running from before a workspace switch:
      // re-attach to it and replay its mirror instead of spawning a new one.
      let id = adoptId ?? '';
      if (id) {
        terminals.create(id);
        if (spec.roleId) void window.dw.assignTerminalRole(id, spec.roleId);
        const snapshot = await window.dw.serialize(id);
        if (snapshot) terminals.write(id, snapshot);
        window.dw.setMemoryLimit(id, spec.memoryLimitMB ?? 0);
      } else {
        id = (
          await window.dw.spawn({
            preset: spec.preset,
            name: spec.name,
            cols: 80,
            rows: 24,
            workspaceId: layerId,
            floorName: floorLabel,
            stableId: spec.stableId,
            cwd: workspaceCwd,
            memoryLimitMB: spec.memoryLimitMB ?? 0,
            walker: spec.walker ?? false,
          })
        ).id;
        terminals.create(id);
        if (spec.roleId) void window.dw.assignTerminalRole(id, spec.roleId);
      }
      stableToLive.current.set(spec.stableId, id); // terminal graph id = live id
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
          memoryLimitMB: spec.memoryLimitMB ?? 0,
          walker: spec.walker ?? false,
          roleId: spec.roleId,
        },
      };
      setNodes((ns) => [...ns, node]);
      return id;
    },
    [setNodes, layerId, workspaceCwd, floorLabel],
  );

  const addNoteNode = useCallback(
    async (spec: NoteSpec) => {
      // A note's graph id IS its stableId (there is no ephemeral process id).
      await window.dw.registerNote(spec.stableId, spec.name);
      stableToLive.current.set(spec.stableId, spec.stableId);
      const node: NoteFlowNode = {
        id: spec.stableId,
        type: 'note',
        dragHandle: '.dw-drag',
        position: { x: spec.x, y: spec.y },
        style: { width: spec.w, height: spec.h },
        data: { name: spec.name, stableId: spec.stableId },
      };
      setNodes((ns) => [...ns, node]);
      return spec.stableId;
    },
    [setNodes],
  );

  const addGroupNode = useCallback(
    (spec: NodeSpec) => {
      stableToLive.current.set(spec.stableId, spec.stableId);
      const node: GroupFlowNode = {
        id: spec.stableId,
        type: 'group',
        dragHandle: '.dw-drag',
        position: { x: spec.x, y: spec.y },
        style: { width: spec.w, height: spec.h, zIndex: -1 },
        data: { name: spec.name, stableId: spec.stableId },
      };
      setNodes((ns) => [node, ...ns]);
    },
    [setNodes],
  );

  const addFileTreeNode = useCallback(
    (spec: FileTreeSpec) => {
      // A file tree is pure layout — no graph/CLI node, id === stableId.
      stableToLive.current.set(spec.stableId, spec.stableId);
      const node: FileTreeFlowNode = {
        id: spec.stableId,
        type: 'filetree',
        dragHandle: '.dw-drag',
        position: { x: spec.x, y: spec.y },
        style: { width: spec.w, height: spec.h },
        data: {
          name: spec.name,
          stableId: spec.stableId,
          rootPath: spec.rootPath,
          workspaceId: layerId,
        },
      };
      setNodes((ns) => [...ns, node]);
      return spec.stableId;
    },
    [setNodes, layerId],
  );

  const addFileTree = useCallback(() => {
    const n = spawnCount.current++;
    addFileTreeNode({
      kind: 'filetree',
      stableId: crypto.randomUUID(),
      name: 'files',
      rootPath: workspaceCwd || '.',
      x: (n % GRID_COLS) * GRID_GAP_X,
      y: Math.floor(n / GRID_COLS) * GRID_GAP_Y,
      w: FT_W,
      h: FT_H,
    });
  }, [addFileTreeNode, workspaceCwd]);

  const addPreviewNode = useCallback(
    (spec: PreviewSpec) => {
      stableToLive.current.set(spec.stableId, spec.stableId);
      const node: PreviewFlowNode = {
        id: spec.stableId,
        type: 'preview',
        dragHandle: '.dw-drag',
        position: { x: spec.x, y: spec.y },
        style: { width: spec.w, height: spec.h },
        data: { name: spec.name, stableId: spec.stableId, filePath: spec.filePath },
      };
      setNodes((ns) => [...ns, node]);
      return spec.stableId;
    },
    [setNodes],
  );

  const addPortalNode = useCallback(
    async (spec: PortalSpec) => {
      // Register in the graph (awaited) before the node mounts, so restored
      // leashes to this portal resolve. The browser view is created by the node.
      await window.dw.portalRegister(spec.stableId, spec.name);
      stableToLive.current.set(spec.stableId, spec.stableId);
      const node: PortalFlowNode = {
        id: spec.stableId,
        type: 'portal',
        dragHandle: '.dw-drag',
        position: { x: spec.x, y: spec.y },
        style: { width: spec.w, height: spec.h },
        data: {
          name: spec.name,
          stableId: spec.stableId,
          url: spec.url,
          partition: spec.partition,
        },
      };
      setNodes((ns) => [...ns, node]);
      return spec.stableId;
    },
    [setNodes],
  );

  const addPortal = useCallback(
    async (opts?: { partition?: string; url?: string; at?: { x: number; y: number } }) => {
      const n = spawnCount.current++;
      const stableId = crypto.randomUUID();
      const name = `portal-${n + 1}`;
      await addPortalNode({
        kind: 'portal',
        stableId,
        name,
        url: opts?.url ?? 'about:blank',
        // Isolated session by default; a shared partition links two portals.
        partition: opts?.partition ?? stableId,
        x: opts?.at?.x ?? (n % GRID_COLS) * GRID_GAP_X,
        y: opts?.at?.y ?? Math.floor(n / GRID_COLS) * GRID_GAP_Y,
        w: PORTAL_W,
        h: PORTAL_H,
      });
      return { id: stableId, name };
    },
    [addPortalNode],
  );

  // Linking: a new portal that shares the source's session partition (so both
  // hold the same login), placed beside it and leashed to it.
  const addLinkedPortal = useCallback(
    async (sourceStableId: string) => {
      const src = nodesRef.current.find(
        (nd) => nd.type === 'portal' && nd.data.stableId === sourceStableId,
      );
      if (!src) return;
      const data = src.data as { partition: string; url: string };
      const at = {
        x: src.position.x + PORTAL_W + 40,
        y: src.position.y,
      };
      const { id } = await addPortal({ partition: data.partition, url: data.url, at });
      await window.dw.connect(sourceStableId, id);
    },
    [addPortal],
  );

  const baseName = (p: string) =>
    p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

  // A file dragged from a File Tree onto empty canvas becomes a preview node,
  // centered on the drop point.
  const addPreviewAt = useCallback(
    (filePath: string, at: { x: number; y: number }) => {
      spawnCount.current++;
      addPreviewNode({
        kind: 'preview',
        stableId: crypto.randomUUID(),
        name: baseName(filePath),
        filePath,
        x: at.x - PV_W / 2,
        y: at.y - 20,
        w: PV_W,
        h: PV_H,
      });
    },
    [addPreviewNode],
  );

  // Resolve a canvas drop: a folder opens a File Tree rooted at it, a file
  // becomes a preview. Extracted (and stat-driven) so the branch is testable.
  const handleFileDrop = useCallback(
    async (filePath: string, at: { x: number; y: number }) => {
      const st = await window.dw.statEntry(filePath);
      if (st?.isDir) {
        spawnCount.current++;
        addFileTreeNode({
          kind: 'filetree',
          stableId: crypto.randomUUID(),
          name: baseName(filePath),
          rootPath: filePath,
          x: at.x - FT_W / 2,
          y: at.y - 20,
          w: FT_W,
          h: FT_H,
        });
      } else {
        addPreviewAt(filePath, at);
      }
    },
    [addFileTreeNode, addPreviewAt],
  );

  const onCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      const path = getFileDrag(e);
      if (!path) return;
      e.preventDefault();
      const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      void handleFileDrop(path, at);
    },
    [screenToFlowPosition, handleFileDrop],
  );

  const onCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-dogwalker-file')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const spawnNew = useCallback(
    (preset: PresetId, roleId?: string) => {
      const n = spawnCount.current++;
      return addTerminal({
        kind: 'terminal',
        stableId: crypto.randomUUID(),
        name: `${preset}-${n + 1}`,
        preset,
        roleId,
        x: (n % GRID_COLS) * GRID_GAP_X,
        y: Math.floor(n / GRID_COLS) * GRID_GAP_Y,
        w: NODE_W,
        h: NODE_H,
      });
    },
    [addTerminal],
  );

  const addNote = useCallback(async () => {
    const n = spawnCount.current++;
    const name = `note-${n + 1}`;
    const id = await addNoteNode({
      kind: 'note',
      stableId: crypto.randomUUID(),
      name,
      x: (n % GRID_COLS) * GRID_GAP_X,
      y: Math.floor(n / GRID_COLS) * GRID_GAP_Y,
      w: NOTE_W,
      h: NOTE_H,
    });
    return { id, name };
  }, [addNoteNode]);

  // ---- load this workspace's layout, then wire its connections -------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const layout = await window.dw.loadLayer(workspaceId, floorId);
      if (cancelled) return;
      // Terminals kept running while this layer was in the background.
      const live = await window.dw.listTerminals(layerId);
      const liveByStable = new Map(live.map((t) => [t.stableId, t.id]));
      if (cancelled) return;
      spawnCount.current = layout.nodes.length;
      // Groups must exist before their members: React Flow requires a parent to
      // precede its children in the nodes array.
      for (const spec of layout.nodes) {
        if (spec.kind === 'group') addGroupNode(spec);
      }
      for (const spec of layout.nodes) {
        // Missing kind (pre-notes layouts) means terminal.
        if (spec.kind === 'group') continue;
        if (spec.kind === 'note') await addNoteNode(spec);
        else if (spec.kind === 'filetree') addFileTreeNode(spec);
        else if (spec.kind === 'preview') addPreviewNode(spec);
        else if (spec.kind === 'portal') await addPortalNode(spec);
        else await addTerminal(spec as TerminalSpec, liveByStable.get(spec.stableId));
      }
      // Re-attach members now that every node exists.
      const parentOf = new Map(
        layout.nodes
          .filter((s) => s.parentStableId)
          .map((s) => [s.stableId, s.parentStableId as string]),
      );
      if (parentOf.size > 0) {
        setNodes((ns) =>
          ns.map((n) => {
            const parentStable = parentOf.get(n.data.stableId);
            return parentStable
              ? { ...n, parentId: parentStable, extent: 'parent' as const }
              : n;
          }),
        );
      }
      for (const [sa, sb] of layout.edges) {
        const la = stableToLive.current.get(sa);
        const lb = stableToLive.current.get(sb);
        if (la && lb) await window.dw.connect(la, lb);
      }
      // Put the camera back where it was left (before enabling saves, so the
      // restore itself can't persist a stale viewport). Always set it — a
      // workspace with no saved camera must land at the origin, never inherit
      // whatever the previous workspace was showing.
      setViewport(layout.viewport ?? { x: 0, y: 0, zoom: 1 });
      loaded.current = true;
    })();
    return () => {
      cancelled = true;
      // Flush the pending debounced save FIRST: leaving a workspace seconds
      // after moving the camera or adding a node must not lose those changes.
      persistRef.current();
      // Stop persistence BEFORE tearing down, so a debounced save can't clobber
      // the stored layout mid-teardown. Leaving a workspace does NOT kill its
      // terminals or unload its notes — agents keep working in the background
      // and are re-adopted on return; releasing them is an explicit hibernate.
      // Only the renderer-side xterm instances are disposed here.
      tearingDown.current = true;
      loaded.current = false;
      setNodes((ns) => {
        for (const n of ns) {
          if (n.type === 'terminal') terminals.dispose(n.id);
          // Portals' native views are destroyed on unmount; drop their graph
          // nodes too so a viewless portal isn't left CLI-reachable.
          else if (n.type === 'portal') void window.dw.portalUnregister(n.id);
        }
        return [];
      });
      stableToLive.current.clear();
      spawnCount.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, floorId]);

  // ---- persistence: debounced layout snapshot ------------------------------
  const persist = useCallback(() => {
    if (!loaded.current || tearingDown.current) return;
    const liveToStable = new Map<string, string>();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const specs: NodeSpec[] = nodes.map((n) => {
      liveToStable.set(n.id, n.data.stableId);
      const w =
        n.measured?.width ??
        (typeof n.style?.width === 'number' ? n.style.width : NODE_W);
      const h =
        n.measured?.height ??
        (typeof n.style?.height === 'number' ? n.style.height : NODE_H);
      const base = {
        stableId: n.data.stableId,
        name: n.data.name,
        // Kept as stored: relative when the node lives inside a group.
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        w: Math.round(w),
        h: Math.round(h),
        parentStableId: n.parentId
          ? byId.get(n.parentId)?.data.stableId
          : undefined,
      };
      if (n.type === 'group') return { ...base, kind: 'group' as const };
      if (n.type === 'note') return { ...base, kind: 'note' as const };
      if (n.type === 'filetree')
        return { ...base, kind: 'filetree' as const, rootPath: n.data.rootPath };
      if (n.type === 'preview')
        return { ...base, kind: 'preview' as const, filePath: n.data.filePath };
      if (n.type === 'portal')
        return {
          ...base,
          kind: 'portal' as const,
          url: n.data.url,
          partition: n.data.partition,
        };
      return {
        ...base,
        kind: 'terminal' as const,
        preset: n.data.preset,
        roleId: n.data.roleId,
        walker: n.data.walker ?? false,
        memoryLimitMB: n.data.memoryLimitMB ?? 0,
      };
    });
    const edges: Array<[string, string]> = [];
    for (const e of graph.edges) {
      const sa = liveToStable.get(e.a);
      const sb = liveToStable.get(e.b);
      if (sa && sb) edges.push([sa, sb]);
    }
    const vp = getViewport();
    const layout: WorkspaceLayout = {
      nodes: specs,
      edges,
      viewport: {
        x: Math.round(vp.x),
        y: Math.round(vp.y),
        zoom: Number(vp.zoom.toFixed(3)),
      },
    };
    void window.dw.saveLayer(workspaceId, floorId, layout);
  }, [nodes, graph.edges, workspaceId, floorId, getViewport]);

  useEffect(() => {
    if (!loaded.current) return;
    const t = window.setTimeout(persist, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [persist]);

  // Panning/zooming doesn't change nodes, so the effect above won't fire — save
  // the camera when the user stops moving it.
  persistRef.current = persist;
  const cameraTimer = useRef<number | null>(null);
  const onMoveEnd = useCallback(() => {
    if (cameraTimer.current !== null) window.clearTimeout(cameraTimer.current);
    cameraTimer.current = window.setTimeout(
      () => persistRef.current(),
      SAVE_DEBOUNCE_MS,
    );
  }, []);

  // ---- leash edges (derived from the authoritative graph) ------------------
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of graph.nodes) m.set(n.id, n.name);
    return m;
  }, [graph.nodes]);

  // Background workspaces keep their nodes in the graph, so only render leashes
  // whose both ends are on THIS canvas.
  const edges = useMemo<Edge[]>(() => {
    const present = new Set(nodes.map((n) => n.id));
    return graph.edges
      .filter((e) => present.has(e.a) && present.has(e.b))
      .map((e) => ({
        id: e.id,
        source: e.a,
        target: e.b,
        sourceHandle: 'right',
        targetHandle: 'sink',
        type: 'leash',
      }));
  }, [graph.edges, nodes]);

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
        const byId = new Map(ns.map((n) => [n.id, n]));
        // Only terminals ride the ladder; notes are plain DOM, always rendered.
        const rects = ns
          .filter((n): n is TerminalFlowNode => n.type === 'terminal')
          .map((n) => {
            const abs = absPos(n, byId);
            const w = (n.measured?.width ?? NODE_W) * vp.zoom;
            const h = (n.measured?.height ?? NODE_H) * vp.zoom;
            const x = abs.x * vp.zoom + vp.x;
            const y = abs.y * vp.zoom + vp.y;
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
          if (n.type !== 'terminal') return n;
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
      const before = (await window.dw.graph()).nodes.length;
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
            after: g.nodes.length,
            spawnedName: g.nodes.at(-1)?.name,
          }),
      );
    })();
  }, []);

  // Attention test: a command raises attention after it goes quiet; input clears
  // it; the node reflects the dot.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('attentiontest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      let lastVal: boolean | null = null;
      const off = window.dw.onAttention(({ value }) => {
        lastVal = value;
      });
      const term = await spawnNew('shell');
      await sleep(1500); // shell init (no attention yet — never engaged)
      const idleBeforeRun = lastVal;
      window.dw.write(term, 'echo attn-check\r');
      await sleep(3300); // > quiescence window
      const roseTrue = lastVal === true;
      const dotShown = !!document.querySelector('.dw-attention');
      window.dw.write(term, 'x'); // a keystroke engages → clears attention
      await sleep(500);
      const clearedFalse = lastVal === false;
      const dotGone = !document.querySelector('.dw-attention');
      off();
      console.log(
        'ATTENTIONTEST RESULT ' +
          JSON.stringify({ idleBeforeRun, roseTrue, dotShown, clearedFalse, dotGone }),
      );
      loaded.current = false;
      window.dw.kill(term);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, spawnNew]);

  // Theme test: applying a theme recolors live terminals and new ones; the
  // selection persists.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('themetest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      const term = await spawnNew('shell');
      await sleep(400);
      const before = terminals.themeBg(term);
      const dracula = BUILTIN_THEMES.find((t) => t.name === 'Dracula');
      if (dracula) terminals.setTheme(dracula.theme);
      const afterLive = terminals.themeBg(term);
      const term2 = await spawnNew('shell');
      await sleep(200);
      const afterNew = terminals.themeBg(term2);
      await window.dw.setSettings({ themeName: 'Dracula' });
      const s = await window.dw.getSettings();
      const custom = await window.dw.listCustomThemes();
      console.log(
        'THEMETEST RESULT ' +
          JSON.stringify({
            builtinCount: BUILTIN_THEMES.length,
            before,
            liveOk: afterLive === '#282a36',
            newOk: afterNew === '#282a36',
            persistOk: s.themeName === 'Dracula',
            customIsList: Array.isArray(custom),
          }),
      );
      loaded.current = false;
      window.dw.kill(term);
      window.dw.kill(term2);
      await window.dw.setSettings({ themeName: 'Dogwalker Dark' });
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, spawnNew]);

  // Composer round-trip: select a terminal, drive its floating composer via the
  // DOM — @-mention menu, send — plus draft persistence and image temp files.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('composertest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const setNativeValue = (el: HTMLTextAreaElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(el, value);
      el.setSelectionRange(value.length, value.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    void (async () => {
      const term = await spawnNew('shell');
      const { id: noteId, name: noteName } = await addNote();
      await window.dw.connect(term, noteId);
      setNodes((ns) =>
        ns.map((n) => ({ ...n, selected: n.id === term })),
      );
      await sleep(1800); // composer render + shell init

      const ta = document.querySelector<HTMLTextAreaElement>('.dw-composer-textarea');
      // @-mention menu lists the connected note.
      let mentionOk = false;
      if (ta) {
        ta.focus();
        setNativeValue(ta, '@');
        await sleep(200);
        const items = [...document.querySelectorAll('.dw-mention-item')].map(
          (b) => b.textContent ?? '',
        );
        mentionOk = items.some((t) => t.includes(noteName));
        // Escape the menu, then compose and send a message.
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        setNativeValue(ta, 'hello from composer');
        await sleep(200);
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await sleep(1000);
      }
      const sent = (await window.dw.serialize(term)).includes('hello from composer');

      // Draft persistence + image temp file.
      window.dw.setDraft('composertest-key', 'persist me');
      await sleep(150);
      const draft = await window.dw.getDraft('composertest-key');
      const imgPath = await window.dw.saveDropImage(
        'shot.png',
        new Uint8Array([137, 80, 78, 71]),
      );

      console.log(
        'COMPOSERTEST RESULT ' +
          JSON.stringify({
            composerShown: !!ta,
            mentionOk,
            sent,
            draftOk: draft === 'persist me',
            imgOk: imgPath.endsWith('shot.png'),
          }),
      );
      loaded.current = false;
      window.dw.setDraft('composertest-key', '');
      window.dw.kill(term);
      await window.dw.deleteNote(noteId);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, spawnNew, addNote, setNodes]);

  // Notes round-trip: create a terminal + note, wire them, exercise the CLI
  // `note` verb through the real shim, and confirm the note persists in layout.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('notetest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      const term = await spawnNew('shell');
      const { id: noteId } = await addNote();
      await sleep(300);
      const g0 = await window.dw.graph();
      const noteName = g0.nodes.find((n) => n.id === noteId)?.name ?? '';
      await window.dw.connect(term, noteId);
      await window.dw.saveNote(noteId, '# Spec\n- first item');
      await sleep(1800); // shell init

      // Agent reads the note via CLI.
      window.dw.write(term, `dogwalker note read ${noteName}\r`);
      await sleep(1200);
      const readEcho = (await window.dw.serialize(term)).includes('Spec');

      // Agent writes the note via CLI.
      window.dw.write(term, `dogwalker note write ${noteName} "agent wrote this"\r`);
      await sleep(1200);
      const afterWrite = await window.dw.readNote(noteId);

      // Chaining: a second note wired to the first; --chain from the entry
      // (only the entry is connected to the terminal) must pull both.
      const { id: note2 } = await addNote();
      await sleep(200);
      await window.dw.connect(noteId, note2);
      await window.dw.saveNote(note2, 'downstream detail 42');
      await sleep(400);
      window.dw.write(term, `dogwalker note read ${noteName} --chain\r`);
      await sleep(1200);
      const chainScreen = await window.dw.serialize(term);
      const cliChain =
        chainScreen.includes('agent wrote this') &&
        chainScreen.includes('downstream detail 42');

      // Persistence: note spec + edge present after the debounce.
      await sleep(600);
      const saved = await window.dw.loadWorkspace(workspaceId);
      const noteSpec = saved.layout.nodes.find(
        (n) => n.kind === 'note' && n.stableId === noteId,
      );
      console.log(
        'NOTETEST RESULT ' +
          JSON.stringify({
            noteName,
            cliRead: readEcho,
            cliWrote: afterWrite.includes('agent wrote this'),
            cliChain,
            notePersisted: !!noteSpec,
            notesPersisted: saved.layout.nodes.filter((n) => n.kind === 'note').length,
          }),
      );
      loaded.current = false;
      window.dw.kill(term);
      await window.dw.deleteNote(noteId);
      await window.dw.deleteNote(note2);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, spawnNew, addNote]);

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
              namesOk: saved.layout.nodes.every(
                (n) => !!n.name && (n.kind !== 'terminal' || !!n.preset),
              ),
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
              liveNodes: g.nodes.length,
              liveEdges: g.edges.length,
              match:
                g.nodes.length === ws0.layout.nodes.length &&
                g.edges.length === ws0.layout.edges.length,
            }),
        );
        // Clean up: stop persistence, kill live terminals, store empty layout.
        loaded.current = false;
        for (const t of g.nodes) window.dw.kill(t.id);
        await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
      }
    })();
  }, [workspaceId, spawnNew]);

  const killAll = useCallback(() => {
    setNodes((ns) => {
      for (const n of ns) {
        if (n.type === 'note') void window.dw.unloadNote(n.id);
        else if (n.type === 'portal') void window.dw.portalUnregister(n.id);
        else if (n.type === 'terminal') {
          window.dw.kill(n.id);
          terminals.dispose(n.id);
        }
      }
      return [];
    });
    spawnCount.current = 0;
  }, [setNodes]);

  // ---- prompt composer -----------------------------------------------------
  // The composer follows the single selected terminal.
  const composerTarget = useMemo<ComposerTarget | null>(() => {
    const sel = nodes.filter((n) => n.selected && n.type === 'terminal');
    if (sel.length !== 1) return null;
    const n = sel[0];
    return { id: n.id, stableId: n.data.stableId, name: n.data.name };
  }, [nodes]);

  // Mentions = the target terminal's connected terminals and notes.
  const composerMentions = useMemo<Mention[]>(() => {
    if (!composerTarget) return [];
    const peers = new Set<string>();
    for (const e of graph.edges) {
      if (e.a === composerTarget.id) peers.add(e.b);
      else if (e.b === composerTarget.id) peers.add(e.a);
    }
    const walkerIds = new Set(
      nodesRef.current.filter((n) => n.type === 'terminal' && n.data.walker).map((n) => n.id),
    );
    return graph.nodes
      .filter((n) => peers.has(n.id) && (n.kind === 'terminal' || n.kind === 'note'))
      .map((n) => ({
        name: n.name,
        kind: n.kind as 'terminal' | 'note',
        walker: walkerIds.has(n.id),
      }));
  }, [composerTarget, graph]);

  const onComposerNewNote = useCallback(async () => {
    const { id, name } = await addNote();
    if (composerTarget) await window.dw.connect(composerTarget.id, id);
    return name;
  }, [addNote, composerTarget]);

  const onComposerNewPortal = useCallback(async () => {
    const { id, name } = await addPortal();
    if (composerTarget) await window.dw.connect(composerTarget.id, id);
    return name;
  }, [addPortal, composerTarget]);

  // ---- selection layout ops (PRODUCT.md §3.3) ------------------------------
  const selectedBoxes = useCallback((): Box[] => {
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    return nodesRef.current
      .filter((n) => n.selected)
      .map((n) => {
        const abs = absPos(n, byId);
        return {
          id: n.id,
          x: abs.x,
          y: abs.y,
          w: n.measured?.width ?? (n.type === 'note' ? NOTE_W : NODE_W),
          h: n.measured?.height ?? (n.type === 'note' ? NOTE_H : NODE_H),
        };
      });
  }, []);

  const applyPlacement = useCallback(
    (placement: Map<string, { x: number; y: number }>) => {
      if (placement.size === 0) return;
      setNodes((ns) => {
        const byId = new Map(ns.map((n) => [n.id, n]));
        return ns.map((n) => {
          const p = placement.get(n.id);
          if (!p) return n;
          // Placements are absolute; a parented node stores relative coords.
          let { x, y } = p;
          if (n.parentId) {
            const parent = byId.get(n.parentId);
            if (parent) {
              const pAbs = absPos(parent, byId);
              x -= pAbs.x;
              y -= pAbs.y;
            }
          }
          return { ...n, position: { x: Math.round(x), y: Math.round(y) } };
        });
      });
    },
    [setNodes],
  );

  const doAlign = useCallback(
    (kind: AlignKind) => applyPlacement(align(selectedBoxes(), kind)),
    [applyPlacement, selectedBoxes],
  );
  const doDistribute = useCallback(
    (kind: DistributeKind) => applyPlacement(distribute(selectedBoxes(), kind)),
    [applyPlacement, selectedBoxes],
  );
  const doTidy = useCallback(
    () => applyPlacement(tidy(selectedBoxes())),
    [applyPlacement, selectedBoxes],
  );

  // ---- groups (PRODUCT.md §3.3) --------------------------------------------
  const groupSelection = useCallback(() => {
    setNodes((ns) => {
      const byId = new Map(ns.map((n) => [n.id, n]));
      // Only top-level, non-group nodes can start a group.
      const members = ns.filter(
        (n) => n.selected && n.type !== 'group' && !n.parentId,
      );
      if (members.length < 2) return ns;

      const boxes = members.map((n) => {
        const p = absPos(n, byId);
        return {
          n,
          x: p.x,
          y: p.y,
          w: n.measured?.width ?? (n.type === 'note' ? NOTE_W : NODE_W),
          h: n.measured?.height ?? (n.type === 'note' ? NOTE_H : NODE_H),
        };
      });
      const minX = Math.min(...boxes.map((b) => b.x)) - GROUP_PAD;
      const minY = Math.min(...boxes.map((b) => b.y)) - GROUP_PAD - GROUP_HEADER;
      const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + GROUP_PAD;
      const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + GROUP_PAD;

      const gid = crypto.randomUUID();
      const group: GroupFlowNode = {
        id: gid,
        type: 'group',
        dragHandle: '.dw-drag',
        position: { x: minX, y: minY },
        style: { width: maxX - minX, height: maxY - minY, zIndex: -1 },
        data: { name: 'Group', stableId: gid },
      };
      const ids = new Set(members.map((m) => m.id));
      // Parent must precede its children in the array.
      return [
        group,
        ...ns.map((n) =>
          ids.has(n.id)
            ? {
                ...n,
                parentId: gid,
                extent: 'parent' as const,
                selected: false,
                position: {
                  x: absPos(n, byId).x - minX,
                  y: absPos(n, byId).y - minY,
                },
              }
            : n,
        ),
      ];
    });
  }, [setNodes]);

  const ungroup = useCallback(
    (groupId?: string) => {
      setNodes((ns) => {
        const targets = groupId
          ? ns.filter((n) => n.id === groupId)
          : ns.filter((n) => n.type === 'group' && n.selected);
        if (targets.length === 0) return ns;
        const ids = new Set(targets.map((t) => t.id));
        const byId = new Map(ns.map((n) => [n.id, n]));
        return ns
          .filter((n) => !ids.has(n.id))
          .map((n) => {
            if (!n.parentId || !ids.has(n.parentId)) return n;
            const abs = absPos(n, byId); // keep them exactly where they look
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position: abs,
            };
          });
      });
    },
    [setNodes],
  );

  // The group node talks back through window events (it has no props channel).
  useEffect(() => {
    const onRename = (e: Event) => {
      const { id, name } = (e as CustomEvent<{ id: string; name: string }>).detail;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id && n.type === 'group' ? { ...n, data: { ...n.data, name } } : n,
        ),
      );
    };
    const onUngroup = (e: Event) =>
      ungroup((e as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener('dw:group-rename', onRename);
    window.addEventListener('dw:group-ungroup', onUngroup);
    return () => {
      window.removeEventListener('dw:group-rename', onRename);
      window.removeEventListener('dw:group-ungroup', onUngroup);
    };
  }, [setNodes, ungroup]);

  // A portal's "link" button asks for a session-sharing sibling.
  useEffect(() => {
    const onLink = (e: Event) =>
      void addLinkedPortal((e as CustomEvent<{ stableId: string }>).detail.stableId);
    window.addEventListener('dw:portal-link', onLink);
    return () => window.removeEventListener('dw:portal-link', onLink);
  }, [addLinkedPortal]);

  // Agent-created portals (CLI `portal new`): main already made the view, graph
  // node and leash — add the canvas node at the viewport center to show it.
  useEffect(() => {
    return window.dw.onPortalCreated((e) => {
      if (nodesRef.current.some((n) => n.data.stableId === e.id)) return;
      const at = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      void addPortalNode({
        kind: 'portal',
        stableId: e.id,
        name: e.name,
        url: e.url,
        partition: e.partition,
        x: at.x - PORTAL_W / 2,
        y: at.y - PORTAL_H / 2,
        w: PORTAL_W,
        h: PORTAL_H,
      });
    });
  }, [addPortalNode, screenToFlowPosition]);

  // Reconcile portal nodes with the graph: if a portal's graph node vanishes
  // (an agent or a peer destroyed it), drop its stale canvas node.
  useEffect(() => {
    if (!loaded.current) return;
    const live = new Set(
      graph.nodes.filter((n) => n.kind === 'portal').map((n) => n.id),
    );
    setNodes((ns) => {
      const next = ns.filter((n) => n.type !== 'portal' || live.has(n.data.stableId));
      return next.length === ns.length ? ns : next;
    });
  }, [graph, setNodes]);

  // Walker recruits (PRODUCT.md §5.4): the broker spawns + wires them; here we
  // adopt each near its Walker, and reflect dismiss/assign on the canvas.
  useEffect(() => {
    const offRecruit = window.dw.onRecruited((e) => {
      // Only this layer materializes a node; recruits on other layers are alive
      // and wired (ask works) and appear when that layer is next opened.
      if (e.workspaceId !== layerId) return;
      if (nodesRef.current.some((n) => n.data.stableId === e.stableId)) return;
      const walker = nodesRef.current.find((n) => n.id === e.walkerId);
      const w = walker?.measured?.width ?? NODE_W;
      const at = walker
        ? { x: walker.position.x + w + 60, y: walker.position.y }
        : { x: 0, y: 0 };
      spawnCount.current++;
      void addTerminal(
        {
          kind: 'terminal',
          stableId: e.stableId,
          name: e.name,
          preset: e.preset,
          roleId: e.roleId,
          x: at.x,
          y: at.y,
          w: NODE_W,
          h: NODE_H,
        },
        e.id, // adopt the PTY the broker already spawned
      );
    });
    const offDismiss = window.dw.onDismissed((id) => {
      terminals.dispose(id);
      setNodes((ns) => ns.filter((n) => n.id !== id));
    });
    const offReassign = window.dw.onReassigned(({ id, name }) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id && n.type === 'terminal'
            ? { ...n, data: { ...n.data, name } }
            : n,
        ),
      );
    });
    return () => {
      offRecruit();
      offDismiss();
      offReassign();
    };
  }, [layerId, addTerminal, setNodes]);

  // Recovery (v0.7): restart a terminal whose process exited, in place — fresh
  // PTY, same stableId + geometry (leashes re-form from the saved layout).
  useEffect(() => {
    const onRestart = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      const n = nodesRef.current.find((x) => x.type === 'terminal' && x.id === id);
      if (!n || n.type !== 'terminal') return;
      const d = n.data;
      terminals.dispose(id);
      setNodes((ns) => ns.filter((x) => x.id !== id));
      void addTerminal({
        kind: 'terminal',
        stableId: d.stableId,
        name: d.name,
        preset: d.preset,
        x: n.position.x,
        y: n.position.y,
        w: n.measured?.width ?? NODE_W,
        h: n.measured?.height ?? NODE_H,
        memoryLimitMB: d.memoryLimitMB,
        walker: d.walker,
      });
    };
    window.addEventListener('dw:terminal-restart', onRestart);
    return () => window.removeEventListener('dw:terminal-restart', onRestart);
  }, [addTerminal, setNodes]);

  /** The single selected terminal, when there is exactly one (for its limit). */
  const soleTerminal = useMemo(() => {
    const sel = nodes.filter((n) => n.selected);
    return sel.length === 1 && sel[0].type === 'terminal'
      ? (sel[0] as TerminalFlowNode)
      : null;
  }, [nodes]);

  const setMemoryLimit = useCallback(
    (mb: number) => {
      if (!soleTerminal) return;
      window.dw.setMemoryLimit(soleTerminal.id, mb);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === soleTerminal.id && n.type === 'terminal'
            ? { ...n, data: { ...n.data, memoryLimitMB: mb } }
            : n,
        ),
      );
    },
    [soleTerminal, setNodes],
  );

  // ---- magnetic snapping (PRODUCT.md §3.3) ---------------------------------
  const onNodeDrag = useCallback<OnNodeDrag>(
    (_evt, node) => {
      // Single-node drags only; a multi-selection moves as a rigid block.
      if (nodesRef.current.filter((n) => n.selected).length > 1) return;
      const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
      const size = (n: DwNode): SnapBox => ({
        x: 0,
        y: 0,
        w: n.measured?.width ?? (n.type === 'note' ? NOTE_W : n.type === 'group' ? 300 : NODE_W),
        h: n.measured?.height ?? (n.type === 'note' ? NOTE_H : n.type === 'group' ? 200 : NODE_H),
      });
      const abs = absPos(node as DwNode, byId);
      const moving: SnapBox = { ...size(node as DwNode), x: abs.x, y: abs.y };
      // Snap against sibling top-level nodes (skip self, its own children, groups
      // it belongs to).
      const others: SnapBox[] = nodesRef.current
        .filter(
          (n) =>
            n.id !== node.id &&
            n.parentId === node.parentId &&
            n.parentId !== node.id,
        )
        .map((n) => {
          const a = absPos(n, byId);
          return { ...size(n), x: a.x, y: a.y };
        });
      if (others.length === 0) return;

      const res = snapMove(moving, others);
      setGuides(res.guides);
      if (res.x === abs.x && res.y === abs.y) return;

      // Convert the snapped absolute position back to the node's frame.
      let nx = res.x;
      let ny = res.y;
      if (node.parentId) {
        const p = byId.get(node.parentId);
        if (p) {
          const pa = absPos(p, byId);
          nx -= pa.x;
          ny -= pa.y;
        }
      }
      setNodes((ns) =>
        ns.map((n) => (n.id === node.id ? { ...n, position: { x: nx, y: ny } } : n)),
      );
    },
    [setNodes],
  );

  const onNodeDragStop = useCallback(() => setGuides([]), []);

  const onNodeContextMenu = useCallback<NodeMouseHandler>(
    (event, node) => {
      event.preventDefault();
      // Right-clicking outside the selection selects that node first.
      let count = nodesRef.current.filter((n) => n.selected).length;
      if (!nodesRef.current.find((n) => n.id === node.id)?.selected) {
        setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === node.id })));
        count = 1;
      }
      setMenu({ x: event.clientX, y: event.clientY, count });
    },
    [setNodes],
  );

  // Magnetic snapping: pure geometry + a real drag that snaps to a neighbour.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('snaptest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      // Pure cases.
      const near = snapMove({ x: 105, y: 0, w: 100, h: 50 }, [
        { x: 100, y: 0, w: 100, h: 50 },
      ]);
      // Both axes far, so nothing snaps and no guides appear.
      const far = snapMove({ x: 120, y: 300, w: 100, h: 50 }, [
        { x: 100, y: 0, w: 100, h: 50 },
      ]);
      const none = snapMove({ x: 300, y: 300, w: 100, h: 50 }, []);
      // Centers coincide at x=50; nearest line pair is center↔center (diff 0),
      // so x doesn't move and a center guide is emitted.
      const center = snapMove({ x: 0, y: 0, w: 100, h: 50 }, [
        { x: 20, y: 0, w: 60, h: 50 },
      ]);

      // Live: place B, drop A within threshold of B's left edge, drive a drag.
      const a = await spawnNew('shell');
      const b = await spawnNew('shell');
      await sleep(500);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === b
            ? { ...n, position: { x: 400, y: 0 } }
            : n.id === a
              ? { ...n, position: { x: 405, y: 320 } }
              : n,
        ),
      );
      await sleep(200);
      const aNode = nodesRef.current.find((n) => n.id === a);
      if (aNode) {
        const dragged = { ...aNode, position: { x: 405, y: 320 } };
        onNodeDrag(new MouseEvent('mousemove'), dragged, [dragged]);
      }
      await sleep(200);
      const aAfter = nodesRef.current.find((n) => n.id === a)?.position.x;

      console.log(
        'SNAPTEST RESULT ' +
          JSON.stringify({
            pureSnaps: near.x === 100 && near.guides.length > 0,
            pureNoSnapFar: far.x === 120 && far.guides.length === 0,
            pureNoNeighbours: none.x === 300 && none.guides.length === 0,
            pureCenter:
              center.x === 0 &&
              center.guides.some((g) => g.axis === 'x' && Math.round(g.at) === 50),
            liveSnapped: aAfter === 400,
            liveX: aAfter,
          }),
      );
      loaded.current = false;
      window.dw.kill(a);
      window.dw.kill(b);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, spawnNew, setNodes, onNodeDrag]);

  // Groups: group two nodes, move the frame, persist/restore, then ungroup.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('grouptest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const absOf = (id: string) => {
      const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
      const n = byId.get(id);
      return n ? absPos(n, byId) : null;
    };
    void (async () => {
      const a = await spawnNew('shell');
      const b = await spawnNew('shell');
      await sleep(600);
      const beforeA = absOf(a);
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === a || n.id === b })));
      await sleep(200);
      groupSelection();
      await sleep(400);

      const grouped = nodesRef.current.filter((n) => n.parentId);
      const group = nodesRef.current.find((n) => n.type === 'group');
      const afterGroupA = absOf(a);
      // Members reparented, positions relative, absolute position unchanged.
      const membersParented = grouped.length === 2 && !!group;
      const absKept =
        !!beforeA && !!afterGroupA && Math.abs(beforeA.x - afterGroupA.x) < 2;
      const relative =
        (nodesRef.current.find((n) => n.id === a)?.position.x ?? -1) !== beforeA?.x;

      // Move the frame: members must follow in absolute terms.
      const gid = group?.id ?? '';
      setNodes((ns) =>
        ns.map((n) =>
          n.id === gid
            ? { ...n, position: { x: n.position.x + 300, y: n.position.y + 100 } }
            : n,
        ),
      );
      await sleep(300);
      const movedA = absOf(a);
      const membersFollowed =
        !!movedA && !!afterGroupA && Math.round(movedA.x - afterGroupA.x) === 300;

      // Persist + inspect the stored layout.
      await sleep(700);
      const saved = (await window.dw.loadWorkspace(workspaceId)).layout;
      const groupSpec = saved.nodes.find((n) => n.kind === 'group');
      const memberSpecs = saved.nodes.filter((n) => n.parentStableId);

      // Ungroup: absolute positions must be preserved.
      ungroup(gid);
      await sleep(300);
      const afterUngroupA = absOf(a);
      const ungroupKeptAbs =
        !!movedA &&
        !!afterUngroupA &&
        Math.abs(movedA.x - afterUngroupA.x) < 2 &&
        nodesRef.current.every((n) => !n.parentId) &&
        !nodesRef.current.some((n) => n.type === 'group');

      console.log(
        'GROUPTEST RESULT ' +
          JSON.stringify({
            membersParented,
            absKept,
            relative,
            membersFollowed,
            groupPersisted: !!groupSpec,
            membershipPersisted: memberSpecs.length === 2,
            ungroupKeptAbs,
          }),
      );
      loaded.current = false;
      window.dw.kill(a);
      window.dw.kill(b);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, spawnNew, setNodes, groupSelection, ungroup]);

  // File Tree node: add one, confirm it lists a real directory over IPC and
  // that it survives a persist/restore round-trip with its root intact.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('fsnodetest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      addFileTree();
      await sleep(400);
      const node = nodesRef.current.find((n) => n.type === 'filetree');
      const root = (node?.data as { rootPath?: string })?.rootPath ?? '';
      // The renderer→main readDir path returns this workspace's directory.
      const listing = await window.dw.readDir(root || '.');
      const listsDir = !listing.error && Array.isArray(listing.entries);

      await sleep(700); // let the debounced save land
      const saved = (await window.dw.loadWorkspace(workspaceId)).layout;
      const ftSpec = saved.nodes.find((n) => n.kind === 'filetree') as
        | { rootPath?: string }
        | undefined;

      console.log(
        'FSNODETEST RESULT ' +
          JSON.stringify({
            nodeAdded: !!node,
            listsDir,
            entryCount: listing.entries.length,
            persisted: !!ftSpec,
            rootPersisted: !!ftSpec && ftSpec.rootPath === root,
          }),
      );
      loaded.current = false;
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, addFileTree]);

  // File ops + drag: the create/rename/delete round-trip through renderer IPC,
  // the drag-data contract, a drag-to-canvas preview node (persisted), and a
  // path injected into a terminal (proven via the headless mirror).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('fileopstest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const sep = workspaceCwd.includes('\\') ? '\\' : '/';
    const base = workspaceCwd.replace(/[\\/]+$/, '') + sep + 'dw-fileopstest';
    const join = (...parts: string[]) => parts.join(sep);
    void (async () => {
      const results: Record<string, unknown> = {};

      // --- File ops round-trip (create / rename / move / delete) ------------
      await window.dw.removeEntry(base); // clean any stale run
      await window.dw.createEntry(join(base, 'sub'), true);
      await window.dw.createEntry(join(base, 'a.txt'), false);
      await window.dw.writeFile(join(base, 'a.txt'), 'walker');
      let list = await window.dw.readDir(base);
      results.created = list.entries.map((e) => e.name).join(',') === 'sub,a.txt';

      await window.dw.renameEntry(join(base, 'a.txt'), join(base, 'b.txt'));
      list = await window.dw.readDir(base);
      results.renamed =
        list.entries.some((e) => e.name === 'b.txt') &&
        !list.entries.some((e) => e.name === 'a.txt');

      await window.dw.renameEntry(join(base, 'b.txt'), join(base, 'sub', 'b.txt'));
      const subList = await window.dw.readDir(join(base, 'sub'));
      results.moved = subList.entries.some((e) => e.name === 'b.txt');

      await window.dw.removeEntry(join(base, 'sub', 'b.txt'));
      results.deleted = !(await window.dw.readDir(join(base, 'sub'))).entries.length;

      // --- Drag-data contract (setFileDrag/getFileDrag) --------------------
      const dt = new DataTransfer();
      const fakeStart = { dataTransfer: dt } as unknown as React.DragEvent;
      setFileDrag(fakeStart, join(base, 'sub'));
      const fakeDrop = { dataTransfer: dt } as unknown as React.DragEvent;
      results.dragRoundTrip = getFileDrag(fakeDrop) === join(base, 'sub');

      // --- Drag-to-canvas: a file → preview, a folder → File Tree ----------
      const previewPath = join(base, 'pv.txt');
      await window.dw.createEntry(previewPath, false);
      await window.dw.writeFile(previewPath, 'preview me');
      await handleFileDrop(previewPath, { x: 100, y: 100 });
      await sleep(300);
      const pv = nodesRef.current.find((n) => n.type === 'preview');
      results.previewFromFile =
        !!pv && (pv.data as { filePath?: string }).filePath === previewPath;

      await handleFileDrop(join(base, 'sub'), { x: 400, y: 100 });
      await sleep(300);
      const droppedTree = nodesRef.current.find(
        (n) => n.type === 'filetree' && (n.data as { rootPath?: string }).rootPath === join(base, 'sub'),
      );
      results.folderFromDrop = !!droppedTree;

      await sleep(700);
      const saved = (await window.dw.loadWorkspace(workspaceId)).layout;
      const pvSpec = saved.nodes.find((n) => n.kind === 'preview') as
        | { filePath?: string }
        | undefined;
      results.previewPersisted = !!pvSpec && pvSpec.filePath === previewPath;

      // --- Drag-to-terminal: a path written in reaches the PTY mirror ------
      const marker = join(base, 'DROPMARK');
      const term = await spawnNew('shell');
      await sleep(1500);
      const token = /\s/.test(marker) ? `"${marker}"` : marker;
      window.dw.write(term, token + ' ');
      await sleep(1200);
      const screen = await window.dw.serialize(term);
      results.injectedIntoTerminal = screen.includes('DROPMARK');

      console.log('FILEOPSTEST RESULT ' + JSON.stringify(results));

      // Cleanup.
      loaded.current = false;
      window.dw.kill(term);
      await window.dw.removeEntry(base);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, workspaceCwd, handleFileDrop, spawnNew]);

  // Editor: the save round-trip through main, send-selection reaching a terminal
  // mirror, and that CodeMirror 6 actually mounts in this renderer.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('editortest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const sep = workspaceCwd.includes('\\') ? '\\' : '/';
    const file = workspaceCwd.replace(/[\\/]+$/, '') + sep + 'dw-editortest.txt';
    void (async () => {
      const results: Record<string, unknown> = {};

      // Save round-trip (the editor writes through main).
      await window.dw.writeFile(file, 'alpha\nbeta\ngamma\n');
      await window.dw.writeFile(file, 'alpha\nEDITED\ngamma\n');
      const back = await window.dw.readFile(file);
      results.saveRoundTrip = back.includes('EDITED');

      // Send-selection: the ref + text must reach the terminal's mirror.
      const term = await spawnNew('shell');
      await sleep(1500);
      const ref = 'dw-editortest.txt:2';
      window.dw.write(term, `${ref}\nEDITED\n`);
      await sleep(1200);
      const screen = await window.dw.serialize(term);
      results.sentToAgent = screen.includes('dw-editortest.txt:2');

      // CodeMirror 6 mounts and holds the document in this environment.
      try {
        const [{ EditorState }, viewMod, cm] = await Promise.all([
          import('@codemirror/state'),
          import('@codemirror/view'),
          import('codemirror'),
        ]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const state = EditorState.create({
          doc: 'const x = 1\n',
          extensions: [cm.basicSetup],
        });
        const view = new viewMod.EditorView({ state, parent: host });
        results.cmMounts =
          view.state.doc.toString() === 'const x = 1\n' &&
          !!host.querySelector('.cm-content');
        view.destroy();
        host.remove();
      } catch (e) {
        results.cmError = (e as Error).message;
      }

      console.log('EDITORTEST RESULT ' + JSON.stringify(results));
      loaded.current = false;
      window.dw.kill(term);
      await window.dw.removeEntry(file);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, workspaceCwd, spawnNew]);

  // Search: pure fuzzy scoring/ranking, the recursive file index (heavy dirs
  // skipped), and content grep with correct line numbers.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('searchtest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sep = workspaceCwd.includes('\\') ? '\\' : '/';
    const base = workspaceCwd.replace(/[\\/]+$/, '') + sep + 'dw-searchtest';
    const join = (...p: string[]) => p.join(sep);
    void (async () => {
      const results: Record<string, unknown> = {};

      // Pure fuzzy.
      results.fuzzyMatch = fuzzyScore('ftn', 'FileTreeNode') !== null;
      results.fuzzyReject = fuzzyScore('zzz', 'FileTreeNode') === null;
      const ranked = fuzzyFilter('search', ['xoxo', 'searchbar', 'miscellany'], (x) => x, 10);
      results.fuzzyRanks = ranked[0] === 'searchbar';

      // Build a tree with a node_modules that must be excluded from search.
      await window.dw.removeEntry(base);
      await window.dw.createEntry(join(base, 'deep'), true);
      await window.dw.createEntry(join(base, 'node_modules'), true);
      await window.dw.writeFile(join(base, 'a.txt'), 'needle here\nplain line\n');
      await window.dw.writeFile(join(base, 'deep', 'b.txt'), 'second\nneedle again\n');
      await window.dw.writeFile(join(base, 'node_modules', 'c.txt'), 'needle in modules\n');

      const idx = await window.dw.searchFiles(base, 20000);
      const rel = idx.map((p) => p.slice(base.length).replace(/^[\\/]/, ''));
      results.indexedFiles = rel.includes('a.txt') && rel.some((r) => /deep[\\/]b\.txt/.test(r));
      results.ignoredNodeModules = !rel.some((r) => r.includes('node_modules'));

      const hits = await window.dw.grepFiles(base, 'needle', 200);
      const aHit = hits.find((h) => h.path.endsWith('a.txt'));
      const bHit = hits.find((h) => h.path.endsWith('b.txt'));
      results.grepFound = !!aHit && aHit.line === 1 && !!bHit && bHit.line === 2;
      results.grepSkipsIgnored = !hits.some((h) => h.path.includes('node_modules'));

      console.log('SEARCHTEST RESULT ' + JSON.stringify(results));
      loaded.current = false;
      await window.dw.removeEntry(base);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, workspaceCwd]);

  // Note image paste: a pasted image is stored beside the note, embeds as a
  // markdown link readable by agents, renders via readImage, and delete cleans
  // up the asset.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('imgtest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    void (async () => {
      const results: Record<string, unknown> = {};
      const id = 'imgtest-' + Date.now();
      await window.dw.registerNote(id, 'imgtest');
      // A 1x1 PNG.
      const b64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

      const p = await window.dw.saveNoteImage(id, 'dot.png', bytes);
      results.savedPath = typeof p === 'string' && p.endsWith('dot.png');

      const st = await window.dw.statEntry(p);
      results.fileOnDisk = !!st && !st.isDir && st.size === bytes.length;

      const uri = await window.dw.readImage(p);
      results.rendersDataUri = uri.startsWith('data:image/png;base64,');

      // The note markdown references the image path — what an agent reads.
      await window.dw.saveNote(id, `look:\n\n![image](${p})\n`);
      const md = await window.dw.readNote(id);
      results.agentReadable = md.includes(p);

      // Delete removes the note's asset directory.
      await window.dw.deleteNote(id);
      results.assetCleaned = (await window.dw.statEntry(p)) === null;

      console.log('IMGTEST RESULT ' + JSON.stringify(results));
    })();
  }, []);

  // Portal plumbing: create a native browser view, drive navigation + history
  // through main, read back state, and tear it down.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('portaltest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const id = 'portaltest-' + Date.now();
    const url1 = 'data:text/html,<title>DWPortalOne</title><h1>one</h1>';
    const url2 = 'data:text/html,<title>DWPortalTwo</title><h1>two</h1>';
    const until = async (pred: (s: NonNullable<Awaited<ReturnType<typeof window.dw.portalState>>>) => boolean) => {
      for (let i = 0; i < 25; i++) {
        await sleep(200);
        const s = await window.dw.portalState(id);
        if (s && pred(s)) return s;
      }
      return await window.dw.portalState(id);
    };
    void (async () => {
      const results: Record<string, unknown> = {};
      window.dw.portalCreate(id, id, 'about:blank');
      await sleep(400);

      window.dw.portalNavigate(id, url1);
      const s1 = await until((s) => s.title.includes('DWPortalOne'));
      results.navigated = !!s1 && s1.title.includes('DWPortalOne');
      results.urlReported = !!s1 && s1.url.startsWith('data:text/html');

      window.dw.portalNavigate(id, url2);
      const s2 = await until((s) => s.title.includes('DWPortalTwo'));
      results.secondNav = !!s2 && s2.title.includes('DWPortalTwo');
      results.canGoBack = !!s2 && s2.canGoBack === true;

      window.dw.portalBack(id);
      const s3 = await until((s) => s.title.includes('DWPortalOne'));
      results.wentBack = !!s3 && s3.title.includes('DWPortalOne');

      window.dw.portalDestroy(id);
      await sleep(400);
      results.destroyed = (await window.dw.portalState(id)) === null;

      console.log('PORTALTEST RESULT ' + JSON.stringify(results));
    })();
  }, []);

  // Layout ops test: pure geometry + the canvas wiring that applies it.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('layouttest')) return;
    if (harnessRan.current) return;
    harnessRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      const boxes: Box[] = [
        { id: 'a', x: 10, y: 0, w: 100, h: 50 },
        { id: 'b', x: 200, y: 30, w: 100, h: 50 },
        { id: 'c', x: 400, y: 60, w: 100, h: 50 },
      ];
      const al = align(boxes, 'left');
      const di = distribute(boxes, 'horizontal');
      const ti = tidy(boxes, 40);

      // Wiring: spawn two, select both, align them left.
      const t1 = await spawnNew('shell');
      const t2 = await spawnNew('shell');
      await sleep(500);
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === t1 || n.id === t2 })));
      await sleep(300);
      doAlign('left');
      await sleep(400);
      const xs = nodesRef.current.filter((n) => n.selected).map((n) => n.position.x);

      console.log(
        'LAYOUTTEST RESULT ' +
          JSON.stringify({
            pureAlignLeft: al.get('b')?.x === 10 && al.get('c')?.x === 10,
            pureDistribute: Math.round(di.get('b')?.x ?? -1) === 205,
            pureTidy:
              ti.get('a')?.x === 10 &&
              ti.get('b')?.x === 150 &&
              ti.get('c')?.x === 10 &&
              ti.get('c')?.y === 90,
            wiringAligned: xs.length === 2 && xs[0] === xs[1],
            xs,
            minimap: !!document.querySelector('.react-flow__minimap'),
          }),
      );
      loaded.current = false;
      window.dw.kill(t1);
      window.dw.kill(t2);
      await window.dw.saveLayout(workspaceId, { nodes: [], edges: [] });
    })();
  }, [workspaceId, spawnNew, setNodes, doAlign]);

  // Ctrl/⌘+Shift+P focuses the composer; Shift+A cycles attention terminals.
  const cycleAttention = useCallback(() => {
    const list = nodesRef.current.filter(
      (n) => n.type === 'terminal' && n.data.attention,
    );
    if (list.length === 0) return;
    const curIdx = list.findIndex((n) => n.selected);
    const next = list[(curIdx + 1) % list.length];
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === next.id })));
    const vp = getViewport();
    const w = next.measured?.width ?? 560;
    const h = next.measured?.height ?? 380;
    setViewport({
      x: window.innerWidth / 2 - (next.position.x + w / 2) * vp.zoom,
      y: window.innerHeight / 2 - (next.position.y + h / 2) * vp.zoom,
      zoom: vp.zoom,
    });
  }, [getViewport, setViewport, setNodes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setFocusSignal((s) => s + 1);
      } else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !typing) {
        const k = e.key.toLowerCase();
        if (k === 'a') {
          e.preventDefault();
          cycleAttention();
        } else if (k === 'm') {
          e.preventDefault();
          setShowMinimap((v) => !v);
        } else if (k === 't') {
          e.preventDefault();
          doTidy();
        } else if (k === 'g') {
          e.preventDefault();
          ungroup();
        }
      } else if (
        e.key.toLowerCase() === 'g' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !typing
      ) {
        e.preventDefault();
        groupSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleAttention, doTidy]);

  return (
    <div className="dw-canvas-host">
      <TerminalPalette
        onSpawn={(preset, roleId) => void spawnNew(preset, roleId)}
        onAddNote={() => void addNote()}
        onAddFileTree={() => addFileTree()}
        onAddPortal={() => void addPortal()}
      />
      {isDev && (
        <DevBar
          onSpawn15={() => {
            void (async () => {
              for (let i = 0; i < 15; i++) await spawnNew('stress');
            })();
          }}
          onKillAll={killAll}
          hudOn={showHud}
          onToggleHud={() => setShowHud((v) => !v)}
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
        onNodeContextMenu={onNodeContextMenu}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={45}
        snapToGrid
        snapGrid={[20, 20]}
        onMove={recomputeTiers}
        onMoveEnd={onMoveEnd}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onDrop={onCanvasDrop}
        onDragOver={onCanvasDragOver}
      >
        <Background gap={20} />
        <ViewportPortal>
          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <div
                key={i}
                className="dw-guide"
                style={{
                  position: 'absolute',
                  transform: `translate(${g.at}px, ${g.from}px)`,
                  width: 1,
                  height: g.to - g.from,
                }}
              />
            ) : (
              <div
                key={i}
                className="dw-guide"
                style={{
                  position: 'absolute',
                  transform: `translate(${g.from}px, ${g.at}px)`,
                  width: g.to - g.from,
                  height: 1,
                }}
              />
            ),
          )}
        </ViewportPortal>
        {nodes.length === 0 && loaded.current && (
          <div className="dw-empty">
            <div className="dw-empty-emoji"><DogwalkerLogo size={56} /></div>
            <h2>This workspace is empty</h2>
            <p>
              Add a terminal from the palette above — pick an agent or a plain
              shell. Drag from a node's side handle to another to put them on a
              leash; wired agents can then talk with <code>dogwalker ask</code>.
            </p>
          </div>
        )}
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            className="dw-minimap"
            maskColor="rgba(10, 10, 14, 0.7)"
            nodeColor={(n) => (n.type === 'note' ? '#3a3726' : '#2e2e3a')}
            nodeStrokeColor={(n) =>
              n.type === 'note' ? '#e0cf7a' : n.data?.attention ? '#e6533c' : '#e8b565'
            }
            nodeStrokeWidth={3}
          />
        )}
      </ReactFlow>
      {isDev && showHud && <Hud />}
      <HistoryPanel pair={historyPair} onClose={() => setHistoryPair(null)} />
      <Composer
        target={composerTarget}
        mentions={composerMentions}
        onNewNote={onComposerNewNote}
        onNewPortal={onComposerNewPortal}
        focusSignal={focusSignal}
      />
      {menu && (
        <CanvasMenu
          x={menu.x}
          y={menu.y}
          count={menu.count}
          memoryLimitMB={soleTerminal ? soleTerminal.data.memoryLimitMB ?? 0 : null}
          onMemoryLimit={(mb) => {
            setMemoryLimit(mb);
            setMenu(null);
          }}
          onAlign={(k) => {
            doAlign(k);
            setMenu(null);
          }}
          onDistribute={(k) => {
            doDistribute(k);
            setMenu(null);
          }}
          onTidy={() => {
            doTidy();
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
