/**
 * Selection layout operations (PRODUCT.md §3.3): align, distribute, tidy.
 * Pure geometry over {id, x, y, w, h} boxes so it is trivially testable and
 * independent of React Flow's node shape.
 */
export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeKind = 'horizontal' | 'vertical';

/** Returns the new {x,y} for each box, keyed by id. */
export type Placement = Map<string, { x: number; y: number }>;

export function align(boxes: Box[], kind: AlignKind): Placement {
  const out: Placement = new Map();
  if (boxes.length < 2) return out;

  switch (kind) {
    case 'left': {
      const v = Math.min(...boxes.map((b) => b.x));
      for (const b of boxes) out.set(b.id, { x: v, y: b.y });
      break;
    }
    case 'right': {
      const v = Math.max(...boxes.map((b) => b.x + b.w));
      for (const b of boxes) out.set(b.id, { x: v - b.w, y: b.y });
      break;
    }
    case 'hcenter': {
      const v =
        boxes.reduce((s, b) => s + b.x + b.w / 2, 0) / boxes.length;
      for (const b of boxes) out.set(b.id, { x: v - b.w / 2, y: b.y });
      break;
    }
    case 'top': {
      const v = Math.min(...boxes.map((b) => b.y));
      for (const b of boxes) out.set(b.id, { x: b.x, y: v });
      break;
    }
    case 'bottom': {
      const v = Math.max(...boxes.map((b) => b.y + b.h));
      for (const b of boxes) out.set(b.id, { x: b.x, y: v - b.h });
      break;
    }
    case 'vcenter': {
      const v =
        boxes.reduce((s, b) => s + b.y + b.h / 2, 0) / boxes.length;
      for (const b of boxes) out.set(b.id, { x: b.x, y: v - b.h / 2 });
      break;
    }
  }
  return out;
}

/**
 * Even gaps between the outermost boxes: the first and last stay put, the rest
 * are spread so the empty space between neighbours is equal.
 */
export function distribute(boxes: Box[], kind: DistributeKind): Placement {
  const out: Placement = new Map();
  if (boxes.length < 3) return out;

  const horizontal = kind === 'horizontal';
  const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = horizontal ? first.x + first.w : first.y + first.h;
  const end = horizontal ? last.x : last.y;
  const inner = sorted.slice(1, -1);
  const totalInner = inner.reduce((s, b) => s + (horizontal ? b.w : b.h), 0);
  const gap = (end - start - totalInner) / (inner.length + 1);

  let cursor = start + gap;
  for (const b of inner) {
    out.set(b.id, horizontal ? { x: cursor, y: b.y } : { x: b.x, y: cursor });
    cursor += (horizontal ? b.w : b.h) + gap;
  }
  return out;
}

/**
 * Arrange the selection into an aligned grid, preserving reading order
 * (top-to-bottom, left-to-right) and anchored at the selection's top-left.
 */
export function tidy(boxes: Box[], gap = 40): Placement {
  const out: Placement = new Map();
  if (boxes.length < 2) return out;

  const originX = Math.min(...boxes.map((b) => b.x));
  const originY = Math.min(...boxes.map((b) => b.y));
  const colW = Math.max(...boxes.map((b) => b.w)) + gap;
  const rowH = Math.max(...boxes.map((b) => b.h)) + gap;
  const cols = Math.max(1, Math.ceil(Math.sqrt(boxes.length)));

  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  sorted.forEach((b, i) => {
    out.set(b.id, {
      x: originX + (i % cols) * colW,
      y: originY + Math.floor(i / cols) * rowH,
    });
  });
  return out;
}
