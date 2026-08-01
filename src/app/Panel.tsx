import { useEffect, useState } from 'react';
import type { AppSettings, LiveTerminal, Routine, WorkspaceMeta } from '../shared/ipc';
import type { ThemeSpec } from '../shared/themes';

interface Props {
  open: boolean;
  onClose: () => void;
  workspaces: WorkspaceMeta[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string, icon: string, cwd?: string) => void;
  onDelete: (id: string) => void;
  onHibernate: (id: string) => void;
  themes: ThemeSpec[];
  settings: AppSettings;
  activeThemeName: string;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
}

type SectionId = 'workspaces' | 'routines' | 'agents' | 'presets' | 'roles' | 'settings';

const SECTIONS: Array<{ id: SectionId; label: string; icon: string; ready: boolean }> = [
  { id: 'workspaces', label: 'Workspaces', icon: '🗂️', ready: true },
  { id: 'routines', label: 'Routines', icon: '⏱️', ready: true },
  { id: 'agents', label: 'Agents', icon: '🤖', ready: false },
  { id: 'presets', label: 'Presets', icon: '⚡', ready: true },
  { id: 'roles', label: 'Roles', icon: '🎭', ready: true },
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
          ) : section === 'routines' ? (
            <RoutinesSection activeId={props.activeId} />
          ) : section === 'settings' ? (
            <SettingsSection {...props} />
          ) : section === 'presets' ? (
            <PresetsSection />
          ) : section === 'roles' ? (
            <RolesSection />
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

function PresetsSection() {
  const [items, setItems] = useState<Array<{ id: string; name: string; icon: string; command: string; builtin?: boolean }>>([]);
  const [name, setName] = useState(''); const [icon, setIcon] = useState('⚡'); const [command, setCommand] = useState('');
  const refresh = () => void window.dw.listPresets().then((presets) => { setItems(presets); window.dispatchEvent(new Event('dw:presets-changed')); });
  useEffect(() => { refresh(); }, []);
  const add = async () => { if (!command.trim()) return; await window.dw.createPreset({ name, icon, command }); setName(''); setCommand(''); refresh(); };
  return <div className="dw-section"><div className="dw-section-head"><h2>Presets</h2></div>
    <p className="dw-settings-hint">Reusable terminal launch commands. Built-ins are read-only.</p>
    <div className="dw-routine-form"><div className="dw-routine-row"><input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} /><input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /><input placeholder="Command" value={command} onChange={(e) => setCommand(e.target.value)} /></div><button className="dw-btn-primary" onClick={() => void add()}>+ Add preset</button></div>
    <div className="dw-routine-list">{items.map((p) => <div className="dw-routine-card" key={p.id}><div className="dw-routine-info"><div className="dw-routine-title">{p.icon} {p.name} {p.builtin && <span className="dw-routine-meta">built-in</span>}</div><div className="dw-routine-prompt-preview">{p.command || 'plain shell'}</div></div>{!p.builtin && <div className="dw-routine-actions"><button className="dw-btn-small" onClick={() => { const name = window.prompt('Preset name', p.name); const command = window.prompt('Command', p.command); if (name !== null && command !== null) void window.dw.updatePreset(p.id, { name, icon: p.icon, command }).then(refresh); }}>Edit</button><button className="dw-btn-small" onClick={() => void window.dw.createPreset({ name: p.name + ' copy', icon: p.icon, command: p.command }).then(refresh)}>Duplicate</button><button className="dw-btn-small dw-btn-danger" onClick={() => void window.dw.deletePreset(p.id).then(refresh)}>Delete</button></div>}</div>)}</div>
  </div>;
}

