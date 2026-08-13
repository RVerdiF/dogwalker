import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import type { PreviewFlowNode } from './PreviewNode';
import { PreviewNode } from './PreviewNode';

const h = vi.hoisted(() => ({ deleteElements: vi.fn() }));

// Stub React Flow's resizer (needs real DOM measurement) and keep the delete
// path on a spy; the preview itself only cares about file loading + actions.
vi.mock('@xyflow/react', () => ({
  NodeResizer: () => null,
  useReactFlow: () => ({ deleteElements: h.deleteElements }),
}));

function renderPreview(filePath: string, overrides: Partial<Record<string, unknown>> = {}) {
  const props = {
    id: 'p1',
    data: { name: 'doc', stableId: 's1', filePath },
    selected: false,
    ...overrides,
  } as unknown as NodeProps<PreviewFlowNode>;
  return render(<PreviewNode {...props} />);
}

describe('PreviewNode', () => {
  beforeEach(() => {
    h.deleteElements.mockClear();
    window.dw = {
      readImage: vi.fn(),
      statEntry: vi.fn(),
      readFile: vi.fn(),
      openPath: vi.fn(),
    } as unknown as typeof window.dw;
  });

  it('renders an image inline for image extensions', async () => {
    vi.mocked(window.dw.readImage).mockResolvedValue('data:image/png;base64,AA');
    renderPreview('/abs/photo.png');
    expect(await screen.findByAltText('doc')).toHaveAttribute(
      'src',
      'data:image/png;base64,AA',
    );
    expect(window.dw.readImage).toHaveBeenCalledWith('/abs/photo.png');
    expect(window.dw.statEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole('img', { name: 'doc' })).toBeInTheDocument();
  });

  it('shows an error when the image cannot be read', async () => {
    vi.mocked(window.dw.readImage).mockResolvedValue('');
    renderPreview('/abs/photo.png');
    expect(await screen.findByText('Could not read image')).toBeInTheDocument();
  });

  it('renders the text head of a regular file', async () => {
    vi.mocked(window.dw.statEntry).mockResolvedValue({
      name: 'notes.md',
      path: '/abs/notes.md',
      isDir: false,
      size: 10,
      mtime: 0,
    });
    vi.mocked(window.dw.readFile).mockResolvedValue('line one\nline two');
    renderPreview('/abs/notes.md');
    // The default matcher collapses whitespace, so match the normalized text.
    const pre = await screen.findByText(/line one line two/);
    expect(pre.tagName).toBe('PRE');
    expect(window.dw.readImage).not.toHaveBeenCalled();
  });

  it('shows an error for a missing file', async () => {
    vi.mocked(window.dw.statEntry).mockResolvedValue(null);
    renderPreview('/abs/gone.txt');
    expect(await screen.findByText('File not found')).toBeInTheDocument();
  });

  it('shows a hint when the path is a folder', async () => {
    vi.mocked(window.dw.statEntry).mockResolvedValue({
      name: 'src',
      path: '/abs/src',
      isDir: true,
      size: 0,
      mtime: 0,
    });
    renderPreview('/abs/src');
    expect(
      await screen.findByText('Folder — drop it on the canvas to open a File Tree'),
    ).toBeInTheDocument();
    expect(window.dw.readFile).not.toHaveBeenCalled();
  });

  it('shows an error when the file read throws', async () => {
    vi.mocked(window.dw.statEntry).mockResolvedValue({
      name: 'x',
      path: '/abs/x',
      isDir: false,
      size: 1,
      mtime: 0,
    });
    vi.mocked(window.dw.readFile).mockRejectedValue(new Error('EACCES'));
    renderPreview('/abs/x');
    expect(await screen.findByText('Could not read file')).toBeInTheDocument();
  });

  it('opens the file with the OS default app', async () => {
    vi.mocked(window.dw.statEntry).mockResolvedValue({
      name: 'notes.md',
      path: '/abs/notes.md',
      isDir: false,
      size: 10,
      mtime: 0,
    });
    vi.mocked(window.dw.readFile).mockResolvedValue('x');
    renderPreview('/abs/notes.md');
    await screen.findByText('x');
    fireEvent.click(screen.getByTitle('Open with the OS default app'));
    expect(window.dw.openPath).toHaveBeenCalledWith('/abs/notes.md');
  });

  it('removes itself via React Flow deleteElements', async () => {
    vi.mocked(window.dw.statEntry).mockResolvedValue({
      name: 'notes.md',
      path: '/abs/notes.md',
      isDir: false,
      size: 10,
      mtime: 0,
    });
    vi.mocked(window.dw.readFile).mockResolvedValue('x');
    renderPreview('/abs/notes.md');
    await screen.findByText('x');
    fireEvent.click(screen.getByTitle('Remove preview'));
    expect(h.deleteElements).toHaveBeenCalledWith({ nodes: [{ id: 'p1' }] });
  });

  it('marks the node as selected', async () => {
    vi.mocked(window.dw.statEntry).mockResolvedValue({
      name: 'notes.md',
      path: '/abs/notes.md',
      isDir: false,
      size: 10,
      mtime: 0,
    });
    vi.mocked(window.dw.readFile).mockResolvedValue('x');
    const { container } = renderPreview('/abs/notes.md', { selected: true });
    await screen.findByText('x');
    expect(container.querySelector('.dw-preview')?.className).toContain('dw-node-selected');
  });
});
