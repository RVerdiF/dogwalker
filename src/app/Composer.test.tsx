import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer, recipientsOf, type ComposerTerminal } from './Composer';

const terminals: ComposerTerminal[] = [
  { id: 't-lead', stableId: 's-lead', name: 'lead' },
  { id: 't-rev', stableId: 's-rev', name: 'reviewer' },
];

function renderComposer() {
  render(<Composer terminals={terminals} focusSignal={0} />);
}

const setText = (value: string) => {
  const box = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value } });
  return box;
};

describe('recipientsOf', () => {
  it('matches @name with a trailing boundary and not a longer name', () => {
    const t: ComposerTerminal[] = [
      { id: '1', stableId: 's1', name: 'shell' },
      { id: '2', stableId: 's2', name: 'shell-2' },
    ];
    expect(recipientsOf('ping @shell now', t).map((r) => r.id)).toEqual(['1']);
    expect(recipientsOf('ping @shell-2 now', t).map((r) => r.id)).toEqual(['2']);
  });

  it('returns every mentioned terminal', () => {
    expect(recipientsOf('@lead @reviewer sync up', terminals).map((r) => r.id)).toEqual([
      't-lead',
      't-rev',
    ]);
  });

  it('returns none when nothing is mentioned', () => {
    expect(recipientsOf('just thinking out loud', terminals)).toEqual([]);
  });
});

describe('Composer', () => {
  beforeEach(() => {
    window.dw = {
      getDraft: vi.fn().mockResolvedValue(''),
      setDraft: vi.fn(),
      sendPrompt: vi.fn(),
      saveDropImage: vi.fn(),
    } as unknown as typeof window.dw;
  });

  it('opens the mention menu listing live terminals', async () => {
    renderComposer();
    await userEvent.type(screen.getByRole('textbox'), '@');
    expect(screen.getByRole('button', { name: 'lead' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reviewer' })).toBeInTheDocument();
  });

  it('sends the verbatim text (mentions included) to the mentioned terminal', () => {
    renderComposer();
    setText('@lead ship it');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(window.dw.sendPrompt).toHaveBeenCalledTimes(1);
    expect(window.dw.sendPrompt).toHaveBeenCalledWith('t-lead', '@lead ship it');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  });

  it('broadcasts to every mentioned terminal', () => {
    renderComposer();
    setText('@lead @reviewer please sync');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(window.dw.sendPrompt).toHaveBeenCalledTimes(2);
    expect(window.dw.sendPrompt).toHaveBeenCalledWith('t-lead', '@lead @reviewer please sync');
    expect(window.dw.sendPrompt).toHaveBeenCalledWith('t-rev', '@lead @reviewer please sync');
  });

  it('does not send when no terminal is mentioned', () => {
    renderComposer();
    setText('nobody home');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(window.dw.sendPrompt).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Mention a terminal first/ })).toBeDisabled();
  });

  it('does not submit on Shift+Enter', () => {
    renderComposer();
    const box = setText('@lead line one');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(window.dw.sendPrompt).not.toHaveBeenCalled();
  });

  it('does not resurrect the just-sent text as a draft (pending debounce is cancelled)', () => {
    vi.useFakeTimers();
    try {
      renderComposer();
      setText('@lead hello');
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      vi.advanceTimersByTime(1000);
      const calls = (window.dw.setDraft as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(calls.at(-1)).toEqual(['__composer__', '']);
    } finally {
      vi.useRealTimers();
    }
  });
});
