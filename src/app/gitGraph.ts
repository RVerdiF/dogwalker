/**
 * Pure lane layout for the git graph view (PRODUCT.md §8). Given commits in the
 * order `git log` emits them (children before parents), assign each a column and
 * the line segments crossing its row, so the renderer can draw branch lanes
 * without re-deriving topology. Side-effect-free and DOM-free for testability.
 */
import type { GitCommit } from '../shared/ipc';

/** A line crossing a row, from a top-edge column to a bottom-edge column. */
export interface Segment {
  from: number;
  to: number;
  color: number;
}

export interface GraphRow {
  commit: GitCommit;
  col: number;
  color: number;
  segments: Segment[];
  /** Lane count at this row — the renderer sizes columns from the max. */
  laneCount: number;
}

function firstFree(lanes: (string | null)[]): number {
  const i = lanes.indexOf(null);
  return i === -1 ? lanes.length : i;
}

export function computeLanes(commits: GitCommit[]): GraphRow[] {
  const rows: GraphRow[] = [];
  let lanes: (string | null)[] = [];

  for (const commit of commits) {
    const top = lanes.slice();

    // The commit's column: an existing lane already waiting for it, else a new
    // one. Multiple children can point here — all such lanes converge to `col`.
    let col = lanes.indexOf(commit.hash);
    if (col === -1) col = firstFree(lanes);
    const color = col;

    // Bottom lanes: free every lane that was waiting for this commit, then lay
    // down its parents (first parent keeps the column; extra parents branch).
    const bottom: (string | null)[] = top.map((h) =>
      h === commit.hash ? null : h,
    );
    while (bottom.length <= col) bottom.push(null);

    const parentCols = new Map<string, number>();
    if (commit.parents.length > 0) {
      bottom[col] = commit.parents[0];
      parentCols.set(commit.parents[0], col);
      for (let p = 1; p < commit.parents.length; p++) {
        const hash = commit.parents[p];
        let pc = bottom.indexOf(hash);
        if (pc === -1) pc = firstFree(bottom);
        while (bottom.length <= pc) bottom.push(null);
        bottom[pc] = hash;
        parentCols.set(hash, pc);
      }
    } else {
      bottom[col] = null;
    }

    // Segments: continue each top lane to where its hash lives below (or into
    // the commit when it was waiting for it), plus branch-outs from the commit.
    const segments: Segment[] = [];
    top.forEach((h, i) => {
      if (h == null) return;
      if (h === commit.hash) {
        segments.push({ from: i, to: col, color: i });
      } else {
        const j = bottom.indexOf(h);
        if (j !== -1) segments.push({ from: i, to: j, color: i });
      }
    });
    for (const [, pc] of parentCols) {
      segments.push({ from: col, to: pc, color: pc });
    }

    // Trim trailing empty lanes so the graph doesn't widen forever.
    while (bottom.length > 0 && bottom[bottom.length - 1] == null) bottom.pop();
    lanes = bottom;

    const laneCount = Math.max(top.length, bottom.length, col + 1);
    rows.push({ commit, col, color, segments, laneCount });
  }

  return rows;
}
