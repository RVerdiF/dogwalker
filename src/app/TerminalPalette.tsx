import { useEffect, useState } from 'react';
import type { AgentPreset, PresetId, Role } from '../shared/ipc';
import { TerminalIcon, NoteIcon, FilesIcon, PortalIcon, PresetGlyph } from './icons';

interface Props {
  onSpawn: (preset: PresetId, roleId?: string) => void;
  onAddNote: () => void;
  onAddFileTree: () => void;
  onAddPortal: () => void;
}

/**
 * Floating glass palette, top-center: the end-user way to add nodes. Four
 * buttons — Terminal, Note, Files, Portal. "Terminal" opens a modal to pick a
 * preset and an optional role; the others drop their node directly. Per-node
 * deletion is the × on each node's header.
 */
export function TerminalPalette({
  onSpawn,
  onAddNote,
  onAddFileTree,
  onAddPortal,
}: Props) {
  const [modal, setModal] = useState(false);
  return (
    <>
      <div className="dw-palette">
        <button
          className="dw-palette-chip"
          title="New terminal — pick a preset and role"
          onClick={() => setModal(true)}
        >
          <span className="dw-palette-chip-icon"><TerminalIcon /></span>
          Terminal
        </button>
        <button className="dw-palette-chip" title="New note" onClick={onAddNote}>
          <span className="dw-palette-chip-icon"><NoteIcon /></span>
          Note
        </button>
        <button className="dw-palette-chip" title="New file tree" onClick={onAddFileTree}>
          <span className="dw-palette-chip-icon"><FilesIcon /></span>
          Files
        </button>
        <button
          className="dw-palette-chip"
          title="New portal (embedded browser)"
          onClick={onAddPortal}
        >
          <span className="dw-palette-chip-icon"><PortalIcon /></span>
          Portal
        </button>
      </div>
      {modal && (
        <NewTerminalModal
          onClose={() => setModal(false)}
          onCreate={(preset, roleId) => {
            onSpawn(preset, roleId);
            setModal(false);
          }}
        />
      )}
    </>
  );
}

interface ModalProps {
  onClose: () => void;
  onCreate: (preset: PresetId, roleId?: string) => void;
}

function NewTerminalModal({ onClose, onCreate }: ModalProps) {
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [presetId, setPresetId] = useState<PresetId>('');
  const [roleId, setRoleId] = useState('');

  useEffect(() => {
    const refresh = () => {
      void window.dw.listPresets().then((list) => {
        setPresets(list);
        setPresetId((cur) => cur || list[0]?.id || '');
      });
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dw-floor-dialog-scrim" onClick={onClose}>
      <div className="dw-floor-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>New terminal</h3>
        <div className="dw-floor-field">
          <span>Preset</span>
          <div className="dw-tmodal-presets">
            {presets.map((p) => (
              <button
                key={p.id}
                className={`dw-tmodal-preset${p.id === presetId ? ' active' : ''}`}
                onClick={() => setPresetId(p.id)}
              >
                <span className="dw-tmodal-preset-icon"><PresetGlyph id={p.icon} size={16} /></span>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <label className="dw-floor-field">
          <span>Role</span>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">No role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <div className="dw-floor-actions">
          <button
            className="dw-btn-primary"
            disabled={!presetId}
            onClick={() => onCreate(presetId, roleId || undefined)}
          >
            Create terminal
          </button>
          <button className="dw-btn-small" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
