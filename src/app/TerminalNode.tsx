import { memo, useEffect, useRef } from 'react';
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

export interface TerminalNodeData extends Record<string, unknown> {
  name: string;
  preset: PresetId;
  tier: Tier;
  exited: boolean;
  /** Stable across restarts; used for persistence (live PTY id is ephemeral). */
  stableId: string;
}

export type TerminalFlowNode = Node<TerminalNodeData, 'terminal'>;

const TIER_LABELS: Record<Tier, string> = { 1: 'GL', 2: 'DOM', 3: 'ZZZ' };

function TerminalNodeInner({ id, data, selected }: NodeProps<TerminalFlowNode>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { deleteElements } = useReactFlow();

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
    <div className={`dw-node ${selected ? 'dw-node-selected' : ''}`}>
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
        <span className="dw-node-name">
          {data.name}
          {data.exited ? ' · exited' : ''}
        </span>
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
