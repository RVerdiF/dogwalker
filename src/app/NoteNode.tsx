import { memo, useEffect, useRef, useState } from 'react';
import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface NoteNodeData extends Record<string, unknown> {
  name: string;
  /** For notes the React Flow id === graph id === stableId. */
  stableId: string;
}

export type NoteFlowNode = Node<NoteNodeData, 'note'>;

const SAVE_DEBOUNCE_MS = 400;

/**
 * A markdown note: a sticky whose body is a file on disk (PRODUCT.md §6). Raw
 * mode edits the source; formatted mode renders it. Edits debounce-save through
 * main (the single writer), and the note refreshes when an agent writes it via
 * the CLI (`note:update`). Image paste is deferred to v0.3.
 */
function NoteNodeInner({ id, data, selected }: NodeProps<NoteFlowNode>) {
  const [content, setContent] = useState('');
  const [formatted, setFormatted] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(data.name);
  const saveTimer = useRef<number | null>(null);
  const { deleteElements } = useReactFlow();

  useEffect(() => {
    void window.dw.readNote(data.stableId).then(setContent);
    return window.dw.onNoteUpdate((noteId) => {
      if (noteId === data.stableId) void window.dw.readNote(noteId).then(setContent);
    });
  }, [data.stableId]);

  const onEdit = (next: string) => {
    setContent(next);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void window.dw.saveNote(data.stableId, next);
    }, SAVE_DEBOUNCE_MS);
  };

  const commitName = () => {
    const n = name.trim() || data.name;
    setName(n);
    setEditingName(false);
    void window.dw.renameNote(data.stableId, n);
  };

  const close = () => {
    void window.dw.deleteNote(data.stableId);
    void deleteElements({ nodes: [{ id }] });
  };

  return (
    <div className={`dw-note ${selected ? 'dw-node-selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={220} minHeight={140} />
      <Handle id="top" type="source" position={Position.Top} className="dw-handle" />
      <Handle id="right" type="source" position={Position.Right} className="dw-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="dw-handle" />
      <Handle id="left" type="source" position={Position.Left} className="dw-handle" />
      <Handle id="sink" type="target" position={Position.Left} className="dw-handle-sink" />

      <div className="dw-drag dw-note-header">
        <span className="dw-note-emoji">📝</span>
        {editingName ? (
          <input
            className="dw-note-name-input nodrag"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
          />
        ) : (
          <span
            className="dw-note-name"
            onDoubleClick={() => setEditingName(true)}
            title="Double-click to rename"
          >
            {name}
          </span>
        )}
        <button
          className={`dw-note-mode nodrag ${formatted ? 'on' : ''}`}
          onClick={() => setFormatted((f) => !f)}
          title={formatted ? 'Show raw markdown' : 'Show formatted'}
        >
          {formatted ? '¶' : '</>'}
        </button>
        <button className="dw-close nodrag" onClick={close} title="Delete note">
          ×
        </button>
      </div>

      <div className="dw-note-body nowheel nodrag">
        {formatted ? (
          <div className="dw-note-md" onDoubleClick={() => setFormatted(false)}>
            {content.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <span className="dw-note-empty">Empty note — double-click to edit.</span>
            )}
          </div>
        ) : (
          <textarea
            className="dw-note-raw"
            value={content}
            placeholder="# Markdown…"
            onChange={(e) => onEdit(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

export const NoteNode = memo(NoteNodeInner);
