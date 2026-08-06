import { describe, it, expect } from 'vitest';
import { snapMove, type SnapBox } from './snapping';

const box = (x: number, y: number, w = 100, h = 100): SnapBox => ({ x, y, w, h });

describe('snapMove', () => {
  it('leaves a box put when nothing is near', () => {
    const res = snapMove(box(0, 0), [box(500, 500)]);
    expect(res).toMatchObject({ x: 0, y: 0 });
    expect(res.guides).toHaveLength(0);
  });

  it('snaps a left edge to a neighbour within the threshold and emits a guide', () => {
    // moving.x = 205 is 5px from the other box's left edge at 200 (threshold 8).
    const res = snapMove(box(205, 0), [box(200, 400)]);
    expect(res.x).toBe(200);
    expect(res.guides.some((g) => g.axis === 'x' && g.at === 200)).toBe(true);
  });

  it('does not snap when the nearest edge is beyond the threshold', () => {
    const res = snapMove(box(220, 0), [box(200, 400)], 8);
    expect(res.x).toBe(220);
  });
});
