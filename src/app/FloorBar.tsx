import { useEffect, useState } from 'react';
import type { FloorMeta, HookResult } from '../shared/ipc';
import { GroundIcon, FloorIcon, CheckIcon, CrossIcon } from './icons';

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
  const [landing, setLanding] = useState<FloorMeta | null>(null);
  const [hookOut, setHookOut] = useState<{ title: string; result: HookResult } | null>(null);
  const [running, setRunning] = useState('');

  const runHook = (f: FloorMeta) => {
    setRunning(f.id);
    void window.dw.runFloorHook(workspaceId, f.id).then((result) => {
      setRunning('');
      setHookOut({ title: `Run hook · ${f.name}`, result });
    });
  };

  return (
    <div className="dw-floorbar">
      <span className="dw-floorbar-label">Floors</span>
      <button
        className={`dw-floor-chip ${activeFloor === 'ground' ? 'active' : ''}`}
        onClick={() => onSwitch('ground')}
        title="The ground floor — the workspace's main working copy"
      >
        <GroundIcon size={13} /> Ground
      </button>
      {floors.map((f) => (
        <span key={f.id} className={`dw-floor-chip-wrap ${activeFloor === f.id ? 'active' : ''}`}>
          <button
            className={`dw-floor-chip ${activeFloor === f.id ? 'active' : ''}`}
            onClick={() => onSwitch(f.id)}
            title={`${f.path}  ·  branch ${f.branch}`}
          >
            <FloorIcon size={13} /> {f.name}
            <span className="dw-floor-branch">{f.branch}</span>
          </button>
          <button
            className="dw-floor-run"
            title="Run this project's `run` hook in the floor"
            disabled={running === f.id}
            onClick={() => runHook(f)}
          >
            {running === f.id ? '…' : '▶'}
          </button>
          <button
            className="dw-floor-land"
            title="Land this floor — merge its branch and remove the worktree"
            onClick={() => setLanding(f)}
          >
            ⤒
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
          onCreated={(id, setup) => {
            setCreating(false);
            onChanged();
            onSwitch(id);
            if (setup && setup.ran) setHookOut({ title: 'Setup hook', result: setup });
          }}
        />
      )}
      {hookOut && (
        <div className="dw-floor-dialog-scrim" onClick={() => setHookOut(null)}>
          <div className="dw-floor-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>
              {hookOut.title}{' '}
              <span className={hookOut.result.ok ? 'dw-hook-ok' : 'dw-hook-err'}>
                {hookOut.result.ok ? <CheckIcon size={14} /> : <CrossIcon size={14} />}
              </span>
            </h3>
            <pre className="dw-land-diffstat">
              {hookOut.result.output || '(no output)'}
            </pre>
            <div className="dw-floor-actions">
              <button className="dw-btn-small" onClick={() => setHookOut(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {landing && (
        <LandDialog
          workspaceId={workspaceId}
          floor={landing}
          onClose={() => setLanding(null)}
          onLanded={() => {
            setLanding(null);
            onSwitch('ground');
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function LandDialog({
  workspaceId,
  floor,
  onClose,
  onLanded,
}: {
  workspaceId: string;
  floor: FloorMeta;
  onClose: () => void;
  onLanded: () => void;
}) {
  const [info, setInfo] = useState<{
    floorBranch: string;
    groundBranch: string;
    branches: string[];
    diffStat: string;
    floorClean: boolean;
    groundClean: boolean;
  } | null>(null);
  const [target, setTarget] = useState('');
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void window.dw.landInfo(workspaceId, floor.id).then((i) => {
      setInfo(i);
      setTarget(i.groundBranch);
    });
  }, [workspaceId, floor.id]);

  const land = async () => {
    setBusy(true);
    setError('');
    const res = await window.dw.land(workspaceId, floor.id, {
      targetBranch: target,
      deleteBranch,
    });
    setBusy(false);
    if (res.ok) return onLanded();
    setError(`${res.stage ?? 'failed'}: ${res.error ?? ''}`.trim());
  };

  const blocked = info ? !info.floorClean || !info.groundClean : true;

  return (
    <div className="dw-floor-dialog-scrim" onClick={onClose}>
      <div className="dw-floor-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Land “{floor.name}”</h3>
        {!info ? (
          <div className="dw-floor-field">Checking…</div>
        ) : (
          <>
            <div className="dw-floor-field">
              <span>
                Merge <b>{info.floorBranch}</b> into
              </span>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {info.branches
                  .filter((b) => b !== info.floorBranch)
                  .map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </select>
            </div>
            <div className="dw-floor-field">
              <span>Changes</span>
              <pre className="dw-land-diffstat">
                {info.diffStat || '(no differences from the target)'}
              </pre>
            </div>
            {!info.floorClean && (
              <div className="dw-floor-error">
                The floor has uncommitted changes — commit or discard them first.
              </div>
            )}
            {!info.groundClean && (
              <div className="dw-floor-error">
                The ground has uncommitted changes — commit or discard them first.
              </div>
            )}
            <label className="dw-floor-toggle">
              <input
                type="checkbox"
                checked={deleteBranch}
                onChange={(e) => setDeleteBranch(e.target.checked)}
              />
              Delete branch <code>{info.floorBranch}</code> after landing
            </label>
            {error && <div className="dw-floor-error">{error}</div>}
            <div className="dw-floor-actions">
              <button
                className="dw-btn-primary"
                disabled={busy || blocked}
                onClick={() => void land()}
              >
                {busy ? 'Landing…' : 'Land'}
              </button>
              <button className="dw-btn-small" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
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
  onCreated: (floorId: string, setup?: HookResult) => void;
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
    onCreated(res.floor.id, res.setup);
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
        <p className="dw-floor-hint">
          A branch can be checked out on only one floor at a time. Untracked files
          (deps, <code>.env</code>, build output) don't come along — use a{' '}
          <code>setup</code> hook.
        </p>
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
