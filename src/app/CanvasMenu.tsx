import { useEffect } from 'react';
import type { AlignKind, DistributeKind } from './layoutOps';

interface Props {
  x: number;
  y: number;
  count: number;
  onAlign: (kind: AlignKind) => void;
  onDistribute: (kind: DistributeKind) => void;
  onTidy: () => void;
  onClose: () => void;
}

const ALIGN: Array<{ kind: AlignKind; label: string; icon: string }> = [
  { kind: 'left', label: 'Align left', icon: '⇤' },
  { kind: 'hcenter', label: 'Align center', icon: '↔' },
  { kind: 'right', label: 'Align right', icon: '⇥' },
  { kind: 'top', label: 'Align top', icon: '⤒' },
  { kind: 'vcenter', label: 'Align middle', icon: '↕' },
  { kind: 'bottom', label: 'Align bottom', icon: '⤓' },
];

/** Right-click menu for arranging a multi-node selection (PRODUCT.md §3.3). */
export function CanvasMenu({
  x,
  y,
  count,
  onAlign,
  onDistribute,
  onTidy,
  onClose,
}: Props) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="dw-ctxmenu" style={{ left: x, top: y }}>
      <div className="dw-ctxmenu-head">{count} selected</div>
      {ALIGN.map((a) => (
        <button key={a.kind} className="dw-ctxmenu-item" onClick={() => onAlign(a.kind)}>
          <span className="dw-ctxmenu-icon">{a.icon}</span>
          {a.label}
        </button>
      ))}
      <div className="dw-ctxmenu-sep" />
      <button
        className="dw-ctxmenu-item"
        onClick={() => onDistribute('horizontal')}
        disabled={count < 3}
      >
        <span className="dw-ctxmenu-icon">⋯</span>
        Distribute horizontally
      </button>
      <button
        className="dw-ctxmenu-item"
        onClick={() => onDistribute('vertical')}
        disabled={count < 3}
      >
        <span className="dw-ctxmenu-icon">⋮</span>
        Distribute vertically
      </button>
      <div className="dw-ctxmenu-sep" />
      <button className="dw-ctxmenu-item" onClick={onTidy}>
        <span className="dw-ctxmenu-icon">▦</span>
        Tidy
        <span className="dw-ctxmenu-key">⇧T</span>
      </button>
    </div>
  );
}
