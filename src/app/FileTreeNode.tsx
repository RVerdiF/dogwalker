import { memo, useCallback, useEffect, useState } from 'react';
import {
  NodeResizer,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type { FileEntry } from '../shared/ipc';

export interface FileTreeNodeData extends Record<string, unknown> {
  name: string;
  stableId: string;
  rootPath: string;
}

export type FileTreeFlowNode = Node<FileTreeNodeData, 'filetree'>;

/** File-type glyph from the extension — enough visual context for a list. */
function iconFor(entry: FileEntry): string {
  if (entry.isDir) return '📁';
  const ext = entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return '🖼';
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'rs', 'go', 'c', 'cpp', 'h'].includes(ext))
    return '📜';
  if (['md', 'txt', 'rst'].includes(ext)) return '📄';
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return '🗜';
  return '📃';
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} K`;
  return `${(bytes / 1024 / 1024).toFixed(1)} M`;
}

/**
 * File Tree node (PRODUCT.md §8): an embedded, independently-rooted file manager.
 * This is the list view — a lazily-expanding hierarchy; each directory loads its
 * children through main (`readDir`) only when first opened. Git views, the
 * editor, ops and drag-to-agent build on top of this in later v0.3 blocks.
 */
function FileTreeNodeInner({ id, data, selected }: NodeProps<FileTreeFlowNode>) {
  const [root, setRoot] = useState(data.rootPath);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Map<string, FileEntry[]>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [editingRoot, setEditingRoot] = useState(false);
  const [rootDraft, setRootDraft] = useState(root);
  const { deleteElements } = useReactFlow();

  const load = useCallback(async (dir: string) => {
    const listing = await window.dw.readDir(dir);
    setChildren((m) => new Map(m).set(dir, listing.entries));
    setErrors((m) => {
      const next = new Map(m);
      if (listing.error) next.set(dir, listing.error);
      else next.delete(dir);
      return next;
    });
  }, []);

  // (Re)load the root whenever it changes; collapse everything below it.
  useEffect(() => {
    setExpanded(new Set());
    setChildren(new Map());
    void load(root);
  }, [root, load]);

  const toggle = useCallback(
    (dir: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(dir)) {
          next.delete(dir);
        } else {
          next.add(dir);
          if (!children.has(dir)) void load(dir);
        }
        return next;
      });
    },
    [children, load],
  );

  const commitRoot = () => {
    const next = rootDraft.trim();
    setEditingRoot(false);
    if (next && next !== root) setRoot(next);
  };

  const close = () => void deleteElements({ nodes: [{ id }] });

  const rows: React.ReactNode[] = [];
  const render = (dir: string, depth: number) => {
    const entries = children.get(dir) ?? [];
    const err = errors.get(dir);
    if (err) {
      rows.push(
        <div key={`${dir}::err`} className="dw-ft-error" style={{ paddingLeft: depth * 14 + 8 }}>
          ⚠ {err}
        </div>,
      );
      return;
    }
    for (const e of entries) {
      const isOpen = expanded.has(e.path);
      rows.push(
        <div
          key={e.path}
          className="dw-ft-row"
          style={{ paddingLeft: depth * 14 + 8 }}
          title={e.path}
          onClick={() => e.isDir && toggle(e.path)}
        >
          <span className="dw-ft-caret">
            {e.isDir ? (isOpen ? '▾' : '▸') : ''}
          </span>
          <span className="dw-ft-icon">{iconFor(e)}</span>
          <span className="dw-ft-name">{e.name}</span>
          {!e.isDir && <span className="dw-ft-size">{humanSize(e.size)}</span>}
        </div>,
      );
      if (e.isDir && isOpen) render(e.path, depth + 1);
    }
  };
  render(root, 0);

  return (
    <div className={`dw-ft ${selected ? 'dw-node-selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={240} minHeight={180} />
      <div className="dw-drag dw-ft-header">
        <span className="dw-ft-header-icon">🗂</span>
        {editingRoot ? (
          <input
            className="dw-ft-root-input nodrag"
            value={rootDraft}
            autoFocus
            onChange={(e) => setRootDraft(e.target.value)}
            onBlur={commitRoot}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRoot();
              if (e.key === 'Escape') setEditingRoot(false);
            }}
          />
        ) : (
          <span
            className="dw-ft-root"
            onDoubleClick={() => {
              setRootDraft(root);
              setEditingRoot(true);
            }}
            title={`${root} — double-click to change root`}
          >
            {root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || root}
          </span>
        )}
        <button
          className="dw-ft-btn nodrag"
          title="Choose root folder"
          onClick={() => void window.dw.pickDirectory().then((p) => p && setRoot(p))}
        >
          …
        </button>
        <button
          className="dw-ft-btn nodrag"
          title="Refresh"
          onClick={() => void load(root)}
        >
          ⟳
        </button>
        <button className="dw-close nodrag" onClick={close} title="Remove file tree">
          ×
        </button>
      </div>
      <div className="dw-ft-body nowheel nodrag">
        {rows.length ? rows : <div className="dw-ft-empty">Empty folder</div>}
      </div>
    </div>
  );
}

export const FileTreeNode = memo(FileTreeNodeInner);
