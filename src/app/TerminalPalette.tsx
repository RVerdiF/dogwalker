import type { PresetId } from '../shared/ipc';

interface Props {
  onSpawn: (preset: PresetId) => void;
  onAddNote: () => void;
}

/** End-user presets (stress is dev-only and lives on the DevBar). */
const PALETTE: Array<{ id: PresetId; label: string; icon: string }> = [
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
export function TerminalPalette({ onSpawn, onAddNote }: Props) {
  return (
    <div className="dw-palette">
      <span className="dw-palette-plus">＋</span>
      {PALETTE.map((p) => (
        <button
          key={p.id}
          className="dw-palette-chip"
          title={`New ${p.label} terminal`}
          onClick={() => onSpawn(p.id)}
        >
          <span className="dw-palette-chip-icon">{p.icon}</span>
          {p.label}
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
    </div>
  );
}
