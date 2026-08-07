import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer, type Mention } from './Composer';

const target = { id: 't1', stableId: 's1', name: 'lead' };
const mentions: Mention[] = [
  { name: 'reviewer', kind: 'terminal' },
  { name: 'spec', kind: 'note' },
];

function renderComposer() {
  const onNewNote = vi.fn(async () => 'fresh-note');
  const onNewPortal = vi.fn(async () => 'fresh-portal');
  render(<Composer target={target} mentions={mentions} onNewNote={onNewNote} onNewPortal={onNewPortal} focusSignal={0} />);
  return { onNewNote, onNewPortal };
}

describe('Composer', () => {
  beforeEach(() => {
    window.dw = {
      getDraft: vi.fn().mockResolvedValue(''),
      setDraft: vi.fn(),
      sendPrompt: vi.fn(),
      saveDropImage: vi.fn(),
    } as unknown as typeof window.dw;
  });

  it('shows the bound target', () => {
    renderComposer();
    expect(screen.getByText('→ lead')).toBeInTheDocument();
  });

  it('submits on Enter and clears', async () => {
    renderComposer();
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'ship it');
    await userEvent.keyboard('{Enter}');
    expect(window.dw.sendPrompt).toHaveBeenCalledWith('t1', 'ship it');
    expect(box).toHaveValue('');
  });

  it('does not resurrect the just-sent text as a draft (pending debounce is cancelled)', () => {
    vi.useFakeTimers();
    try {
      renderComposer();
      const box = screen.getByRole('textbox') as HTMLTextAreaElement;
      // A keystroke schedules a debounced setDraft('hello')…
      fireEvent.change(box, { target: { value: 'hello' } });
      // …then Enter sends before the debounce elapses.
      fireEvent.keyDown(box, { key: 'Enter' });
      // Let any still-pending debounce timer fire.
      vi.advanceTimersByTime(1000);
      const calls = (window.dw.setDraft as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      // The final draft state must be empty, never the sent text.
      expect(calls.at(-1)).toEqual(['s1', '']);
      expect(box.value).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not submit on Shift+Enter', async () => {
    renderComposer();
    await userEvent.type(screen.getByRole('textbox'), 'line one');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(window.dw.sendPrompt).not.toHaveBeenCalled();
  });

  it('opens the @-mention menu with connected peers and the create shortcuts', async () => {
    renderComposer();
    await userEvent.type(screen.getByRole('textbox'), '@');
    expect(screen.getByRole('button', { name: /New note/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New portal/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reviewer' })).toBeInTheDocument();
  });

  it('filters mentions by the typed query', async () => {
    renderComposer();
    await userEvent.type(screen.getByRole('textbox'), '@rev');
    expect(screen.getByRole('button', { name: 'reviewer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'spec' })).not.toBeInTheDocument();
  });
});
