import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SidebarEntry, WorkspaceMeta } from '../shared/ipc';
import { Sidebar } from './Sidebar';

const workspaces: WorkspaceMeta[] = [
  { id: 'w1', name: 'Alpha Workspace', icon: 'a', cwd: '/a' },
  { id: 'w2', name: 'Beta', icon: 'b', cwd: '/b' },
  { id: 'w3', name: 'Gamma', icon: 'g', cwd: '/c' },
];

const sidebar: SidebarEntry[] = [
  { kind: 'workspace', id: 'w1' },
  { kind: 'divider', id: 'd1', label: 'Project' },
  { kind: 'workspace', id: 'w2' },
  { kind: 'workspace', id: 'w3' },
];

function renderSidebar(overrides: Partial<Record<string, unknown>> = {}) {
  const handlers = {
    onSwitch: vi.fn(),
    onCreate: vi.fn(),
    onOpenMenu: vi.fn(),
    onToggleMini: vi.fn(),
    onAddDivider: vi.fn(),
    onRenameDivider: vi.fn(),
    onRemoveDivider: vi.fn(),
    onReorder: vi.fn(),
  };
  const props = {
    workspaces,
    sidebar,
    activeId: 'w1',
    mini: false,
    ...handlers,
    ...overrides,
  } as Record<string, unknown>;
  const utils = render(<Sidebar {...(props as unknown as ComponentProps<typeof Sidebar>)} />);
  return { ...utils, handlers };
}

describe('Sidebar', () => {
  it('renders workspace names with the active one highlighted and switches on click', () => {
    const { handlers } = renderSidebar({ activeId: 'w2' });
    expect(screen.getByRole('button', { name: 'Alpha Workspace' })).toBeInTheDocument();
    const beta = screen.getByRole('button', { name: 'Beta' });
    expect(beta.className).toContain('active');
    fireEvent.click(beta);
    expect(handlers.onSwitch).toHaveBeenCalledWith('w2');
  });

  it('renders dividers and their workspace sections', () => {
    renderSidebar();
    expect(screen.getByTitle('Project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gamma' })).toBeInTheDocument();
  });

  it('skips sidebar entries without a matching workspace', () => {
    renderSidebar({ sidebar: [...sidebar, { kind: 'workspace', id: 'ghost' }] });
    expect(screen.queryByRole('button', { name: 'Ghost' })).not.toBeInTheDocument();
  });

  it('collapses to initials in mini mode and toggles the rail class', () => {
    const { container } = renderSidebar({ mini: true });
    expect(container.querySelector('.dw-rail')?.className).toContain('mini');
    expect(screen.getByRole('button', { name: 'AW' })).toBeInTheDocument(); // Alpha Workspace
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alpha Workspace' })).not.toBeInTheDocument();
  });

  it('fires the create, divider, menu and collapse actions', () => {
    const { handlers } = renderSidebar();
    fireEvent.click(screen.getByTitle('New workspace'));
    expect(handlers.onCreate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle('Add divider'));
    expect(handlers.onAddDivider).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle('Menu'));
    expect(handlers.onOpenMenu).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle('Collapse sidebar'));
    expect(handlers.onToggleMini).toHaveBeenCalledTimes(1);
  });

  it('renames a divider on double-click and blur, trimming the label', () => {
    const { handlers } = renderSidebar();
    fireEvent.doubleClick(screen.getByTitle('Project'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  Core  ' } });
    fireEvent.blur(input);
    expect(handlers.onRenameDivider).toHaveBeenCalledWith('d1', 'Core');
    // The rail is prop-controlled, so the new label is the parent's job —
    // here we just confirm the editor closed.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByTitle('Project')).toBeInTheDocument();
  });

  it('commits a divider rename on Enter', () => {
    const { handlers } = renderSidebar();
    fireEvent.doubleClick(screen.getByTitle('Project'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ops' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(handlers.onRenameDivider).toHaveBeenCalledWith('d1', 'Ops');
  });

  it('cancels a divider rename on Escape without renaming', () => {
    const { handlers } = renderSidebar();
    fireEvent.doubleClick(screen.getByTitle('Project'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nope' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(handlers.onRenameDivider).not.toHaveBeenCalled();
    expect(screen.getByTitle('Project')).toBeInTheDocument();
  });

  it('removes a divider via its × button', () => {
    const { handlers } = renderSidebar();
    fireEvent.click(screen.getByTitle('Remove divider'));
    expect(handlers.onRemoveDivider).toHaveBeenCalledWith('d1');
  });

  it('reorders workspaces by dragging onto another entry, before or after', () => {
    const { handlers } = renderSidebar();
    const alpha = screen.getByRole('button', { name: 'Alpha Workspace' });
    const beta = screen.getByRole('button', { name: 'Beta' });
    // jsdom has no DragEvent and fireEvent.drop drops clientY, so build the
    // event by hand; stub the rect so the midpoint decision is deterministic.
    const dropAt = (el: Element, clientY: number) => {
      const ev = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clientY', { value: clientY });
      fireEvent(el, ev);
    };
    vi.spyOn(alpha, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 100,
    } as DOMRect);

    fireEvent.dragStart(beta);
    expect(beta.className).toContain('dragging');
    dropAt(alpha, 40); // above the midpoint → before
    expect(handlers.onReorder).toHaveBeenCalledTimes(1);
    expect(handlers.onReorder.mock.calls[0][0]).toEqual([
      { kind: 'workspace', id: 'w2' },
      { kind: 'workspace', id: 'w1' },
      { kind: 'divider', id: 'd1', label: 'Project' },
      { kind: 'workspace', id: 'w3' },
    ]);
    expect(beta.className).not.toContain('dragging');

    // And below the midpoint → after.
    fireEvent.dragStart(beta);
    dropAt(alpha, 60);
    expect(handlers.onReorder).toHaveBeenCalledTimes(2);
    expect(handlers.onReorder.mock.calls[1][0]).toEqual([
      { kind: 'workspace', id: 'w1' },
      { kind: 'workspace', id: 'w2' },
      { kind: 'divider', id: 'd1', label: 'Project' },
      { kind: 'workspace', id: 'w3' },
    ]);
  });

  it('ignores a drop onto the dragged entry itself', () => {
    const { handlers } = renderSidebar();
    const alpha = screen.getByRole('button', { name: 'Alpha Workspace' });
    fireEvent.dragStart(alpha);
    fireEvent.drop(alpha, { clientY: -1 });
    expect(handlers.onReorder).not.toHaveBeenCalled();
  });
});
