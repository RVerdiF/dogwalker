import { useEffect, useState } from 'react';
import type { GitCommit } from '../shared/ipc';
import { computeLanes, type GraphRow } from './gitGraph';

const LANE_W = 14;
const ROW_H = 26;
const DOT_R = 4;
const LANE_COLORS = [
  '#8ab4ff',
  '#ff8db4',
  '#7ee0a8',
  '#e0c26a',
  '#c99bff',
  '#6ad0d0',
  '#ff9e6a',
];

function color(i: number): string {
  return LANE_COLORS[i % LANE_COLORS.length];
}

/** Commit history with branch lanes (PRODUCT.md §8), laid out by computeLanes. */
export function GitGraphView({ cwd }: { cwd: string }) {
  const [rows, setRows] = useState<GraphRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.dw.gitLog(cwd, 300).then((log: GitCommit[]) => {
      if (!cancelled) setRows(computeLanes(log));
    });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  if (rows.length === 0) {
    return <div className="dw-ft-empty">No commits.</div>;
  }

  const maxLanes = Math.max(...rows.map((r) => r.laneCount), 1);
  const graphW = maxLanes * LANE_W + LANE_W;

  return (
    <div className="dw-git-graph">
      {rows.map((row) => (
        <div className="dw-git-graph-row" key={row.commit.hash} style={{ height: ROW_H }}>
          <svg width={graphW} height={ROW_H} className="dw-git-graph-svg">
            {row.segments.map((s, si) => {
              const x1 = s.from * LANE_W + LANE_W;
              const x2 = s.to * LANE_W + LANE_W;
              return (
                <path
                  key={si}
                  d={`M ${x1} 0 C ${x1} ${ROW_H / 2}, ${x2} ${ROW_H / 2}, ${x2} ${ROW_H}`}
                  stroke={color(s.color)}
                  strokeWidth={1.5}
                  fill="none"
                />
              );
            })}
            <circle
              cx={row.col * LANE_W + LANE_W}
              cy={ROW_H / 2}
              r={DOT_R}
              fill={color(row.color)}
              stroke="#0e1013"
              strokeWidth={1}
            />
          </svg>
          <div className="dw-git-graph-msg">
            {row.commit.refs.map((r) => (
              <span key={r} className="dw-git-ref">
                {r.replace(/^HEAD -> /, '')}
              </span>
            ))}
            <span className="dw-git-subject" title={row.commit.subject}>
              {row.commit.subject}
            </span>
            <span className="dw-git-author">{row.commit.author}</span>
            <span className="dw-git-hash">{row.commit.hash.slice(0, 7)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
