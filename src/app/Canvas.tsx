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
import type {
  GraphSnapshot,
  NodeSpec,
  NoteSpec,
  PresetId,
  TerminalSpec,
  WorkspaceLayout,
} from '../shared/ipc';
import { terminals, type Tier } from './terminalService';
import { BUILTIN_THEMES } from '../shared/themes';
import { TerminalNode, type TerminalFlowNode } from './TerminalNode';
import { NoteNode, type NoteFlowNode } from './NoteNode';
import { FloatingLeash } from './FloatingLeash';
import { Hud } from './Hud';
import { HistoryPanel } from './HistoryPanel';
import { DevBar } from './DevBar';
import { TerminalPalette } from './TerminalPalette';
import { Composer, type ComposerTarget, type Mention } from './Composer';
import { runSmoke } from './smoke';

type DwNode = TerminalFlowNode | NoteFlowNode;

const nodeTypes = { terminal: TerminalNode, note: NoteNode };
const edgeTypes = { leash: FloatingLeash };

const NODE_W = 560;
const NODE_H = 380;
const NOTE_W = 320;
const NOTE_H = 240;
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
  notifyOnAttention: boolean;
}

export function Canvas({ workspaceId, isDev, notifyOnAttention }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<DwNode>([]);
  const [graph, setGraph] = useState<GraphSnapshot>({ nodes: [], edges: [] });
  const [historyPair, setHistoryPair] = useState<{
    a: string;
    b: string;
    aName: string;
    bName: string;
  } | null>(null);
  const { getViewport, setViewport } = useReactFlow();
  const [focusSignal, setFocusSignal] = useState(0);
  const spawnCount = useRef(0);
  const tierPass = useRef(false);
  const harnessRan = useRef(false);
  const loaded = useRef(false);
  const tearingDown = useRef(false);
  const stableToLive = useRef(new Map<string, string>());
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
    async (spec: TerminalSpec) => {
      const { id } = await window.dw.spawn({
        preset: spec.preset,
        name: spec.name,
        cols: 80,
        rows: 24,
      });
      terminals.create(id);
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
        },
      };
      setNodes((ns) => [...ns, node]);
      return id;
    },
    [setNodes],
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

  const spawnNew = useCallback(
    (preset: PresetId) => {
      const n = spawnCount.current++;
      return addTerminal({
        kind: 'terminal',
        stableId: crypto.randomUUID(),
        name: `${preset}-${n + 1}`,
        preset,
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
      const ws = await window.dw.loadWorkspace(workspaceId);
      if (cancelled) return;
      spawnCount.current = ws.layout.nodes.length;
      for (const spec of ws.layout.nodes) {
        // Missing kind (pre-notes layouts) means terminal.
        if (spec.kind === 'note') await addNoteNode(spec);
        else await addTerminal(spec as TerminalSpec);
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
      // Stop persistence BEFORE tearing down: teardown empties the graph
      // (remove drops edges), and a debounced save must not clobber the stored
      // layout with nodes-minus-edges. Switching kills terminals and unloads
      // notes (keeping their files); keep-alive is v0.2.
      tearingDown.current = true;
      loaded.current = false;
      setNodes((ns) => {
        for (const n of ns) {
          if (n.type === 'note') void window.dw.unloadNote(n.id);
          else {
            window.dw.kill(n.id);
            terminals.dispose(n.id);
          }
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
      const base = {
        stableId: n.data.stableId,
        name: n.data.name,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        w: Math.round(w),
        h: Math.round(h),
      };
      return n.type === 'note'
        ? { ...base, kind: 'note' as const }
        : { ...base, kind: 'terminal' as const, preset: n.data.preset };
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
    for (const n of graph.nodes) m.set(n.id, n.name);
    return m;
  }, [graph.nodes]);

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
        // Only terminals ride the ladder; notes are plain DOM, always rendered.
        const rects = ns
          .filter((n): n is TerminalFlowNode => n.type === 'terminal')
          .map((n) => {
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
        else {
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
    return graph.nodes
      .filter((n) => peers.has(n.id) && (n.kind === 'terminal' || n.kind === 'note'))
      .map((n) => ({ name: n.name, kind: n.kind as 'terminal' | 'note' }));
  }, [composerTarget, graph]);

  const onComposerNewNote = useCallback(async () => {
    const { id, name } = await addNote();
    if (composerTarget) await window.dw.connect(composerTarget.id, id);
    return name;
  }, [addNote, composerTarget]);

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
      } else if (
        e.shiftKey &&
        e.key.toLowerCase() === 'a' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !typing
      ) {
        e.preventDefault();
        cycleAttention();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleAttention]);

  return (
    <div className="dw-canvas-host">
      <TerminalPalette
        onSpawn={(p) => void spawnNew(p)}
        onAddNote={() => void addNote()}
      />
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
      <Composer
        target={composerTarget}
        mentions={composerMentions}
        onNewNote={onComposerNewNote}
        focusSignal={focusSignal}
      />
    </div>
  );
}
