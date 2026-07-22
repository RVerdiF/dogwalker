import type { WorkspaceMeta } from '../shared/ipc';

interface Props {
  workspaces: WorkspaceMeta[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onOpenMenu: () => void;
}

/**
 * The slim workspace rail — the always-visible spine of the end-user UI. Each
 * workspace is an icon; the gear opens the full sectioned menu (Panel).
 */
export function Sidebar({ workspaces, activeId, onSwitch, onCreate, onOpenMenu }: Props) {
  return (
    <div className="dw-rail">
      <div className="dw-rail-brand" title="Dogwalker">
        🐕
      </div>
      <div className="dw-rail-list">
        {workspaces.map((w) => (
          <button
            key={w.id}
            className={`dw-rail-ws ${w.id === activeId ? 'active' : ''}`}
            title={w.name}
            onClick={() => onSwitch(w.id)}
          >
            <span className="dw-rail-ws-icon">{w.icon}</span>
          </button>
        ))}
        <button className="dw-rail-add" title="New workspace" onClick={onCreate}>
          +
        </button>
      </div>
      <button className="dw-rail-menu" title="Menu" onClick={onOpenMenu}>
        ⚙
      </button>
    </div>
  );
}
