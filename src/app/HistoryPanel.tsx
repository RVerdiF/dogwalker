import { useCallback, useEffect, useState } from 'react';
import type { HistoryEntry } from '../shared/ipc';

interface Props {
  pair: { a: string; b: string; aName: string; bName: string } | null;
  onClose: () => void;
}

const KIND_LABEL: Record<HistoryEntry['kind'], string> = {
  ask: 'ask',
  reply: 'reply',
  check: 'check',
};

/**
 * The per-leash message history (PRODUCT.md §5.3): because every ask/reply/check
 * flows through the broker, clicking a leash reconstructs the exact conversation
 * — impossible for screen-scraping designs.
 */
export function HistoryPanel({ pair, onClose }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const refresh = useCallback(() => {
    if (!pair) return;
    void window.dw.history(pair.a, pair.b).then(setEntries);
  }, [pair]);

  useEffect(() => {
    refresh();
    if (!pair) return;
    return window.dw.onHistory((p) => {
      if (
        (p.a === pair.a && p.b === pair.b) ||
        (p.a === pair.b && p.b === pair.a)
      ) {
        refresh();
      }
    });
  }, [pair, refresh]);

  if (!pair) return null;
  const nameOf = (id: string) => (id === pair.a ? pair.aName : pair.bName);

  return (
    <div className="dw-history">
      <div className="dw-history-head">
        <span>
          🐕 {pair.aName} ⟷ {pair.bName}
        </span>
        <button className="dw-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dw-history-body">
        {entries.length === 0 && <div className="dw-history-empty">No messages yet.</div>}
        {entries.map((e, i) => (
          <div key={i} className={`dw-msg dw-msg-${e.kind}`}>
            <div className="dw-msg-meta">
              <span className="dw-msg-kind">{KIND_LABEL[e.kind]}</span>
              {e.broadcastId && <span className="dw-msg-kind" title={`Broadcast ${e.broadcastId}`}>team {e.broadcastId.slice(0, 6)}</span>}
              {nameOf(e.from)} → {nameOf(e.to)}
              <span className="dw-msg-time">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
            </div>
            <div className="dw-msg-body">{e.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
