import { memo, useEffect, useRef, useState } from 'react';
import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type { PresetId } from '../shared/ipc';
import { terminals, type Tier } from './terminalService';
import { getFileDrag } from './dnd';

export interface TerminalNodeData extends Record<string, unknown> {
  name: string;
  preset: PresetId;
  tier: Tier;
  exited: boolean;
  /** Stable across restarts; used for persistence (live PTY id is ephemeral). */
  stableId: string;
  /** Idle/waiting-for-input, per ARCHITECTURE.md §6. */
  attention?: boolean;
  /** Runaway guard in MB; 0/absent = off. */
  memoryLimitMB?: number;
  /** Manager agent (PRODUCT.md §5.4): gets recruit/dismiss/assign verbs. */
  walker?: boolean;
}

export type TerminalFlowNode = Node<TerminalNodeData, 'terminal'>;

const TIER_LABELS: Record<Tier, string> = { 1: 'GL', 2: 'DOM', 3: 'ZZZ' };

function TerminalNodeInner({ id, data, selected }: NodeProps<TerminalFlowNode>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dropOver, setDropOver] = useState(false);
  const { deleteElements, updateNodeData } = useReactFlow();

  const toggleWalker = () => {
    const next = !data.walker;
    updateNodeData(id, { walker: next });
    window.dw.setWalker(id, next);
  };

  // A file dragged from a File Tree node lands here as its path, typed into the
  // terminal (not submitted) so the agent — or the user — can act on it.
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-dogwalker-file')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropOver(true);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const path = getFileDrag(e);
    setDropOver(false);
    if (!path) return;
    e.preventDefault();
    e.stopPropagation();
    // Quote paths with spaces so they arrive as a single shell token.
    const token = /\s/.test(path) ? `"${path}"` : path;
    window.dw.write(id, token + ' ');
  };

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    terminals.attach(id, el);
    terminals.onInput(id, (input) => window.dw.write(id, input));

    let debounce: number | null = null;
    const observer = new ResizeObserver(() => {
      if (debounce !== null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        const dims = terminals.fit(id);
        if (dims) window.dw.resize(id, dims.cols, dims.rows);
      }, 100);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (debounce !== null) window.clearTimeout(debounce);
    };
  }, [id]);

  const close = () => {
    window.dw.kill(id);
    terminals.dispose(id);
    void deleteElements({ nodes: [{ id }] });
  };

  return (
    <div
      className={`dw-node ${selected ? 'dw-node-selected' : ''} ${
        dropOver ? 'dw-drop-over' : ''
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={() => setDropOver(false)}
    >
      <NodeResizer isVisible={selected} minWidth={320} minHeight={200} />
      {/* Leashes are undirected. Four visible source handles (one per side):
          with ConnectionMode.Loose each can both start and receive a drag, so
          you can pull from — and drop onto — any side. The hidden "sink" target
          handle exists only so a derived edge can resolve a target-type handle
          and mount; React Flow won't render an edge otherwise. The leash itself
          is a floating edge (FloatingLeash.tsx), so which handles it names is
          irrelevant to how it looks. */}
      <Handle id="top" type="source" position={Position.Top} className="dw-handle" />
      <Handle id="right" type="source" position={Position.Right} className="dw-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="dw-handle" />
      <Handle id="left" type="source" position={Position.Left} className="dw-handle" />
      <Handle id="sink" type="target" position={Position.Left} className="dw-handle-sink" />
      <div className="dw-drag dw-node-header">
        {data.attention && <span className="dw-attention" title="Needs attention" />}
        <span className="dw-node-name">
          {data.walker && <span className="dw-walker-crown" title="Walker">👑</span>}
          {data.name}
          {data.exited ? ' · exited' : ''}
        </span>
        {data.exited && (
          <button
            className="dw-node-restart nodrag"
            title="Restart this terminal"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('dw:terminal-restart', { detail: { id } }),
              )
            }
          >
            ↻
          </button>
        )}
        <button
          className={`dw-walker-toggle nodrag ${data.walker ? 'on' : ''}`}
          onClick={toggleWalker}
          title={data.walker ? 'Walker (manages a team) — click to unset' : 'Make this a Walker (manager agent)'}
        >
          👑
        </button>
        <span className={`dw-tier dw-tier-${data.tier}`}>
          {TIER_LABELS[data.tier]}
        </span>
        <button className="dw-close nodrag" onClick={close} title="Close terminal">
          ×
        </button>
      </div>
      <div ref={bodyRef} className="dw-term-body nowheel nodrag" />
    </div>
  );
}

export const TerminalNode = memo(TerminalNodeInner);
