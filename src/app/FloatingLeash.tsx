import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { getLeashParams } from './floatingEdge';

/**
 * A leash that anchors to the facing side of each node, computed from geometry
 * rather than a fixed handle (see floatingEdge.ts). Fixes wrong-origin lines and
 * keeps the anchor correct as nodes move. A delete control sits at the midpoint
 * — visible on hover or when the leash is selected — so a connection can be
 * removed directly on the canvas; deleting routes through onEdgesDelete, which
 * disconnects the pair in the broker.
 */
export function FloatingLeash({ id, source, target, style, selected }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { deleteElements } = useReactFlow();
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty } = getLeashParams(sourceNode, targetNode);
  const [path, labelX, labelY] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        className={selected ? 'dw-leash-path selected' : 'dw-leash-path'}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`dw-leash-delete nodrag nopan${selected ? ' visible' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title="Remove connection"
          aria-label="Remove connection"
          onClick={(e) => {
            e.stopPropagation();
            void deleteElements({ edges: [{ id }] });
          }}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
