import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import { GroupNode, type GroupFlowNode } from './GroupNode';

function renderGroup(overrides: Partial<Record<string, unknown>> = {}) {
  const props = {
    id: 'g1',
    data: { name: 'Team A', stableId: 's1' },
    selected: false,
    ...overrides,
  } as unknown as NodeProps<GroupFlowNode>;
  return render(<GroupNode {...props} />);
}

describe('GroupNode', () => {
  it('renders the group name with no editor by default', () => {
    renderGroup();
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('marks the frame as selected when selected', () => {
    const { container } = renderGroup({ selected: true });
    expect(container.querySelector('.dw-group')?.className).toContain('dw-group-selected');
  });

  it('renames on double-click and commit (trimmed) via blur, dispatching the event', () => {
    const listener = vi.fn();
    window.addEventListener('dw:group-rename', listener);
    try {
      renderGroup();
      fireEvent.doubleClick(screen.getByText('Team A'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '  New Team  ' } });
      fireEvent.blur(input);
      expect(listener).toHaveBeenCalledTimes(1);
      const ev = listener.mock.calls[0][0] as CustomEvent;
      expect(ev.detail).toEqual({ id: 'g1', name: 'New Team' });
      expect(screen.getByText('New Team')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    } finally {
      window.removeEventListener('dw:group-rename', listener);
    }
  });

  it('falls back to the original name when the edit is blank', () => {
    const listener = vi.fn();
    window.addEventListener('dw:group-rename', listener);
    try {
      renderGroup();
      fireEvent.doubleClick(screen.getByText('Team A'));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
      fireEvent.blur(screen.getByRole('textbox'));
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        id: 'g1',
        name: 'Team A',
      });
    } finally {
      window.removeEventListener('dw:group-rename', listener);
    }
  });

  it('commits on Enter', () => {
    const listener = vi.fn();
    window.addEventListener('dw:group-rename', listener);
    try {
      renderGroup();
      fireEvent.doubleClick(screen.getByText('Team A'));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Zed' } });
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        id: 'g1',
        name: 'Zed',
      });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    } finally {
      window.removeEventListener('dw:group-rename', listener);
    }
  });

  it('dispatches an ungroup event from the header button', () => {
    const listener = vi.fn();
    window.addEventListener('dw:group-ungroup', listener);
    try {
      renderGroup();
      fireEvent.click(screen.getByTitle('Ungroup (⇧G)'));
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 'g1' });
    } finally {
      window.removeEventListener('dw:group-ungroup', listener);
    }
  });
});
