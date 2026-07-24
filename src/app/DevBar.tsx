interface Props {
  onSpawn15: () => void;
  onKillAll: () => void;
  hudOn: boolean;
  onToggleHud: () => void;
}

/**
 * Dev-only bulk controls (import.meta.env.DEV): spawn a load of terminals at
 * once, clear them, and toggle the perf HUD. End-user terminal creation lives
 * in the TerminalPalette; per-terminal deletion is the × on each node.
 */
export function DevBar({ onSpawn15, onKillAll, hudOn, onToggleHud }: Props) {
  return (
    <div className="dw-devbar">
      <span className="dw-devbar-tag">DEV</span>
      <button onClick={onSpawn15}>Spawn 15</button>
      <button onClick={onKillAll}>Kill all</button>
      <button
        className={hudOn ? 'dw-devbar-on' : ''}
        onClick={onToggleHud}
        title="Toggle the performance HUD"
      >
        Perf
      </button>
    </div>
  );
}