function RolesSection() {
  const [items, setItems] = useState<Array<{ id: string; name: string; instructions: string }>>([]);
  const [name, setName] = useState(''); const [instructions, setInstructions] = useState('');
  const refresh = () => void window.dw.listRoles().then((roles) => { setItems(roles); window.dispatchEvent(new Event('dw:roles-changed')); });
  useEffect(() => { refresh(); }, []);
  const add = async () => { if (!name.trim()) return; await window.dw.createRole({ name, instructions }); setName(''); setInstructions(''); refresh(); };
  return <div className="dw-section"><div className="dw-section-head"><h2>Roles</h2></div>
    <p className="dw-settings-hint">Reusable Markdown instructions. Assign one in a terminal header.</p>
    <div className="dw-routine-form"><input placeholder="Role name" value={name} onChange={(e) => setName(e.target.value)} /><textarea rows={4} placeholder="Instructions for this role…" value={instructions} onChange={(e) => setInstructions(e.target.value)} /><button className="dw-btn-primary" onClick={() => void add()}>+ Add role</button></div>
    <div className="dw-routine-list">{items.map((r) => <div className="dw-routine-card" key={r.id}><div className="dw-routine-info"><div className="dw-routine-title">{r.name}</div><div className="dw-routine-prompt-preview">{r.instructions || 'No instructions yet.'}</div></div><div className="dw-routine-actions"><button className="dw-btn-small" onClick={() => { const name = window.prompt('Role name', r.name); const instructions = window.prompt('Instructions', r.instructions); if (name !== null && instructions !== null) void window.dw.updateRole(r.id, { name, instructions }).then(refresh); }}>Edit</button><button className="dw-btn-small" onClick={() => void window.dw.createRole({ name: r.name + ' copy', instructions: r.instructions }).then(refresh)}>Duplicate</button><button className="dw-btn-small dw-btn-danger" onClick={() => void window.dw.deleteRole(r.id).then(refresh)}>Delete</button></div></div>)}</div>
  </div>;
}

