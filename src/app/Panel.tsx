import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { AppSettings, LiveTerminal, Contract, Routine, WorkspaceMeta } from '../shared/ipc';
import type { ThemeSpec } from '../shared/themes';
import { SchemaEditor } from './SchemaEditor';
import {
  WorkspacesIcon,
  RoutinesIcon,
  BoltIcon,
  RoleIcon,
  ContractIcon,
  GearIcon,
  WarningIcon,
  PresetGlyph,
  PRESET_ICON_IDS,
  DEFAULT_PRESET_ICON,
} from './icons';

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

type SectionId = 'workspaces' | 'routines' | 'presets' | 'roles' | 'contracts' | 'settings';

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  icon: ComponentType<{ size?: number }>;
  ready: boolean;
}> = [
  { id: 'workspaces', label: 'Workspaces', icon: WorkspacesIcon, ready: true },
  { id: 'routines', label: 'Routines', icon: RoutinesIcon, ready: true },
  { id: 'presets', label: 'Presets', icon: BoltIcon, ready: true },
  { id: 'roles', label: 'Roles', icon: RoleIcon, ready: true },
  { id: 'contracts', label: 'Contracts', icon: ContractIcon, ready: true },
  { id: 'settings', label: 'Settings', icon: GearIcon, ready: true },
];

