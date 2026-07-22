import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { WorkspaceMeta } from '../shared/ipc';
import { Canvas } from './Canvas';
import { Sidebar } from './Sidebar';
import { Panel } from './Panel';

const IS_DEV = import.meta.env.DEV;

export function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(false);

  const refresh = useCallback(async () => {
    const { workspaces: list, active } = await window.dw.listWorkspaces();
    setWorkspaces(list);
    setActiveId((cur) => (list.some((w) => w.id === cur) ? cur : active));
    return { list, active };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      />
    </div>
  );
}
