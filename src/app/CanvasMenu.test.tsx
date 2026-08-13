import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanvasMenu } from './CanvasMenu';
import type { AlignKind, DistributeKind } from './layoutOps';

interface Handlers {
  onAlign: ReturnType<typeof vi.fn>;
  onDistribute: ReturnType<typeof vi.fn>;
  onTidy: ReturnType<typeof vi.fn>;
  onMemoryLimit: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
}

function renderMenu(overrides: Partial<Record<string, unknown>> = {}) {
  const handlers: Handlers = {
    onAlign: vi.fn(),
    onDistribute: vi.fn(),
    onTidy: vi.fn(),
    onMemoryLimit: vi.fn(),
    onClose: vi.fn(),
  };
  const props = {
    x: 120,
    y: 80,
    count: 2,
    onAlign: handlers.onAlign,
    onDistribute: handlers.onDistribute,
    onTidy: handlers.onTidy,
    onMemoryLimit: handlers.onMemoryLimit,
    onClose: handlers.onClose,
    ...overrides,
  } as Record<string, unknown>;
  const utils = render(<CanvasMenu {...(props as unknown as ComponentProps<typeof CanvasMenu>)} />);
  return { ...utils, handlers };
}

describe('CanvasMenu', () => {
  it('positions the menu and reports the selection count', () => {
    const { container } = renderMenu({ count: 3 });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    const menu = container.querySelector('.dw-ctxmenu') as HTMLElement;
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('80px');
  });

  it('routes every align button to onAlign with its kind', () => {
    const { handlers } = renderMenu();
    const cases: Array<[string, AlignKind]> = [
      ['Align left', 'left'],
      ['Align center', 'hcenter'],
      ['Align right', 'right'],
      ['Align top', 'top'],
      ['Align middle', 'vcenter'],
      ['Align bottom', 'bottom'],
    ];
    for (const [label, kind] of cases) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(handlers.onAlign).toHaveBeenLastCalledWith(kind);
    }
    expect(handlers.onAlign).toHaveBeenCalledTimes(6);
  });

  it('disables distribute actions below 3 selections and enables them at 3', () => {
    const first = renderMenu({ count: 2 });
    expect(screen.getByRole('button', { name: 'Distribute horizontally' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Distribute vertically' })).toBeDisabled();
    first.unmount();

    const { handlers } = renderMenu({ count: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Distribute horizontally' }));
    fireEvent.click(screen.getByRole('button', { name: 'Distribute vertically' }));
    expect(handlers.onDistribute).toHaveBeenCalledWith('horizontal' satisfies DistributeKind);
    expect(handlers.onDistribute).toHaveBeenCalledWith('vertical');
  });

  it('triggers tidy', () => {
    const { handlers } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /Tidy/ }));
    expect(handlers.onTidy).toHaveBeenCalledTimes(1);
  });

  it('offers memory-limit chips for a single selected terminal, marking the active one', () => {
    const { handlers } = renderMenu({ count: 1, memoryLimitMB: 1024 });
    expect(screen.getByText('Memory limit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '512M' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1G' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2G' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4G' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1G' }).className).toContain('active');
    fireEvent.click(screen.getByRole('button', { name: '4G' }));
    expect(handlers.onMemoryLimit).toHaveBeenCalledWith(4096);
  });

  it('hides the memory-limit section when not applicable', () => {
    renderMenu({ count: 4, memoryLimitMB: undefined });
    expect(screen.queryByText('Memory limit')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Off' })).not.toBeInTheDocument();
  });

  it('closes on Escape and on any window click, then removes the listeners on unmount', () => {
    const { handlers, unmount } = renderMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(window);
    expect(handlers.onClose).toHaveBeenCalledTimes(2);
    unmount();
    fireEvent.click(window);
    expect(handlers.onClose).toHaveBeenCalledTimes(2);
  });
});