function WorkspacesSection({
  workspaces,
  activeId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onHibernate,
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
            onRename={(name, icon, cwd) => onRename(w.id, name, icon, cwd)}
            onDelete={() => onDelete(w.id)}
            onHibernate={() => onHibernate(w.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RoutinesSection({ activeId }: { activeId: string }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [terminals, setTerminals] = useState<LiveTerminal[]>([]);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [prompt, setPrompt] = useState('');
  const [everySec, setEverySec] = useState(300);

  const refresh = () => {
    void window.dw.listRoutines(activeId).then(setRoutines);
    void window.dw.listTerminals(activeId).then((t) => {
      setTerminals(t);
      setTarget((cur) => cur || t[0]?.stableId || '');
    });
  };

  useEffect(() => {
    refresh();
    return window.dw.onRoutineUpdate((r) =>
      setRoutines((rs) => rs.map((x) => (x.id === r.id ? r : x))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const create = async () => {
    if (!prompt.trim() || !target) return;
    await window.dw.createRoutine(activeId, {
      name: name.trim() || 'routine',
      targetStableId: target,
      prompt: prompt.trim(),
      intervalMs: Math.max(5, everySec) * 1000,
    });
    setName('');
    setPrompt('');
    refresh();
  };

  const nameOf = (stableId: string) =>
    terminals.find((t) => t.stableId === stableId)?.name ?? '(offline)';

  return (
    <div className="dw-section">
      <div className="dw-section-head">
        <h2>Routines</h2>
      </div>
      <p className="dw-settings-hint">
        A scheduled prompt for an agent. Chain steps with <code>&&</code> (or new
        lines) — each waits for the agent's turn to finish before the next.
      </p>

      <div className="dw-routine-form">
        <div className="dw-routine-row">
          <input
            className="dw-routine-name"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {terminals.length === 0 && <option value="">no live terminals</option>}
            {terminals.map((t) => (
              <option key={t.stableId} value={t.stableId}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="dw-routine-every">
            every
            <input
              type="number"
              min={5}
              value={everySec}
              onChange={(e) => setEverySec(Number(e.target.value))}
            />
            s
          </label>
        </div>
        <textarea
          className="dw-routine-prompt"
          placeholder="run the tests && summarize failures into the notes"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
        />
        <button className="dw-btn-primary" onClick={() => void create()} disabled={!target}>
          + Add routine
        </button>
      </div>

      <div className="dw-routine-list">
        {routines.length === 0 && <div className="dw-routine-empty">No routines yet.</div>}
        {routines.map((r) => (
          <div key={r.id} className="dw-routine-card">
            <span className={`dw-routine-dot ${r.status}`} title={r.status} />
            <div className="dw-routine-info">
              <div className="dw-routine-title">
                {r.name}
                <span className="dw-routine-meta">
                  → {nameOf(r.targetStableId)} · every {Math.round(r.intervalMs / 1000)}s ·{' '}
                  {r.status}
                </span>
              </div>
              <div className="dw-routine-prompt-preview">{r.prompt}</div>
              {r.lastError && <div className="dw-routine-err">⚠ {r.lastError}</div>}
            </div>
            <div className="dw-routine-actions">
              <button className="dw-btn-small" onClick={() => void window.dw.runRoutineNow(r.id)}>
                Run
              </button>
              <button
                className="dw-btn-small"
                onClick={() =>
                  void window.dw.setRoutineEnabled(r.id, !r.enabled).then(refresh)
                }
              >
                {r.enabled ? 'Pause' : 'Resume'}
              </button>
              <button
                className="dw-btn-small dw-btn-danger"
                onClick={() => void window.dw.deleteRoutine(r.id).then(refresh)}
              >
                Delete
              </button>
            </div>
          </div>
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
  onHibernate,
}: {
  ws: WorkspaceMeta;
  active: boolean;
  canDelete: boolean;
  onSwitch: () => void;
  onRename: (name: string, icon: string, cwd?: string) => void;
  onDelete: () => void;
  onHibernate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ws.name);
  const [icon, setIcon] = useState(ws.icon);
  const [cwd, setCwd] = useState(ws.cwd);
  const [sync, setSync] = useState(!!ws.syncAgentDocs);

  const save = () => {
    onRename(name.trim() || ws.name, icon || ws.icon, cwd.trim() || ws.cwd);
    setEditing(false);
  };

  return (
    <div className={`dw-ws-card ${active ? 'active' : ''}`}>
      {editing ? (
        <div className="dw-ws-editor">
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
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
          <div className="dw-ws-edit">
            <input
              className="dw-ws-cwd-input"
              value={cwd}
              placeholder="working directory"
              onChange={(e) => setCwd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button
              className="dw-btn-small"
              title="Choose folder"
              onClick={() => {
                void window.dw.pickDirectory().then((p) => p && setCwd(p));
              }}
            >
              …
            </button>
          </div>
          <div className="dw-ws-actions">
            <button className="dw-btn-small" onClick={save}>
              Save
            </button>
            <button className="dw-btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button className="dw-ws-open" onClick={onSwitch}>
            <span className="dw-ws-card-icon">{ws.icon}</span>
            <span className="dw-ws-card-name">{ws.name}</span>
            {active && <span className="dw-ws-active-dot" />}
          </button>
          <div className="dw-ws-cwd" title={ws.cwd}>
            {ws.cwd}
          </div>
          <div className="dw-ws-actions">
            <button className="dw-btn-small" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              className="dw-btn-small"
              title="Open the working directory"
              onClick={() => void window.dw.openPath(ws.cwd)}
            >
              Open
            </button>
            <button
              className="dw-btn-small"
              title="Release this workspace's terminals"
              onClick={onHibernate}
            >
              Hibernate
            </button>
            {canDelete && (
              <button className="dw-btn-small dw-btn-danger" onClick={onDelete}>
                Delete
              </button>
            )}
          </div>
          <label className="dw-ws-sync" title="Mirror CLAUDE.md and AGENTS.md in this workspace's directory">
            <input
              type="checkbox"
              checked={sync}
              onChange={(e) => {
                setSync(e.target.checked);
                void window.dw.setSyncAgentDocs(ws.id, e.target.checked);
              }}
            />
            Sync CLAUDE.md ↔ AGENTS.md
          </label>
        </>
      )}
    </div>
  );
}
