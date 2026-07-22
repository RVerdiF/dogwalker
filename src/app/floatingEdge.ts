import type { InternalNode, Node } from '@xyflow/react';

interface Point {
  x: number;
  y: number;
}

/**
 * Where the line between two node centers crosses `node`'s border. Adapted from
 * React Flow's floating-edges example. Lets a leash anchor to the side of each
 * node that faces the other, instead of a fixed handle — so the origin is
 * always correct regardless of which handle started the drag, and it tracks the
 * nodes as they move.
 */
function nodeIntersection(node: InternalNode<Node>, other: InternalNode<Node>): Point {
  const w = (node.measured.width ?? 0) / 2;
  const h = (node.measured.height ?? 0) / 2;
  const cx = node.internals.positionAbsolute.x + w;
  const cy = node.internals.positionAbsolute.y + h;
  const ox = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2;
  const oy = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2;

  if (w === 0 || h === 0) return { x: cx, y: cy };

  const xx = (ox - cx) / (2 * w) - (oy - cy) / (2 * h);
  const yy = (ox - cx) / (2 * w) + (oy - cy) / (2 * h);
  const a = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  const bx = a * xx;
  const by = a * yy;
  return { x: w * (bx + by) + cx, y: h * (-bx + by) + cy };
}

export function getLeashParams(
  source: InternalNode<Node>,
  target: InternalNode<Node>,
): { sx: number; sy: number; tx: number; ty: number } {
  const s = nodeIntersection(source, target);
  const t = nodeIntersection(target, source);
  return { sx: s.x, sy: s.y, tx: t.x, ty: t.y };
}
