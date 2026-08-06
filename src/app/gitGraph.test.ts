import { describe, it, expect } from 'vitest';
import type { GitCommit } from '../shared/ipc';
import { computeLanes } from './gitGraph';

// Children come before parents, the order `git log` emits.
const commit = (hash: string, parents: string[]): GitCommit => ({
  hash, parents, refs: [], author: 'a', time: 0, subject: hash,
});

describe('computeLanes', () => {
  it('keeps a linear history in a single lane', () => {
    const rows = computeLanes([commit('c', ['b']), commit('b', ['a']), commit('a', [])]);
    expect(rows.map((r) => r.commit.hash)).toEqual(['c', 'b', 'a']);
    expect(rows.every((r) => r.col === 0)).toBe(true);
    expect(rows.every((r) => r.laneCount === 1)).toBe(true);
  });

  it('branches a merge commit into two lanes', () => {
    const rows = computeLanes([
      commit('m', ['b', 'c']),
      commit('b', ['a']),
      commit('c', ['a']),
      commit('a', []),
    ]);
    const merge = rows[0];
    // The merge fans out to two distinct parent columns.
    expect(new Set(merge.segments.map((s) => s.to)).size).toBeGreaterThanOrEqual(2);
    // Two lanes are live at the widest point.
    expect(Math.max(...rows.map((r) => r.laneCount))).toBe(2);
  });
});
