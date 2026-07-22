interface Props {
  onSpawn15: () => void;
  onKillAll: () => void;
}

/**
 * Dev-only bulk controls (import.meta.env.DEV): spawn a load of terminals at
 * once and clear them. End-user terminal creation lives in the TerminalPalette;
 * per-terminal deletion is the × on each node.
 */
export function DevBar({ onSpawn15, onKillAll }: Props) {
  return (
    <div className="dw-devbar">
      <span className="dw-devbar-tag">DEV</span>
      <button onClick={onSpawn15}>Spawn 15</button>
      <button onClick={onKillAll}>Kill all</button>
    </div>
  );
}
