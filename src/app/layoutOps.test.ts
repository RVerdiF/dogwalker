import { describe, it, expect } from 'vitest';
import { align, distribute, tidy, type Box } from './layoutOps';

const box = (id: string, x: number, y: number, w = 100, h = 100): Box => ({ id, x, y, w, h });

describe('align', () => {
  it('aligns left edges to the leftmost box', () => {
    const out = align([box('a', 10, 0), box('b', 50, 0)], 'left');
    expect(out.get('a')?.x).toBe(10);
    expect(out.get('b')?.x).toBe(10);
  });

  it('aligns right edges to the rightmost edge', () => {
    const out = align([box('a', 10, 0, 100), box('b', 50, 0, 20)], 'right');
    // Both right edges land on max(110, 70) = 110.
    expect(out.get('a')!.x + 100).toBe(110);
    expect(out.get('b')!.x + 20).toBe(110);
  });

  it('is a no-op for fewer than two boxes', () => {
    expect(align([box('a', 0, 0)], 'left').size).toBe(0);
  });
});

describe('distribute', () => {
  it('spreads inner boxes to even gaps, endpoints fixed', () => {
    const out = distribute([box('a', 0, 0, 10), box('b', 50, 0, 10), box('c', 200, 0, 10)], 'horizontal');
    expect(out.has('a')).toBe(false);
    expect(out.has('c')).toBe(false);
    expect(out.get('b')?.x).toBe(100);
  });

  it('is a no-op for fewer than three boxes', () => {
    expect(distribute([box('a', 0, 0), box('b', 10, 0)], 'horizontal').size).toBe(0);
  });
});

describe('tidy', () => {
  it('lays a selection into a grid anchored at its top-left', () => {
    const out = tidy([box('a', 100, 100), box('b', 300, 100), box('c', 100, 300), box('d', 300, 300)], 40);
    // cols = ceil(sqrt(4)) = 2, colW/rowH = 100 + 40.
    expect(out.get('a')).toEqual({ x: 100, y: 100 });
    expect(out.get('b')).toEqual({ x: 240, y: 100 });
    expect(out.get('c')).toEqual({ x: 100, y: 240 });
    expect(out.get('d')).toEqual({ x: 240, y: 240 });
  });
});
