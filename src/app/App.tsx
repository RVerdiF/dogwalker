import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { AppSettings, FloorMeta, SidebarEntry, WorkspaceMeta } from '../shared/ipc';
import { BUILTIN_THEMES, type ThemeSpec } from '../shared/themes';
import { applyThemeChrome } from '../shared/themeChrome';
import { terminals } from './terminalService';
import { Canvas } from './Canvas';
import { Sidebar } from './Sidebar';
import { Panel } from './Panel';
import { FloorBar } from './FloorBar';
import { reorderByDrop, sectionsOf } from './sidebarOps';

const IS_DEV = import.meta.env.DEV;

const DEFAULT_SETTINGS: AppSettings = {
  themeName: 'Dogwalker Dark',
  lightThemeName: 'GitHub Light',
  followSystem: false,
  notifyOnAttention: true,
  miniSidebar: false,
};

function findTheme(themes: ThemeSpec[], name: string): ThemeSpec | undefined {
  return themes.find((t) => t.name === name);
}

export function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [sidebar, setSidebar] = useState<SidebarEntry[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [floors, setFloors] = useState<FloorMeta[]>([]);
  const [floorId, setFloorId] = useState<string>('ground');
  const [panelOpen, setPanelOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [themes, setThemes] = useState<ThemeSpec[]>(BUILTIN_THEMES);
  const [osDark, setOsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  const refresh = useCallback(async () => {
    const { workspaces: list, active, sidebar: rail } =
      await window.dw.listWorkspaces();
    setWorkspaces(list);
    setSidebar(rail);
    setActiveId((cur) => (list.some((w) => w.id === cur) ? cur : active));
    return { list, active };
  }, []);

  useEffect(() => {
    void refresh();
    void window.dw.getSettings().then(setSettings);
    void window.dw
      .listCustomThemes()
      .then((custom) => setThemes([...BUILTIN_THEMES, ...custom]));
  }, [refresh]);

  // Load the active workspace's floors (and which layer was last shown).
  const refreshFloors = useCallback(async (wsId: string) => {
    if (!wsId) return;
    // Reconcile first: a floor whose worktree was deleted outside Dogwalker
    // shouldn't linger as a dead layer (v0.7 recovery).
    const { floors: list, active } = await window.dw.reconcileFloors(wsId);
    setFloors(list);
    setFloorId((cur) =>
      cur !== 'ground' && list.some((f) => f.id === cur) ? cur : active,
    );
  }, []);

  useEffect(() => {
    void refreshFloors(activeId);
  }, [activeId, refreshFloors]);

  const switchFloor = useCallback(
    (id: string) => {
      setFloorId(id);
      void window.dw.setActiveFloor(activeId, id);
    },
    [activeId],
  );

  // Track the OS light/dark scheme for the follow-system option.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Resolve and apply the active terminal theme.
  const activeTheme = useMemo(() => {
    if (settings.followSystem) {
      const name = osDark ? settings.themeName : settings.lightThemeName;
      return findTheme(themes, name) ?? findTheme(themes, settings.themeName);
    }
    return findTheme(themes, settings.themeName);
  }, [settings, themes, osDark]);

  // One theme: recolor the terminals AND derive the whole UI chrome from it.
  useEffect(() => {
    const theme = activeTheme ?? BUILTIN_THEMES[0];
    terminals.setTheme(theme.theme);
    applyThemeChrome(theme);
  }, [activeTheme]);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const next = await window.dw.setSettings(partial);
    setSettings(next);
  }, []);

  const activeWorkspace = workspaces.find((w) => w.id === activeId);

  const switchTo = useCallback((id: string) => {
    setActiveId(id);
    void window.dw.setActiveWorkspace(id);
  }, []);

  // Ctrl/⌘+1..9 jump to a workspace; Ctrl+Alt+←/→ step through them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || workspaces.length === 0) return;
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const i = workspaces.findIndex((w) => w.id === activeId);
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const next = workspaces[(i + step + workspaces.length) % workspaces.length];
        if (next) switchTo(next.id);
        return;
      }
      if (e.altKey || e.shiftKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9 && workspaces[n - 1]) {
        e.preventDefault();
        switchTo(workspaces[n - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspaces, activeId, switchTo]);

  const create = useCallback(async () => {
    const ws = await window.dw.createWorkspace('New workspace', '');
    await refresh();
    switchTo(ws.id);
  }, [refresh, switchTo]);

  const rename = useCallback(
    async (id: string, name: string, icon: string, cwd?: string) => {
      await window.dw.renameWorkspace(id, name, icon, cwd);
      await refresh();
    },
    [refresh],
  );

  const hibernate = useCallback(async (id: string) => {
    await window.dw.hibernateWorkspace(id);
  }, []);

  const addDivider = useCallback(async () => {
    await window.dw.addDivider('Section');
    await refresh();
  }, [refresh]);

  const renameDivider = useCallback(
    async (id: string, label: string) => {
      await window.dw.renameDivider(id, label);
      await refresh();
    },
    [refresh],
  );

  const removeDivider = useCallback(
    async (id: string) => {
      await window.dw.removeDivider(id);
      await refresh();
    },
    [refresh],
  );

  const reorderSidebar = useCallback(
    async (entries: SidebarEntry[]) => {
      setSidebar(entries); // optimistic; refresh reconciles with disk
      await window.dw.reorderSidebar(entries);
      await refresh();
    },
    [refresh],
  );

  // Background-workspace test: a workspace's terminals must survive switching
  // away, be re-adopted (same live id) on return, and be released by hibernate.
  const bgRan = useRef(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('bgtest')) return;
    if (bgRan.current) return;
    bgRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      const { workspaces: list } = await window.dw.listWorkspaces();
      const A = list[0].id;
      const createdB = list.length < 2;
      const B = createdB
        ? (await window.dw.createWorkspace('bgtest-B', '🧪')).id
        : list[1].id;
      const camera = { x: -300, y: -150, zoom: 0.75 };
      await window.dw.saveLayout(A, {
        nodes: [
          {
            kind: 'terminal',
            stableId: 'bgtest-term',
            name: 'bg',
            preset: 'shell',
            x: 0,
            y: 0,
            w: 560,
            h: 380,
          },
        ],
        edges: [],
        viewport: camera,
      });
      await refresh();

      switchTo(A);
      await sleep(2500); // mount + spawn
      const live1 = await window.dw.listTerminals(A);
      const firstId = live1[0]?.id;
      // The camera must be back where it was left.
      const tr =
        document.querySelector<HTMLElement>('.react-flow__viewport')?.style
          .transform ?? '';
      const cameraRestored =
        tr.includes('translate(-300px, -150px)') && tr.includes('scale(0.75)');
      const savedVp = (await window.dw.loadWorkspace(A)).layout.viewport;

      switchTo(B); // leave A — its terminals must keep running
      await sleep(1800);
      const away = await window.dw.listTerminals(A);

      switchTo(A); // return — must adopt, not respawn
      await sleep(2500);
      const back = await window.dw.listTerminals(A);

      await window.dw.hibernateWorkspace(A);
      await sleep(400);
      const afterHibernate = await window.dw.listTerminals(A);

      console.log(
        'BGTEST RESULT ' +
          JSON.stringify({
            spawnedOnOpen: live1.length === 1,
            survivedSwitchAway: away.length === 1 && away[0].id === firstId,
            adoptedSameId: back.length === 1 && back[0].id === firstId,
            liveCountOnReturn: back.length,
            hibernated: afterHibernate.length === 0,
            cameraRestored,
            cameraPersisted: savedVp?.x === -300 && savedVp?.zoom === 0.75,
          }),
      );
      await window.dw.saveLayout(A, { nodes: [], edges: [] });
      if (createdB) await window.dw.deleteWorkspace(B);
    })();
  }, [refresh, switchTo]);

  // Diagnostic: seed two workspaces with distinct content + cameras, then
  // A → B → A, dumping both files and the live camera at each step.
  const switchRan = useRef(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('switchtest')) return;
    if (switchRan.current) return;
    switchRan.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const term = (stableId: string, name: string, x: number) => ({
      kind: 'terminal' as const,
      stableId,
      name,
      preset: 'shell' as const,
      x,
      y: 0,
      w: 560,
      h: 380,
    });
    const camOf = () =>
      document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ??
      '';
    void (async () => {
      const { workspaces: list } = await window.dw.listWorkspaces();
      const A = list[0].id;
      const B = list[1]?.id ?? (await window.dw.createWorkspace('switch-B', '🧪')).id;
      // A deliberately has NO saved camera: returning to it must land at the
      // origin, not inherit B's camera.
      await window.dw.saveLayout(A, {
        nodes: [term('sw-a', 'termA', 0)],
        edges: [],
      });
      await window.dw.saveLayout(B, {
        nodes: [term('sw-b', 'termB', 40)],
        edges: [],
        viewport: { x: -800, y: -800, zoom: 1.5 },
      });
      await refresh();

      const snap = async (label: string) => {
        const fa = (await window.dw.loadWorkspace(A)).layout;
        const fb = (await window.dw.loadWorkspace(B)).layout;
        return {
          step: label,
          Anodes: fa.nodes.length,
          Avp: fa.viewport,
          Bnodes: fb.nodes.length,
          Bvp: fb.viewport,
          dom: camOf(),
        };
      };

      switchTo(A);
      await sleep(3000);
      const s1 = await snap('afterOpenA');

      // Move A's camera and switch away IMMEDIATELY — inside the save debounce.
      // The pending save must be flushed on the way out, not dropped.
      const rf = document.querySelector<HTMLElement>('.react-flow__viewport');
      if (rf) rf.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -200 }));
      switchTo(B);
      await sleep(3000);
      const s2 = await snap('afterOpenB');

      switchTo(A);
      await sleep(3000);
      const s3 = await snap('afterReturnA');

      console.log('SWITCHTEST ' + JSON.stringify([s1, s2, s3]));
    })();
  }, [refresh, switchTo]);

  const remove = useCallback(
    async (id: string) => {
      await window.dw.deleteWorkspace(id);
      const { active } = await refresh();
      if (id === activeId) switchTo(active);
    },
    [refresh, activeId, switchTo],
  );

  // Sidebar test: pure section/reorder maths + a store round-trip (add divider,
  // reorder a workspace under it, remove divider) that must persist and restore.
  const sidebarRan = useRef(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('sidebartest')) return;
    if (sidebarRan.current) return;
    sidebarRan.current = true;
    void (async () => {
      const eq = (a: unknown, b: unknown) =>
        JSON.stringify(a) === JSON.stringify(b);

      // Pure ops.
      const entries: SidebarEntry[] = [
        { kind: 'workspace', id: 'a' },
        { kind: 'divider', id: 'd1', label: 'Work' },
        { kind: 'workspace', id: 'b' },
        { kind: 'workspace', id: 'c' },
      ];
      const secs = sectionsOf(entries);
      const pureSections =
        secs.length === 2 &&
        eq(secs[0].workspaceIds, ['a']) &&
        secs[1].label === 'Work' &&
        eq(secs[1].workspaceIds, ['b', 'c']);
      // Drop 'a' after 'c' → order becomes d1,b,c,a.
      const moved = reorderByDrop(entries, 'a', 'c', 'after');
      const pureReorder = eq(moved.map((e) => e.id), ['d1', 'b', 'c', 'a']);
      // Leading implicit empty section is dropped when a divider leads.
      const leadDivider = sectionsOf([
        { kind: 'divider', id: 'd', label: 'X' },
        { kind: 'workspace', id: 'a' },
      ]);
      const pureLead = leadDivider.length === 1 && leadDivider[0].label === 'X';
      // No-op self-drop.
      const pureNoop = eq(reorderByDrop(entries, 'b', 'b', 'before'), entries);

      // Store round-trip against the real index; capture to restore afterwards.
      const before = (await window.dw.listWorkspaces()).sidebar;
      const firstWs = before.find((e) => e.kind === 'workspace');

      await window.dw.addDivider('SIDEBARTEST');
      const withDivider = (await window.dw.listWorkspaces()).sidebar;
      const div = withDivider.find(
        (e) => e.kind === 'divider' && e.label === 'SIDEBARTEST',
      );
      const dividerAdded = !!div && withDivider.length === before.length + 1;

      let reorderPersisted = false;
      if (div && firstWs) {
        const target = reorderByDrop(withDivider, firstWs.id, div.id, 'after');
        await window.dw.reorderSidebar(target);
        const after = (await window.dw.listWorkspaces()).sidebar;
        const di = after.findIndex((e) => e.id === div.id);
        const wi = after.findIndex((e) => e.id === firstWs.id);
        reorderPersisted = di >= 0 && wi === di + 1;
      }

      if (div) await window.dw.removeDivider(div.id);
      const afterRemove = (await window.dw.listWorkspaces()).sidebar;
      const dividerRemoved = !afterRemove.some(
        (e) => e.kind === 'divider' && e.label === 'SIDEBARTEST',
      );

      // Restore the original rail order.
      await window.dw.reorderSidebar(before);
      const restored = eq((await window.dw.listWorkspaces()).sidebar, before);

      console.log(
        'SIDEBARTEST RESULT ' +
          JSON.stringify({
            pureSections,
            pureReorder,
            pureLead,
            pureNoop,
            dividerAdded,
            reorderPersisted,
            dividerRemoved,
            restored,
          }),
      );
    })();
  }, []);

  return (
    <div className="dw-app">
      <Sidebar
        workspaces={workspaces}
        sidebar={sidebar}
        activeId={activeId}
        mini={settings.miniSidebar}
        onSwitch={switchTo}
        onCreate={() => void create()}
        onOpenMenu={() => setPanelOpen(true)}
        onToggleMini={() =>
          void updateSettings({ miniSidebar: !settings.miniSidebar })
        }
        onAddDivider={() => void addDivider()}
        onRenameDivider={(id, label) => void renameDivider(id, label)}
        onRemoveDivider={(id) => void removeDivider(id)}
        onReorder={(entries) => void reorderSidebar(entries)}
      />
      <div className="dw-main">
        {activeId && (
          <>
            <FloorBar
              workspaceId={activeId}
              floors={floors}
              activeFloor={floorId}
              onSwitch={switchFloor}
              onChanged={() => void refreshFloors(activeId)}
            />
            <div className="dw-canvas-area">
              <ReactFlowProvider key={`${activeId}:${floorId}`}>
                <Canvas
                  workspaceId={activeId}
                  workspaceCwd={
                    floorId === 'ground'
                      ? activeWorkspace?.cwd ?? ''
                      : floors.find((f) => f.id === floorId)?.path ?? ''
                  }
                  floorId={floorId}
                  floorLabel={
                    floorId === 'ground'
                      ? 'ground'
                      : floors.find((f) => f.id === floorId)?.name ?? floorId
                  }
                  isDev={IS_DEV}
                  notifyOnAttention={settings.notifyOnAttention}
                />
              </ReactFlowProvider>
            </div>
          </>
        )}
      </div>
      <Panel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        workspaces={workspaces}
        activeId={activeId}
        onSwitch={(id) => {
          switchTo(id);
          setPanelOpen(false);
        }}
        onCreate={() => void create()}
        onRename={(id, name, icon, cwd) => void rename(id, name, icon, cwd)}
        onDelete={(id) => void remove(id)}
        onHibernate={(id) => void hibernate(id)}
        themes={themes}
        settings={settings}
        activeThemeName={(activeTheme ?? BUILTIN_THEMES[0]).name}
        onUpdateSettings={(p) => void updateSettings(p)}
      />
    </div>
  );
}
