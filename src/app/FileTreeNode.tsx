import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  NodeResizer,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type { FileEntry } from '../shared/ipc';
import { setFileDrag } from './dnd';

export interface FileTreeNodeData extends Record<string, unknown> {
  name: string;
  stableId: string;
  rootPath: string;
}

export type FileTreeFlowNode = Node<FileTreeNodeData, 'filetree'>;

// Tiny path helpers — the renderer is sandboxed and has no node:path.
function sepOf(p: string): string {
  return p.includes('\\') ? '\\' : '/';
}
function dirnameOf(p: string): string {
  const s = p.replace(/[\\/]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i <= 0 ? s : s.slice(0, i);
}
function joinPath(dir: string, name: string): string {
  return dir.replace(/[\\/]+$/, '') + sepOf(dir) + name;
}

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

interface Menu {
  x: number;
  y: number;
  /** The row this menu targets, or null for the root/background menu. */
  entry: FileEntry | null;
}

interface Prompt {
  title: string;
  value: string;
  onSubmit: (value: string) => void;
}

/**
 * File Tree node (PRODUCT.md §8): an embedded, independently-rooted file manager.
 * List view with a lazily-expanding hierarchy; each directory loads its children
 * through main (`readDir`) only when first opened. Rows are draggable (onto a
 * terminal to hand its path to an agent, onto the canvas for a preview node) and
 * a right-click menu does create/rename/delete. Git, editor and search build on
 * this in later v0.3 blocks.
 */
function FileTreeNodeInner({ id, data, selected }: NodeProps<FileTreeFlowNode>) {
  const [root, setRoot] = useState(data.rootPath);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Map<string, FileEntry[]>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [editingRoot, setEditingRoot] = useState(false);
  const [rootDraft, setRootDraft] = useState(root);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [confirmDel, setConfirmDel] = useState<FileEntry | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
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

  // Reload a directory that is currently visible (root or an expanded folder).
  const reload = useCallback(
    (dir: string) => {
      if (dir === root || children.has(dir)) void load(dir);
    },
    [root, children, load],
  );

  const openMenu = (e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = hostRef.current?.getBoundingClientRect();
    setMenu({
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      entry,
    });
  };

  // The directory a new entry should be created in for the given menu target.
  const targetDir = (entry: FileEntry | null): string =>
    entry ? (entry.isDir ? entry.path : dirnameOf(entry.path)) : root;

  const doCreate = (entry: FileEntry | null, isDir: boolean) => {
    const dir = targetDir(entry);
    setPrompt({
      title: isDir ? 'New folder name' : 'New file name',
      value: '',
      onSubmit: (name) => {
        if (!name) return;
        void window.dw.createEntry(joinPath(dir, name), isDir).then(() => {
          setExpanded((prev) => new Set(prev).add(dir));
          reload(dir);
          if (!children.has(dir)) void load(dir);
        });
      },
    });
  };

  const doRename = (entry: FileEntry) => {
    setPrompt({
      title: `Rename ${entry.name}`,
      value: entry.name,
      onSubmit: (name) => {
        if (!name || name === entry.name) return;
        const dir = dirnameOf(entry.path);
        void window.dw.renameEntry(entry.path, joinPath(dir, name)).then(() => reload(dir));
      },
    });
  };

  const doDelete = (entry: FileEntry) => {
    const dir = dirnameOf(entry.path);
    void window.dw.removeEntry(entry.path).then(() => {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(entry.path);
        return next;
      });
      reload(dir);
    });
  };

  const rows: React.ReactNode[] = [];
  const render = (dir: string, depth: number) => {
    const err = errors.get(dir);
    if (err) {
      rows.push(
        <div key={`${dir}::err`} className="dw-ft-error" style={{ paddingLeft: depth * 14 + 8 }}>
          ⚠ {err}
        </div>,
      );
      return;
    }
    for (const e of children.get(dir) ?? []) {
      const isOpen = expanded.has(e.path);
      rows.push(
        <div
          key={e.path}
          className="dw-ft-row"
          style={{ paddingLeft: depth * 14 + 8 }}
          title={e.path}
          draggable
          onDragStart={(ev) => {
            ev.stopPropagation();
            setFileDrag(ev, e.path);
          }}
          onClick={() => e.isDir && toggle(e.path)}
          onContextMenu={(ev) => openMenu(ev, e)}
        >
          <span className="dw-ft-caret">{e.isDir ? (isOpen ? '▾' : '▸') : ''}</span>
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
    <div
      ref={hostRef}
      className={`dw-ft ${selected ? 'dw-node-selected' : ''}`}
      onContextMenu={(e) => openMenu(e, null)}
    >
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
        <button className="dw-ft-btn nodrag" title="Refresh" onClick={() => void load(root)}>
          ⟳
        </button>
        <button className="dw-close nodrag" onClick={close} title="Remove file tree">
          ×
        </button>
      </div>

      <div className="dw-ft-body nowheel nodrag">
        {rows.length ? rows : <div className="dw-ft-empty">Empty folder</div>}
      </div>

      {menu && (
        <FileMenu
          menu={menu}
          onNewFile={() => doCreate(menu.entry, false)}
          onNewFolder={() => doCreate(menu.entry, true)}
          onRename={() => menu.entry && doRename(menu.entry)}
          onDelete={() => menu.entry && setConfirmDel(menu.entry)}
          onClose={() => setMenu(null)}
        />
      )}

      {prompt && (
        <PromptBox
          prompt={prompt}
          onCancel={() => setPrompt(null)}
          onOk={(v) => {
            prompt.onSubmit(v.trim());
            setPrompt(null);
          }}
        />
      )}

      {confirmDel && (
        <div className="dw-ft-prompt nodrag">
          <div className="dw-ft-prompt-title">Delete “{confirmDel.name}”?</div>
          <div className="dw-ft-prompt-actions">
            <button
              className="dw-btn-small dw-btn-danger"
              onClick={() => {
                doDelete(confirmDel);
                setConfirmDel(null);
              }}
            >
              Delete
            </button>
            <button className="dw-btn-small" onClick={() => setConfirmDel(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FileMenu({
  menu,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onClose,
}: {
  menu: Menu;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [onClose]);
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
    onClose();
  };
  return (
    <div className="dw-ctxmenu dw-ft-menu nodrag" style={{ left: menu.x, top: menu.y }}>
      <button className="dw-ctxmenu-item" onClick={run(onNewFile)}>
        <span className="dw-ctxmenu-icon">📄</span> New file
      </button>
      <button className="dw-ctxmenu-item" onClick={run(onNewFolder)}>
        <span className="dw-ctxmenu-icon">📁</span> New folder
      </button>
      {menu.entry && (
        <>
          <div className="dw-ctxmenu-sep" />
          <button className="dw-ctxmenu-item" onClick={run(onRename)}>
            <span className="dw-ctxmenu-icon">✎</span> Rename
          </button>
          <button className="dw-ctxmenu-item" onClick={run(onDelete)}>
            <span className="dw-ctxmenu-icon">🗑</span> Delete
          </button>
        </>
      )}
    </div>
  );
}

function PromptBox({
  prompt,
  onOk,
  onCancel,
}: {
  prompt: Prompt;
  onOk: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(prompt.value);
  return (
    <div className="dw-ft-prompt nodrag">
      <div className="dw-ft-prompt-title">{prompt.title}</div>
      <input
        className="dw-ft-prompt-input"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOk(value);
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="dw-ft-prompt-actions">
        <button className="dw-btn-small" onClick={() => onOk(value)}>
          OK
        </button>
        <button className="dw-btn-small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export const FileTreeNode = memo(FileTreeNodeInner);
