import { memo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';

export interface GroupNodeData extends Record<string, unknown> {
  name: string;
  stableId: string;
}

export type GroupFlowNode = Node<GroupNodeData, 'group'>;

interface Props extends NodeProps<GroupFlowNode> {
  onRename?: (id: string, name: string) => void;
  onUngroup?: (id: string) => void;
}

/**
 * A labeled frame binding nodes together (PRODUCT.md §3.3). React Flow parenting
 * does the work: members are children, so dragging the frame moves them all.
 * The body is click-through so members stay interactive; only the header is a
 * drag/selection surface.
 */
function GroupNodeInner({ id, data, selected }: NodeProps<GroupFlowNode>) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.name);

  const commit = () => {
    setEditing(false);
    const next = name.trim() || data.name;
    setName(next);
    window.dispatchEvent(
      new CustomEvent('dw:group-rename', { detail: { id, name: next } }),
    );
  };

  return (
    <div className={`dw-group ${selected ? 'dw-group-selected' : ''}`}>
      <div className="dw-group-header dw-drag">
        {editing ? (
          <input
            className="dw-group-name-input nodrag"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
        ) : (
          <span
            className="dw-group-name"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {name}
          </span>
        )}
        <button
          className="dw-group-ungroup nodrag"
          title="Ungroup (⇧G)"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('dw:group-ungroup', { detail: { id } }),
            )
          }
        >
          ⤢
        </button>
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeInner);
export type { Props as GroupNodeProps };
