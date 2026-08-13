import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { HistoryEntry } from '../shared/ipc';
import { HistoryPanel } from './HistoryPanel';

const pair = { a: 't1', b: 't2', aName: 'lead', bName: 'reviewer' };

const entries: HistoryEntry[] = [
  { ts: 1_700_000_000_000, kind: 'ask', from: 't1', to: 't2', body: 'ping' },
  {
    ts: 1_700_000_001_000,
    kind: 'reply',
    from: 't2',
    to: 't1',
    broadcastId: 'b-123456',
    body: 'pong',
  },
  { ts: 1_700_000_002_000, kind: 'check', from: 't1', to: 't2', body: 'status?' },
];

describe('HistoryPanel', () => {
  beforeEach(() => {
    window.dw = {
      history: vi.fn().mockResolvedValue(entries),
      onHistory: vi.fn().mockReturnValue(vi.fn()),
    } as unknown as typeof window.dw;
  });

  it('renders nothing when there is no pair', () => {
    const { container } = render(<HistoryPanel pair={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(window.dw.history).not.toHaveBeenCalled();
  });

  it('renders the header and loads history for the pair', async () => {
    render(<HistoryPanel pair={pair} onClose={vi.fn()} />);
    expect(screen.getByText(/lead ⟷ reviewer/)).toBeInTheDocument();
    expect(window.dw.history).toHaveBeenCalledWith('t1', 't2');
    expect(await screen.findByText('ping')).toBeInTheDocument();
  });

  it('renders every entry kind, direction, body and broadcast badge', async () => {
    render(<HistoryPanel pair={pair} onClose={vi.fn()} />);
    expect(await screen.findByText('ask')).toBeInTheDocument();
    expect(screen.getByText('reply')).toBeInTheDocument();
    expect(screen.getByText('check')).toBeInTheDocument();
    // ask and check both run lead → reviewer
    expect(screen.getAllByText('lead → reviewer')).toHaveLength(2);
    expect(screen.getByText('reviewer → lead')).toBeInTheDocument();
    expect(screen.getByText('pong')).toBeInTheDocument();
    // badge shows the first 6 chars of the broadcast id: "b-1234"
    expect(screen.getByText(/team b-1234/)).toBeInTheDocument();
  });

  it('shows the empty state when history has no entries', async () => {
    vi.mocked(window.dw.history).mockResolvedValue([]);
    render(<HistoryPanel pair={pair} onClose={vi.fn()} />);
    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
  });

  it('closes via the × button', async () => {
    const onClose = vi.fn();
    render(<HistoryPanel pair={pair} onClose={onClose} />);
    await screen.findByText('ping');
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the leash updates in either direction', async () => {
    let cb: (p: { a: string; b: string }) => void = () => {};
    const unsubscribe = vi.fn();
    vi.mocked(window.dw.onHistory).mockImplementation((fn: (p: { a: string; b: string }) => void) => {
      cb = fn;
      return unsubscribe;
    });
    const { unmount } = render(<HistoryPanel pair={pair} onClose={vi.fn()} />);
    await screen.findByText('ping');
    expect(window.dw.history).toHaveBeenCalledTimes(1);

    await act(async () => {
      cb({ a: 't2', b: 't1' }); // reversed order — still this leash
    });
    expect(window.dw.history).toHaveBeenCalledTimes(2);

    await act(async () => {
      cb({ a: 't1', b: 't1' }); // different pair — ignored
    });
    expect(window.dw.history).toHaveBeenCalledTimes(2);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
