import { memo, useEffect, useState } from 'react';
import {
  NodeResizer,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';

export interface PreviewNodeData extends Record<string, unknown> {
  name: string;
  stableId: string;
  filePath: string;
}

export type PreviewFlowNode = Node<PreviewNodeData, 'preview'>;

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
const TEXT_HEAD_LIMIT = 8000;

function extOf(p: string): string {
  return p.slice(p.lastIndexOf('.') + 1).toLowerCase();
}

/**
 * A read-only file preview dropped onto the canvas (PRODUCT.md §8). Images show
 * inline (read as a data URI through main); everything else shows a text head.
 * Pure layout — it re-reads its file on mount, so nothing but the path persists.
 */
function PreviewNodeInner({ id, data, selected }: NodeProps<PreviewFlowNode>) {
  const [image, setImage] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [error, setError] = useState<string>('');
  const { deleteElements } = useReactFlow();
  const isImage = IMAGE_EXTS.includes(extOf(data.filePath));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isImage) {
        const uri = await window.dw.readImage(data.filePath);
        if (!cancelled) {
          if (uri) setImage(uri);
          else setError('Could not read image');
        }
      } else {
        // Guard against a directory path (readFile would EISDIR).
        const st = await window.dw.statEntry(data.filePath);
        if (cancelled) return;
        if (!st) {
          setError('File not found');
        } else if (st.isDir) {
          setError('Folder — drop it on the canvas to open a File Tree');
        } else {
          try {
            const content = await window.dw.readFile(data.filePath);
            if (!cancelled) setText(content.slice(0, TEXT_HEAD_LIMIT));
          } catch {
            if (!cancelled) setError('Could not read file');
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.filePath, isImage]);

  const close = () => void deleteElements({ nodes: [{ id }] });

  return (
    <div className={`dw-preview ${selected ? 'dw-node-selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={160} />
      <div className="dw-drag dw-preview-header">
        <span className="dw-preview-icon">{isImage ? '🖼' : '📄'}</span>
        <span className="dw-preview-name" title={data.filePath}>
          {data.name}
        </span>
        <button
          className="dw-ft-btn nodrag"
          title="Open with the OS default app"
          onClick={() => void window.dw.openPath(data.filePath)}
        >
          ↗
        </button>
        <button className="dw-close nodrag" onClick={close} title="Remove preview">
          ×
        </button>
      </div>
      <div className="dw-preview-body nowheel nodrag">
        {error ? (
          <div className="dw-preview-error">⚠ {error}</div>
        ) : isImage ? (
          image && <img className="dw-preview-img" src={image} alt={data.name} />
        ) : (
          <pre className="dw-preview-text">{text}</pre>
        )}
      </div>
    </div>
  );
}

export const PreviewNode = memo(PreviewNodeInner);
