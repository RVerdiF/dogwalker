import { useEffect, useState } from 'react';
import type { AppSettings, WorkspaceMeta } from '../shared/ipc';
import type { ThemeSpec } from '../shared/themes';

interface Props {
  open: boolean;
  onClose: () => void;
  workspaces: WorkspaceMeta[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string, icon: string) => void;
  onDelete: (id: string) => void;
  themes: ThemeSpec[];
  settings: AppSettings;
  activeThemeName: string;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
}

type SectionId = 'workspaces' | 'agents' | 'presets' | 'roles' | 'settings';

const SECTIONS: Array<{ id: SectionId; label: string; icon: string; ready: boolean }> = [
  { id: 'workspaces', label: 'Workspaces', icon: '🗂️', ready: true },
  { id: 'agents', label: 'Agents', icon: '🤖', ready: false },
  { id: 'presets', label: 'Presets', icon: '⚡', ready: false },
  { id: 'roles', label: 'Roles', icon: '🎭', ready: false },
  { id: 'settings', label: 'Settings', icon: '⚙️', ready: true },
];

/**
 * The sectioned end-user menu, rendered as a light glass surface. Workspaces is
 * live; the other sections are placeholders that map to upcoming versions
 * (Agents/Presets/Roles/Settings) so the shell is already the home for them.
 */
export function Panel(props: Props) {
  const { open, onClose } = props;
  const [section, setSection] = useState<SectionId>('workspaces');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dw-panel-scrim" onClick={onClose}>
      <div className="dw-panel" onClick={(e) => e.stopPropagation()}>
        <nav className="dw-panel-nav">
          <div className="dw-panel-title">Dogwalker</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`dw-panel-navitem ${section === s.id ? 'active' : ''} ${
                s.ready ? '' : 'soon'
              }`}
              onClick={() => s.ready && setSection(s.id)}
            >
              <span className="dw-panel-navicon">{s.icon}</span>
              {s.label}
              {!s.ready && <span className="dw-soon">soon</span>}
            </button>
          ))}
        </nav>
        <div className="dw-panel-body">
          {section === 'workspaces' ? (
            <WorkspacesSection {...props} />
          ) : section === 'settings' ? (
            <SettingsSection {...props} />
          ) : (
            <div className="dw-panel-placeholder">
              This section arrives in a later version.
            </div>
          )}
        </div>
        <button className="dw-panel-close" onClick={onClose} title="Close">
          ×
        </button>
      </div>
    </div>
  );
}

function WorkspacesSection({
  workspaces,
  activeId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  return (
    <div className="dw-section">
      <div className="dw-section-head">
        <h2>Workspaces</h2>
        <button className="dw-btn-primary" onClick={onCreate}>
          + New
        </button>
      </div>
      <div className="dw-ws-grid">
        {workspaces.map((w) => (
          <WorkspaceCard
            key={w.id}
            ws={w}
            active={w.id === activeId}
            canDelete={workspaces.length > 1}
            onSwitch={() => onSwitch(w.id)}
            onRename={(name, icon) => onRename(w.id, name, icon)}
            onDelete={() => onDelete(w.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SettingsSection({ themes, settings, activeThemeName, onUpdateSettings }: Props) {
  const lightThemes = themes.filter((t) => t.appearance === 'light');
  return (
    <div className="dw-section">
      <div className="dw-section-head">
        <h2>Terminal theme</h2>
        <span className="dw-active-theme">active: {activeThemeName}</span>
      </div>

      <div className="dw-theme-grid">
        {themes.map((t) => (
          <button
            key={t.name}
            className={`dw-theme-card ${
              settings.themeName === t.name ? 'active' : ''
            }`}
            onClick={() => onUpdateSettings({ themeName: t.name })}
            title={t.name}
          >
            <ThemeSwatch theme={t} />
            <span className="dw-theme-name">
              {t.name}
              {!t.builtin && <span className="dw-theme-custom">custom</span>}
            </span>
          </button>
        ))}
      </div>

      <label className="dw-toggle-row">
        <input
          type="checkbox"
          checked={settings.followSystem}
          onChange={(e) => onUpdateSettings({ followSystem: e.target.checked })}
        />
        Follow system light/dark
      </label>

      <div className="dw-section-head" style={{ marginTop: 8 }}>
        <h2>Notifications</h2>
      </div>
      <label className="dw-toggle-row">
        <input
          type="checkbox"
          checked={settings.notifyOnAttention}
          onChange={(e) => onUpdateSettings({ notifyOnAttention: e.target.checked })}
        />
        Notify when a terminal needs attention (suppressed while it's selected)
      </label>

      {settings.followSystem && (
        <div className="dw-light-picker">
          <span>Light theme:</span>
          <select
            value={settings.lightThemeName}
            onChange={(e) => onUpdateSettings({ lightThemeName: e.target.value })}
          >
            {lightThemes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="dw-settings-hint">
        Drop custom <code>.json</code> themes in the app's{' '}
        <code>terminal-themes</code> folder; they appear here after a restart.
      </p>
    </div>
  );
}

function ThemeSwatch({ theme }: { theme: ThemeSpec }) {
  const t = theme.theme;
  const dots = [t.red, t.green, t.yellow, t.blue, t.magenta, t.cyan];
  return (
    <div className="dw-swatch" style={{ background: t.background }}>
      <span className="dw-swatch-text" style={{ color: t.foreground }}>
        Aa
      </span>
      <div className="dw-swatch-dots">
        {dots.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function WorkspaceCard({
  ws,
  active,
  canDelete,
  onSwitch,
  onRename,
  onDelete,
}: {
  ws: WorkspaceMeta;
  active: boolean;
  canDelete: boolean;
  onSwitch: () => void;
  onRename: (name: string, icon: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ws.name);
  const [icon, setIcon] = useState(ws.icon);

  return (
    <div className={`dw-ws-card ${active ? 'active' : ''}`}>
      {editing ? (
        <div className="dw-ws-edit">
          <input
            className="dw-ws-icon-input"
            value={icon}
            maxLength={2}
            onChange={(e) => setIcon(e.target.value)}
          />
          <input
            className="dw-ws-name-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onRename(name.trim() || ws.name, icon || ws.icon);
                setEditing(false);
              }
            }}
          />
          <button
            className="dw-btn-small"
            onClick={() => {
              onRename(name.trim() || ws.name, icon || ws.icon);
              setEditing(false);
            }}
          >
            Save
          </button>
        </div>
      ) : (
        <>
          <button className="dw-ws-open" onClick={onSwitch}>
            <span className="dw-ws-card-icon">{ws.icon}</span>
            <span className="dw-ws-card-name">{ws.name}</span>
            {active && <span className="dw-ws-active-dot" />}
          </button>
          <div className="dw-ws-actions">
            <button className="dw-btn-small" onClick={() => setEditing(true)}>
              Rename
            </button>
            {canDelete && (
              <button className="dw-btn-small dw-btn-danger" onClick={onDelete}>
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
