import { useEffect } from 'react';
import type { ComponentType } from 'react';
import type { AlignKind, DistributeKind } from './layoutOps';
import {
  AlignLeftIcon,
  AlignCenterHIcon,
  AlignRightIcon,
  AlignTopIcon,
  AlignMiddleVIcon,
  AlignBottomIcon,
  DistributeHIcon,
  DistributeVIcon,
  TidyIcon,
} from './icons';

interface Props {
  x: number;
  y: number;
  count: number;
  /** Set when exactly one terminal is selected: its current limit in MB (0=off). */
  memoryLimitMB?: number | null;
  onAlign: (kind: AlignKind) => void;
  onDistribute: (kind: DistributeKind) => void;
  onTidy: () => void;
  onMemoryLimit: (mb: number) => void;
  onClose: () => void;
}

const LIMITS = [0, 512, 1024, 2048, 4096];

const ALIGN: Array<{ kind: AlignKind; label: string; icon: ComponentType<{ size?: number }> }> = [
  { kind: 'left', label: 'Align left', icon: AlignLeftIcon },
  { kind: 'hcenter', label: 'Align center', icon: AlignCenterHIcon },
  { kind: 'right', label: 'Align right', icon: AlignRightIcon },
  { kind: 'top', label: 'Align top', icon: AlignTopIcon },
  { kind: 'vcenter', label: 'Align middle', icon: AlignMiddleVIcon },
  { kind: 'bottom', label: 'Align bottom', icon: AlignBottomIcon },
];

/** Right-click menu for arranging a multi-node selection (PRODUCT.md §3.3). */
export function CanvasMenu({
  x,
  y,
  count,
  memoryLimitMB,
  onAlign,
  onDistribute,
  onTidy,
  onMemoryLimit,
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
          <span className="dw-ctxmenu-icon"><a.icon size={14} /></span>
          {a.label}
        </button>
      ))}
      <div className="dw-ctxmenu-sep" />
      <button
        className="dw-ctxmenu-item"
        onClick={() => onDistribute('horizontal')}
        disabled={count < 3}
      >
        <span className="dw-ctxmenu-icon"><DistributeHIcon size={14} /></span>
        Distribute horizontally
      </button>
      <button
        className="dw-ctxmenu-item"
        onClick={() => onDistribute('vertical')}
        disabled={count < 3}
      >
        <span className="dw-ctxmenu-icon"><DistributeVIcon size={14} /></span>
        Distribute vertically
      </button>
      <div className="dw-ctxmenu-sep" />
      <button className="dw-ctxmenu-item" onClick={onTidy}>
        <span className="dw-ctxmenu-icon"><TidyIcon size={14} /></span>
        Tidy
        <span className="dw-ctxmenu-key">⇧T</span>
      </button>

      {memoryLimitMB !== null && memoryLimitMB !== undefined && (
        <>
          <div className="dw-ctxmenu-sep" />
          <div className="dw-ctxmenu-head">Memory limit</div>
          <div className="dw-limit-row">
            {LIMITS.map((mb) => (
              <button
                key={mb}
                className={`dw-limit-chip ${memoryLimitMB === mb ? 'active' : ''}`}
                onClick={() => onMemoryLimit(mb)}
                title={
                  mb === 0
                    ? 'No limit'
                    : `Kill the heaviest child past ${mb} MB (the shell survives)`
                }
              >
                {mb === 0 ? 'Off' : mb >= 1024 ? `${mb / 1024}G` : `${mb}M`}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
