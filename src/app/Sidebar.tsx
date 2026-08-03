import { useState } from 'react';
import type { SidebarEntry, WorkspaceMeta } from '../shared/ipc';
import { reorderByDrop, sectionsOf } from './sidebarOps';
import { DogwalkerLogo, GearIcon } from './icons';

interface Props {
  workspaces: WorkspaceMeta[];
  sidebar: SidebarEntry[];
  activeId: string;
  mini: boolean;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onOpenMenu: () => void;
  onToggleMini: () => void;
  onAddDivider: () => void;
  onRenameDivider: (id: string, label: string) => void;
  onRemoveDivider: (id: string) => void;
  onReorder: (entries: SidebarEntry[]) => void;
}

/**
 * The workspace rail — the always-visible spine of the end-user UI. Workspaces
 * and named dividers form a flat, drag-reorderable list (PRODUCT.md §12);
 * dividers partition it into labeled sections. Collapses to an icon-only mini
 * rail. The gear opens the full sectioned menu (Panel).
 */
export function Sidebar({
  workspaces,
  sidebar,
  activeId,
  mini,
  onSwitch,
  onCreate,
  onOpenMenu,
  onToggleMini,
  onAddDivider,
  onRenameDivider,
  onRemoveDivider,
  onReorder,
}: Props) {
  const byId = new Map(workspaces.map((w) => [w.id, w]));
  const sections = sectionsOf(sidebar);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  // Compute a drop relative to the target's vertical midpoint and commit it.
  const drop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const place = e.clientY < box.top + box.height / 2 ? 'before' : 'after';
    onReorder(reorderByDrop(sidebar, dragId, targetId, place));
    setDragId(null);
  };

  const dragProps = (id: string) => ({
    draggable: editing === null,
    onDragStart: () => setDragId(id),
    onDragEnd: () => setDragId(null),
    onDragOver: (e: React.DragEvent) => dragId && e.preventDefault(),
    onDrop: (e: React.DragEvent) => drop(e, id),
  });

  return (
    <div className={`dw-rail ${mini ? 'mini' : 'expanded'}`}>
      <div className="dw-rail-brand" title="Dogwalker">
        <DogwalkerLogo size={40} />
      </div>
      <div className="dw-rail-list">
        {sections.map((sec, i) => (
          <div className="dw-rail-section" key={sec.dividerId ?? `top-${i}`}>
            {sec.dividerId &&
              (editing === sec.dividerId ? (
                <input
                  className="dw-rail-divider-input"
                  defaultValue={sec.label}
                  autoFocus
                  onBlur={(e) => {
                    onRenameDivider(sec.dividerId!, e.target.value.trim() || sec.label!);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <div
                  className={`dw-rail-divider ${
                    dragId === sec.dividerId ? 'dragging' : ''
                  }`}
                  title={sec.label}
                  {...dragProps(sec.dividerId)}
                  onDoubleClick={() => setEditing(sec.dividerId!)}
                >
                  <span className="dw-rail-divider-label">{sec.label}</span>
                  <button
                    className="dw-rail-divider-x"
                    title="Remove divider"
                    onClick={() => onRemoveDivider(sec.dividerId!)}
                  >
                    ×
                  </button>
                </div>
              ))}
            {sec.workspaceIds.map((id) => {
              const w = byId.get(id);
              if (!w) return null;
              return (
                <button
                  key={id}
                  className={`dw-rail-ws ${id === activeId ? 'active' : ''} ${
                    dragId === id ? 'dragging' : ''
                  }`}
                  title={w.name}
                  onClick={() => onSwitch(id)}
                  {...dragProps(id)}
                >
                  {!mini ? (
                    <span className="dw-rail-ws-name">{w.name}</span>
                  ) : (
                    <span className="dw-rail-ws-mini">{w.name.slice(0, 2)}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <div className="dw-rail-adders">
          <button className="dw-rail-add" title="New workspace" onClick={onCreate}>
            +
          </button>
          <button
            className="dw-rail-add dw-rail-add-divider"
            title="Add divider"
            onClick={onAddDivider}
          >
            ―
          </button>
        </div>
      </div>
      <button
        className="dw-rail-menu"
        title={mini ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={onToggleMini}
      >
        {mini ? '»' : '«'}
      </button>
      <button className="dw-rail-menu" title="Menu" onClick={onOpenMenu}>
        <GearIcon size={17} />
      </button>
    </div>
  );
}
