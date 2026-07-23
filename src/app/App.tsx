import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { AppSettings, WorkspaceMeta } from '../shared/ipc';
import { BUILTIN_THEMES, type ThemeSpec } from '../shared/themes';
import { terminals } from './terminalService';
import { Canvas } from './Canvas';
import { Sidebar } from './Sidebar';
import { Panel } from './Panel';

const IS_DEV = import.meta.env.DEV;

const DEFAULT_SETTINGS: AppSettings = {
  themeName: 'Dogwalker Dark',
  lightThemeName: 'GitHub Light',
  followSystem: false,
  notifyOnAttention: true,
};

function findTheme(themes: ThemeSpec[], name: string): ThemeSpec | undefined {
  return themes.find((t) => t.name === name);
}

export function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [themes, setThemes] = useState<ThemeSpec[]>(BUILTIN_THEMES);
  const [osDark, setOsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  const refresh = useCallback(async () => {
    const { workspaces: list, active } = await window.dw.listWorkspaces();
    setWorkspaces(list);
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

  useEffect(() => {
    terminals.setTheme((activeTheme ?? BUILTIN_THEMES[0]).theme);
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
    const ws = await window.dw.createWorkspace('New workspace', '🐕');
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

  return (
    <div className="dw-app">
      <Sidebar
        workspaces={workspaces}
        activeId={activeId}
        onSwitch={switchTo}
        onCreate={() => void create()}
        onOpenMenu={() => setPanelOpen(true)}
      />
      <div className="dw-main">
        {activeId && (
          <ReactFlowProvider key={activeId}>
            <Canvas
              workspaceId={activeId}
              workspaceCwd={activeWorkspace?.cwd ?? ''}
              isDev={IS_DEV}
              notifyOnAttention={settings.notifyOnAttention}
            />
          </ReactFlowProvider>
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
