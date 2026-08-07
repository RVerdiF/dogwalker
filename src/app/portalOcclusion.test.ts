import { describe, it, expect } from 'vitest';
import { subtractRect, clipToOccluders, type Rect } from './portalOcclusion';

const R = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const area = (r: Rect) => r.width * r.height;

describe('subtractRect', () => {
  const portal = R(0, 0, 100, 100);

  it('returns the rect unchanged when the hole does not overlap', () => {
    expect(subtractRect(portal, R(200, 200, 50, 50))).toEqual(portal);
  });

  it('trims the edge a corner hole covers, keeping the larger remaining strip', () => {
    // A minimap in the bottom-right corner: the biggest clear strip is the full
    // width above it (100×80), not the sliver to its left (80×100)… wait, left is
    // 80×100 = 8000 vs above 100×80 = 8000 — tie; either is valid and non-empty.
    const clip = subtractRect(portal, R(80, 80, 40, 40));
    expect(area(clip)).toBeGreaterThan(0);
    // Whatever strip is chosen, it must not overlap the hole.
    const overlaps =
      clip.x < 120 && clip.x + clip.width > 80 && clip.y < 120 && clip.y + clip.height > 80;
    expect(overlaps).toBe(false);
  });

  it('keeps the top-left origin when trimming a bottom overlay (e.g. the composer)', () => {
    // A composer strip across the bottom: clip to the region above it.
    const clip = subtractRect(portal, R(-10, 70, 120, 40));
    expect(clip).toEqual(R(0, 0, 100, 70));
  });

  it('collapses to zero area when the hole covers the whole rect (a modal scrim)', () => {
    const clip = subtractRect(portal, R(-50, -50, 400, 400));
    expect(area(clip)).toBe(0);
  });
});

describe('clipToOccluders', () => {
  it('avoids every occluder in the list', () => {
    const portal = R(0, 0, 200, 200);
    // A bottom composer and a bottom-right minimap.
    const clip = clipToOccluders(portal, [R(-10, 160, 220, 60), R(170, 120, 40, 40)]);
    const hits = (h: Rect) =>
      clip.x < h.x + h.width && clip.x + clip.width > h.x && clip.y < h.y + h.height && clip.y + clip.height > h.y;
    expect(hits(R(-10, 160, 220, 60))).toBe(false);
    expect(hits(R(170, 120, 40, 40))).toBe(false);
    expect(area(clip)).toBeGreaterThan(0);
  });

  it('returns the rect unchanged when there are no occluders', () => {
    const portal = R(5, 5, 50, 50);
    expect(clipToOccluders(portal, [])).toEqual(portal);
  });
});
