import { memo, useEffect, useRef, useState } from 'react';
import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  useStore,
  type Node,
  type NodeProps,
} from '@xyflow/react';

export interface PortalNodeData extends Record<string, unknown> {
  name: string;
  stableId: string;
  url: string;
  partition: string;
}

export type PortalFlowNode = Node<PortalNodeData, 'portal'>;

/**
 * A portal (PRODUCT.md §9): the visible chrome (URL bar + nav) is normal React,
 * but the page itself is a native `WebContentsView` overlaid by main. This node
 * owns geometry — it reports its body's on-screen rect (and the canvas zoom) to
 * main whenever the view pans, zooms, moves or resizes, so the browser stays
 * glued to the node. The browser lives past nothing here: mount creates it,
 * unmount destroys it (the persistent session partition keeps logins).
 */
function PortalNodeInner({ id, data, selected }: NodeProps<PortalFlowNode>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [addr, setAddr] = useState(data.url);
  const [title, setTitle] = useState('');
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false });
  const { deleteElements } = useReactFlow();
  // Re-render on pan/zoom so the sync effect re-measures.
  const transform = useStore((s) => s.transform);

  // Create the browser on mount; destroy it on unmount.
  useEffect(() => {
    window.dw.portalCreate(data.stableId, data.partition, data.url);
    const off = window.dw.onPortalNav((e) => {
      if (e.id !== data.stableId) return;
      setAddr(e.url && e.url !== 'about:blank' ? e.url : '');
      setTitle(e.title);
      setNav({ canGoBack: e.canGoBack, canGoForward: e.canGoForward });
    });
    return () => {
      off();
      window.dw.portalDestroy(data.stableId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.stableId]);

  // Keep the native view aligned with the body rect; zoom scales its content.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      window.dw.portalSetBounds(
        data.stableId,
        { x: r.left, y: r.top, width: r.width, height: r.height },
        transform[2],
        true,
      );
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data.stableId, transform]);

  const go = (url: string) => {
    const u = url.trim();
    if (u) window.dw.portalNavigate(data.stableId, u);
  };
  const close = () => {
    void window.dw.portalUnregister(data.stableId);
    void deleteElements({ nodes: [{ id }] });
  };

  return (
    <div className={`dw-portal ${selected ? 'dw-node-selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={320} minHeight={240} />
      {/* Leash handles: a terminal wired here can drive it via `portal ...`. */}
      <Handle id="top" type="source" position={Position.Top} className="dw-handle" />
      <Handle id="right" type="source" position={Position.Right} className="dw-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="dw-handle" />
      <Handle id="left" type="source" position={Position.Left} className="dw-handle" />
      <Handle id="sink" type="target" position={Position.Left} className="dw-handle-sink" />
      <div className="dw-drag dw-portal-bar">
        <button
          className="dw-portal-btn nodrag"
          title="Back"
          disabled={!nav.canGoBack}
          onClick={() => window.dw.portalBack(data.stableId)}
        >
          ‹
        </button>
        <button
          className="dw-portal-btn nodrag"
          title="Forward"
          disabled={!nav.canGoForward}
          onClick={() => window.dw.portalForward(data.stableId)}
        >
          ›
        </button>
        <button
          className="dw-portal-btn nodrag"
          title="Reload"
          onClick={() => window.dw.portalReload(data.stableId)}
        >
          ⟳
        </button>
        <button
          className="dw-portal-btn nodrag"
          title="New linked portal (shares this session)"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('dw:portal-link', { detail: { stableId: data.stableId } }),
            )
          }
        >
          ⧉
        </button>
        <input
          className="dw-portal-url nodrag"
          value={addr}
          placeholder="Enter a URL…"
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go((e.target as HTMLInputElement).value);
          }}
        />
        <button className="dw-close nodrag" onClick={close} title="Close portal">
          ×
        </button>
      </div>
      <div ref={bodyRef} className="dw-portal-body nowheel nodrag">
        {/* The native WebContentsView is painted here by main. */}
        <div className="dw-portal-placeholder">{title || 'Loading…'}</div>
      </div>
    </div>
  );
}

export const PortalNode = memo(PortalNodeInner);
