import { useEffect, useState } from 'react';
import type { FloorMeta } from '../shared/ipc';

interface Props {
  workspaceId: string;
  floors: FloorMeta[];
  activeFloor: string;
  onSwitch: (floorId: string) => void;
  /** Re-fetch floors after a create/delete. */
  onChanged: () => void;
}

/**
 * The floor rail (PRODUCT.md §10): switch between the ground layer and each
 * git-worktree floor, create new ones (new or existing branch, optionally
 * cloning the ground arrangement), and delete them. Land lives here in block 2.
 */
export function FloorBar({ workspaceId, floors, activeFloor, onSwitch, onChanged }: Props) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="dw-floorbar">
      <span className="dw-floorbar-label">Floors</span>
      <button
        className={`dw-floor-chip ${activeFloor === 'ground' ? 'active' : ''}`}
        onClick={() => onSwitch('ground')}
        title="The ground floor — the workspace's main working copy"
      >
        🏛 Ground
      </button>
      {floors.map((f) => (
        <span key={f.id} className={`dw-floor-chip-wrap ${activeFloor === f.id ? 'active' : ''}`}>
          <button
            className={`dw-floor-chip ${activeFloor === f.id ? 'active' : ''}`}
            onClick={() => onSwitch(f.id)}
            title={`${f.path}  ·  branch ${f.branch}`}
          >
            🧱 {f.name}
            <span className="dw-floor-branch">{f.branch}</span>
          </button>
          <button
            className="dw-floor-x"
            title="Delete this floor (removes its worktree)"
            onClick={() => {
              if (!window.confirm(`Delete floor "${f.name}"? Its worktree is removed.`)) return;
              void window.dw.removeFloor(workspaceId, f.id, false).then(() => {
                if (activeFloor === f.id) onSwitch('ground');
                onChanged();
              });
            }}
          >
            ×
          </button>
        </span>
      ))}
      <button className="dw-floor-add" title="New floor" onClick={() => setCreating(true)}>
        ＋
      </button>
      {creating && (
        <FloorCreate
          workspaceId={workspaceId}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onChanged();
            onSwitch(id);
          }}
        />
      )}
    </div>
  );
}

function FloorCreate({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (floorId: string) => void;
}) {
  const [name, setName] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [branch, setBranch] = useState('');
  const [cloneGround, setCloneGround] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void window.dw.repoBranches(workspaceId).then((bs) => {
      setBranches(bs);
      if (bs[0]) setBranch(bs[0]);
    });
  }, [workspaceId]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Name the floor.');
    const targetBranch = mode === 'new' ? branch.trim() || trimmed : branch;
    if (!targetBranch) return setError('Pick or name a branch.');
    setBusy(true);
    const res = await window.dw.createFloor(workspaceId, {
      name: trimmed,
      branch: targetBranch,
      createBranch: mode === 'new',
      cloneGround,
    });
    setBusy(false);
    if (!res.ok || !res.floor) return setError(res.error || 'Could not create the floor.');
    onCreated(res.floor.id);
  };

  return (
    <div className="dw-floor-dialog-scrim" onClick={onClose}>
      <div className="dw-floor-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>New floor</h3>
        <label className="dw-floor-field">
          <span>Name</span>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="dw-floor-field">
          <span>Branch</span>
          <div className="dw-floor-branch-row">
            <label>
              <input
                type="radio"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
              />
              New branch
            </label>
            <label>
              <input
                type="radio"
                checked={mode === 'existing'}
                onChange={() => setMode('existing')}
              />
              Existing
            </label>
          </div>
          {mode === 'new' ? (
            <input
              placeholder="new branch name (defaults to the floor name)"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          ) : (
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="dw-floor-toggle">
          <input
            type="checkbox"
            checked={cloneGround}
            onChange={(e) => setCloneGround(e.target.checked)}
          />
          Clone the ground layout (arrangement only)
        </label>
        {error && <div className="dw-floor-error">{error}</div>}
        <div className="dw-floor-actions">
          <button className="dw-btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create floor'}
          </button>
          <button className="dw-btn-small" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
