/**
 * Magnetic snapping (PRODUCT.md §3.3): while a node is dragged, snap its edges
 * and centers to nearby neighbour edges/centers. Pure geometry over boxes so it
 * is testable in isolation; the renderer feeds it absolute positions and draws
 * the returned guides.
 */
export interface SnapBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A guide line to render: vertical (fixed x) or horizontal (fixed y). */
export interface Guide {
  axis: 'x' | 'y';
  /** World coordinate of the line. */
  at: number;
  /** Span to cover both boxes, for a tidy segment. */
  from: number;
  to: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

const DEFAULT_THRESHOLD = 8;

/** Candidate lines along one axis: near edge, center, far edge. */
function linesX(b: SnapBox): number[] {
  return [b.x, b.x + b.w / 2, b.x + b.w];
}
function linesY(b: SnapBox): number[] {
  return [b.y, b.y + b.h / 2, b.y + b.h];
}

export function snapMove(
  moving: SnapBox,
  others: SnapBox[],
  threshold = DEFAULT_THRESHOLD,
): SnapResult {
  const guides: Guide[] = [];
  let dx = 0;
  let dy = 0;
  let bestX = threshold + 1;
  let bestY = threshold + 1;

  const mx = linesX(moving);
  const my = linesY(moving);

  for (const o of others) {
    for (const ox of linesX(o)) {
      for (const mLine of mx) {
        const diff = ox - mLine;
        if (Math.abs(diff) < Math.abs(bestX)) {
          bestX = diff;
        }
      }
    }
    for (const oy of linesY(o)) {
      for (const mLine of my) {
        const diff = oy - mLine;
        if (Math.abs(diff) < Math.abs(bestY)) {
          bestY = diff;
        }
      }
    }
  }

  if (Math.abs(bestX) <= threshold) dx = bestX;
  if (Math.abs(bestY) <= threshold) dy = bestY;

  const snapped: SnapBox = { ...moving, x: moving.x + dx, y: moving.y + dy };

  // Build guides for every neighbour line the snapped box now coincides with.
  for (const o of others) {
    for (const ox of linesX(o)) {
      if (linesX(snapped).some((l) => Math.abs(l - ox) < 0.5)) {
        guides.push({
          axis: 'x',
          at: ox,
          from: Math.min(snapped.y, o.y),
          to: Math.max(snapped.y + snapped.h, o.y + o.h),
        });
      }
    }
    for (const oy of linesY(o)) {
      if (linesY(snapped).some((l) => Math.abs(l - oy) < 0.5)) {
        guides.push({
          axis: 'y',
          at: oy,
          from: Math.min(snapped.x, o.x),
          to: Math.max(snapped.x + snapped.w, o.x + o.w),
        });
      }
    }
  }

  return { x: snapped.x, y: snapped.y, guides };
}