/**
 * The sectioned end-user menu, rendered as a light glass surface: workspaces,
 * routines, presets, roles, contracts, and settings.
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
              <span className="dw-panel-navicon"><s.icon size={16} /></span>
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
          ) : section === 'contracts' ? (
            <ContractsSection />
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

function IconPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="dw-icon-picker">
      {PRESET_ICON_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={`dw-icon-swatch${id === value ? ' active' : ''}`}
          title={id}
          onClick={() => onChange(id)}
        >
          <PresetGlyph id={id} size={18} />
        </button>
      ))}
    </div>
  );
}

type PresetItem = { id: string; name: string; icon: string; command: string; builtin?: boolean };

function PresetsSection() {
  const [items, setItems] = useState<PresetItem[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_PRESET_ICON);
  const [command, setCommand] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const refresh = () => void window.dw.listPresets().then((presets) => { setItems(presets); window.dispatchEvent(new Event('dw:presets-changed')); });
  useEffect(() => { refresh(); }, []);
  const add = async () => {
    if (!command.trim() && !name.trim()) return;
    await window.dw.createPreset({ name, icon, command });
    setName(''); setCommand(''); setIcon(DEFAULT_PRESET_ICON);
    refresh();
  };
  return <div className="dw-section"><h2 className="dw-section-head">Presets</h2>
    <p className="dw-settings-hint">Reusable terminal launch commands. Pick an icon for the terminal palette; built-in commands are read-only but can be duplicated or deleted.</p>
    <div className="dw-routine-form">
      <IconPicker value={icon} onChange={setIcon} />
      <div className="dw-routine-row">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Command" value={command} onChange={(e) => setCommand(e.target.value)} />
      </div>
      <button className="dw-btn-primary" onClick={() => void add()}>+ Add preset</button>
    </div>
    <div className="dw-routine-list">{items.map((p) => (
      editingId === p.id ? (
        <PresetEditor
          key={p.id}
          preset={p}
          onCancel={() => setEditingId(null)}
          onSave={(next) => void window.dw.updatePreset(p.id, next).then(() => { setEditingId(null); refresh(); })}
        />
      ) : (
        <div className="dw-routine-card" key={p.id}>
          <span className="dw-preset-glyph"><PresetGlyph id={p.icon} size={16} /></span>
          <div className="dw-routine-info">
            <div className="dw-routine-title">{p.name} {p.builtin && <span className="dw-routine-meta">built-in</span>}</div>
            <div className="dw-routine-prompt-preview">{p.command || 'plain shell'}</div>
          </div>
          <div className="dw-routine-actions">
            {!p.builtin && <button className="dw-btn-small" onClick={() => setEditingId(p.id)}>Edit</button>}
            <button className="dw-btn-small" onClick={() => void window.dw.createPreset({ name: p.name + ' copy', icon: p.icon, command: p.command }).then(refresh)}>Duplicate</button>
            <button
              className="dw-btn-small dw-btn-danger"
              disabled={items.length <= 1}
              title={items.length <= 1 ? 'At least one preset must remain' : undefined}
              onClick={() => void window.dw.deletePreset(p.id).then(refresh)}
            >
              Delete
            </button>
          </div>
        </div>
      )
    ))}</div>
  </div>;
}

function PresetEditor({ preset, onSave, onCancel }: {
  preset: PresetItem;
  onSave: (next: { name: string; icon: string; command: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(preset.name);
  const [icon, setIcon] = useState(preset.icon);
  const [command, setCommand] = useState(preset.command);
  return (
    <div className="dw-routine-card dw-preset-editing">
      <div className="dw-routine-form" style={{ margin: 0, width: '100%' }}>
        <IconPicker value={icon} onChange={setIcon} />
        <div className="dw-routine-row">
          <input placeholder="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          <input placeholder="Command" value={command} onChange={(e) => setCommand(e.target.value)} />
        </div>
        <div className="dw-routine-actions">
          <button className="dw-btn-primary" onClick={() => onSave({ name, icon, command })}>Save</button>
          <button className="dw-btn-small" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function RolesSection() {
  const [items, setItems] = useState<Array<{ id: string; name: string; instructions: string }>>([]);
  const [name, setName] = useState(''); const [instructions, setInstructions] = useState('');
  const refresh = () => void window.dw.listRoles().then((roles) => { setItems(roles); window.dispatchEvent(new Event('dw:roles-changed')); });
  useEffect(() => { refresh(); }, []);
  const add = async () => { if (!name.trim()) return; await window.dw.createRole({ name, instructions }); setName(''); setInstructions(''); refresh(); };
  return <div className="dw-section"><h2 className="dw-section-head">Roles</h2>
    <p className="dw-settings-hint">Reusable Markdown instructions. Assign one in a terminal header.</p>
    <div className="dw-routine-form"><input placeholder="Role name" value={name} onChange={(e) => setName(e.target.value)} /><textarea rows={4} placeholder="Instructions for this role…" value={instructions} onChange={(e) => setInstructions(e.target.value)} /><button className="dw-btn-primary" onClick={() => void add()}>+ Add role</button></div>
    <div className="dw-routine-list">{items.map((r) => <div className="dw-routine-card" key={r.id}><div className="dw-routine-info"><div className="dw-routine-title">{r.name}</div><div className="dw-routine-prompt-preview">{r.instructions || 'No instructions yet.'}</div></div><div className="dw-routine-actions"><button className="dw-btn-small" onClick={() => { const name = window.prompt('Role name', r.name); const instructions = window.prompt('Instructions', r.instructions); if (name !== null && instructions !== null) void window.dw.updateRole(r.id, { name, instructions }).then(refresh); }}>Edit</button><button className="dw-btn-small" onClick={() => void window.dw.createRole({ name: r.name + ' copy', instructions: r.instructions }).then(refresh)}>Duplicate</button><button className="dw-btn-small dw-btn-danger" onClick={() => void window.dw.deleteRole(r.id).then(refresh)}>Delete</button></div></div>)}</div>
  </div>;
}

const DEFAULT_SCHEMA = `{
  "type": "object",
  "required": ["decision"],
  "properties": {
    "decision": { "type": "string" }
  }
}`;

type ContractDraft = {
  name: string; schemaText: string; attempts: number; timeoutSec: number; rejectionPrompt: string; fallbackText: string;
};

function contractToDraft(c: Contract): ContractDraft {
  return {
    name: c.name,
    schemaText: JSON.stringify(c.schema, null, 2),
    attempts: c.maxAttempts,
    timeoutSec: Math.round(c.timeoutMs / 1000),
    rejectionPrompt: c.rejectionPrompt,
    fallbackText: c.fallback === null || c.fallback === undefined ? '' : JSON.stringify(c.fallback, null, 2),
  };
}

export function draftToInput(d: ContractDraft): Omit<Contract, 'id'> {
  const schema = JSON.parse(d.schemaText) as unknown;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Schema must be a JSON object');
  const fallback = d.fallbackText.trim() ? (JSON.parse(d.fallbackText) as unknown) : null;
  return {
    name: d.name.trim() || 'contract',
    schema: schema as Record<string, unknown>,
    maxAttempts: Math.max(1, Math.floor(d.attempts) || 1),
    timeoutMs: Math.max(1, Math.floor(d.timeoutSec) || 1) * 1000,
    rejectionPrompt: d.rejectionPrompt.trim(),
    fallback,
  };
}

function schemaSummary(schema: Record<string, unknown>): string {
  const req = schema.required;
  if (Array.isArray(req) && req.length) return `requires ${req.join(', ')}`;
  return typeof schema.type === 'string' ? schema.type : 'json';
}

function ContractForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: ContractDraft;
  submitLabel: string;
  onSubmit: (input: Omit<Contract, 'id'>) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [schemaText, setSchemaText] = useState(initial?.schemaText ?? DEFAULT_SCHEMA);
  const [attempts, setAttempts] = useState(initial?.attempts ?? 3);
  const [timeoutSec, setTimeoutSec] = useState(initial?.timeoutSec ?? 180);
  const [rejectionPrompt, setRejectionPrompt] = useState(initial?.rejectionPrompt ?? '');
  const [fallbackText, setFallbackText] = useState(initial?.fallbackText ?? '');
  const [error, setError] = useState('');
  const submit = () => {
    try {
      const input = draftToInput({ name, schemaText, attempts, timeoutSec, rejectionPrompt, fallbackText });
      setError('');
      onSubmit(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };
  return (
    <div className="dw-routine-form" style={{ width: '100%' }}>
      <input placeholder="Contract name" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="dw-contract-label">JSON Schema the peer's answer must match</label>
      <SchemaEditor value={schemaText} onChange={setSchemaText} />
      <div className="dw-routine-row">
        <label className="dw-routine-every">Attempts<input type="number" min={1} value={attempts} onChange={(e) => setAttempts(Number(e.target.value))} /></label>
        <label className="dw-routine-every">Timeout<input type="number" min={1} value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))} />s</label>
      </div>
      <label className="dw-contract-label">Rejection prompt — re-sent to the peer after a failed attempt</label>
      <textarea rows={2} placeholder="Please return valid JSON matching the schema." value={rejectionPrompt} onChange={(e) => setRejectionPrompt(e.target.value)} />
      <label className="dw-contract-label">Fallback value (JSON) — returned to the asker when attempts run out</label>
      <textarea className="dw-mono" rows={2} placeholder="null" value={fallbackText} onChange={(e) => setFallbackText(e.target.value)} />
      {error && <div className="dw-floor-error">{error}</div>}
      <div className="dw-routine-actions">
        <button className="dw-btn-primary" onClick={submit}>{submitLabel}</button>
        {onCancel && <button className="dw-btn-small" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

function ContractsSection() {
  const [items, setItems] = useState<Contract[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = () => void window.dw.listContracts().then(setItems);
  useEffect(() => { refresh(); }, []);
  return <div className="dw-section"><h2 className="dw-section-head">Contracts</h2>
    <p className="dw-settings-hint">A JSON Schema an <code>ask --contract</code> answer must validate against. The broker re-asks the peer up to the attempt budget; when they run out, the asker receives the fallback value.</p>
    <ContractForm
      key={`create-${nonce}`}
      submitLabel="+ Add contract"
      onSubmit={(input) => void window.dw.createContract(input).then(() => { setNonce((n) => n + 1); refresh(); })}
    />
    <div className="dw-routine-list">
      {items.length === 0 && <div className="dw-routine-empty">No contracts yet.</div>}
      {items.map((c) => editingId === c.id ? (
        <div className="dw-routine-card dw-preset-editing" key={c.id}>
          <ContractForm
            initial={contractToDraft(c)}
            submitLabel="Save"
            onCancel={() => setEditingId(null)}
            onSubmit={(input) => void window.dw.updateContract(c.id, input).then(() => { setEditingId(null); refresh(); })}
          />
        </div>
      ) : (
        <div className="dw-routine-card" key={c.id}>
          <div className="dw-routine-info">
            <div className="dw-routine-title">{c.name}</div>
            <div className="dw-routine-prompt-preview">{c.maxAttempts} attempt{c.maxAttempts === 1 ? '' : 's'} · {Math.round(c.timeoutMs / 1000)}s timeout · {schemaSummary(c.schema)}</div>
          </div>
          <div className="dw-routine-actions">
            <button className="dw-btn-small" onClick={() => setEditingId(c.id)}>Edit</button>
            <button className="dw-btn-small" onClick={() => void window.dw.createContract({ ...c, name: c.name + ' copy' }).then(refresh)}>Duplicate</button>
            <button className="dw-btn-small dw-btn-danger" onClick={() => void window.dw.deleteContract(c.id).then(refresh)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
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
      <div className="dw-section-head-row">
        <h2 className="dw-section-head">Workspaces</h2>
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
      <h2 className="dw-section-head">Routines</h2>
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
            Every
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
              {r.lastError && (
                <div className="dw-routine-err">
                  <WarningIcon size={12} /> {r.lastError}
                </div>
              )}
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
      <h2 className="dw-section-head">Theme</h2>
      <p className="dw-settings-hint">
        One theme colors everything — the terminals and the whole interface
        (background, sidebar, menus, notes, leashes, buttons and icons).
      </p>
      <span className="dw-active-theme">Active: {activeThemeName}</span>
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

      <h2 className="dw-section-head" style={{ marginTop: 8 }}>Notifications</h2>
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
  const [cwd, setCwd] = useState(ws.cwd);
  const [sync, setSync] = useState(!!ws.syncAgentDocs);

  const save = () => {
    onRename(name.trim() || ws.name, ws.icon, cwd.trim() || ws.cwd);
    setEditing(false);
  };

  return (
    <div className={`dw-ws-card ${active ? 'active' : ''}`}>
      {editing ? (
        <div className="dw-ws-editor">
          <div className="dw-ws-edit">
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
