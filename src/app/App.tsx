import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const switchTo = useCallback((id: string) => {
    setActiveId(id);
    void window.dw.setActiveWorkspace(id);
  }, []);

  const create = useCallback(async () => {
    const ws = await window.dw.createWorkspace('New workspace', '🐕');
    await refresh();
    switchTo(ws.id);
  }, [refresh, switchTo]);

  const rename = useCallback(
    async (id: string, name: string, icon: string) => {
      await window.dw.renameWorkspace(id, name, icon);
      await refresh();
    },
    [refresh],
  );

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
            <Canvas workspaceId={activeId} isDev={IS_DEV} />
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
        onRename={(id, name, icon) => void rename(id, name, icon)}
        onDelete={(id) => void remove(id)}
        themes={themes}
        settings={settings}
        activeThemeName={(activeTheme ?? BUILTIN_THEMES[0]).name}
        onUpdateSettings={(p) => void updateSettings(p)}
      />
    </div>
  );
}
