import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react';
import { getLeashParams } from './floatingEdge';

/**
 * A leash that anchors to the facing side of each node, computed from geometry
 * rather than a fixed handle (see floatingEdge.ts). Fixes wrong-origin lines and
 * keeps the anchor correct as nodes move.
 */
export function FloatingLeash({ id, source, target, style, selected }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty } = getLeashParams(sourceNode, targetNode);
  const [path] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      className={selected ? 'dw-leash-path selected' : 'dw-leash-path'}
    />
  );
}
