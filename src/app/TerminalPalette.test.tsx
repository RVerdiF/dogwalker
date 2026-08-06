import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalPalette } from './TerminalPalette';

const handlers = () => ({
  onSpawn: vi.fn(),
  onAddNote: vi.fn(),
  onAddFileTree: vi.fn(),
  onAddPortal: vi.fn(),
});

describe('TerminalPalette', () => {
  beforeEach(() => {
    // The preset modal reads presets/roles from the preload bridge on mount.
    window.dw = {
      listPresets: vi.fn().mockResolvedValue([]),
      listRoles: vi.fn().mockResolvedValue([]),
    } as unknown as typeof window.dw;
  });

  it('offers a button for each node type', () => {
    render(<TerminalPalette {...handlers()} />);
    for (const label of ['Terminal', 'Note', 'Files', 'Portal']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('adds a note directly, without opening the terminal modal', async () => {
    const h = handlers();
    render(<TerminalPalette {...h} />);
    await userEvent.click(screen.getByRole('button', { name: /note/i }));
    expect(h.onAddNote).toHaveBeenCalledOnce();
    expect(h.onSpawn).not.toHaveBeenCalled();
  });

  it('opens the preset picker only when Terminal is clicked', async () => {
    render(<TerminalPalette {...handlers()} />);
    expect(screen.queryByText('New terminal')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /terminal/i }));
    expect(screen.getByText('New terminal')).toBeInTheDocument();
  });
});
