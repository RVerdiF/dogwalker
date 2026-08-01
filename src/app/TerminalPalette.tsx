import { useEffect, useState } from 'react';
import type { AgentPreset, PresetId, Role } from '../shared/ipc';

interface Props {
  onSpawn: (preset: PresetId, roleId?: string) => void;
  onAddNote: () => void;
  onAddFileTree: () => void;
  onAddPortal: () => void;
}

/** End-user presets (stress is dev-only and lives on the DevBar). */
const _PALETTE: Array<{ id: PresetId; label: string; icon: string }> = [
  { id: 'shell', label: 'Shell', icon: '🖥' },
  { id: 'claude', label: 'Claude', icon: '✳' },
  { id: 'codex', label: 'Codex', icon: '◆' },
  { id: 'gemini', label: 'Gemini', icon: '♊' },
];

/**
 * Floating glass palette, top-center: the end-user way to add a terminal. Click
 * a preset to drop a new terminal on the canvas. Per-terminal deletion is the ×
 * on each node's header.
 */
export function TerminalPalette({
  onSpawn,
  onAddNote,
  onAddFileTree,
  onAddPortal,
}: Props) {
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState('');
  useEffect(() => {
    const refresh = () => {
      void window.dw.listPresets().then(setPresets);
      void window.dw.listRoles().then(setRoles);
    };
    refresh();
    window.addEventListener('dw:presets-changed', refresh);
    window.addEventListener('dw:roles-changed', refresh);
    return () => {
      window.removeEventListener('dw:presets-changed', refresh);
      window.removeEventListener('dw:roles-changed', refresh);
    };
  }, []);
  return (
    <div className="dw-palette">
      <span className="dw-palette-plus">＋</span>
      <select
        className="dw-palette-role nodrag"
        value={roleId}
        title="Role for the next terminal"
        onChange={(event) => setRoleId(event.target.value)}
      >
        <option value="">no role</option>
        {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
      </select>
      {presets.map((p) => (
        <button
          key={p.id}
          className="dw-palette-chip"
          title={`New ${p.name} terminal${roleId ? ' with selected role' : ''}`}
          onClick={() => onSpawn(p.id, roleId || undefined)}
        >
          <span className="dw-palette-chip-icon">{p.icon}</span>
          {p.name}
        </button>
      ))}
      <span className="dw-palette-sep" />
      <button
        className="dw-palette-chip"
        title="New note"
        onClick={onAddNote}
      >
        <span className="dw-palette-chip-icon">📝</span>
        Note
      </button>
      <button
        className="dw-palette-chip"
        title="New file tree"
        onClick={onAddFileTree}
      >
        <span className="dw-palette-chip-icon">🗂</span>
        Files
      </button>
      <button
        className="dw-palette-chip"
        title="New portal (embedded browser)"
        onClick={onAddPortal}
      >
        <span className="dw-palette-chip-icon">🌐</span>
        Portal
      </button>
    </div>
  );
}
