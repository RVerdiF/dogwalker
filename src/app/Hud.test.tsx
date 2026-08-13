import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Hud } from './Hud';

const FAKE_TIMERS: NonNullable<Parameters<typeof vi.useFakeTimers>[0]>['toFake'] = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance',
];

describe('Hud', () => {
  beforeEach(() => {
    window.dw = {
      metrics: vi.fn().mockResolvedValue([
        { type: 'node', pid: 1, cpuPercent: 8.4, memoryMB: 40 },
        { type: 'python', pid: 2, cpuPercent: 3.6, memoryMB: 2 },
      ]),
    } as unknown as typeof window.dw;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the initial fps and empty heap/process placeholders', () => {
    vi.useFakeTimers({ toFake: FAKE_TIMERS });
    render(<Hud />);
    expect(screen.getByText(/0 fps/)).toBeInTheDocument();
    expect(screen.getByText(/heap 0 MB · app 0 MB · cpu 0%/)).toBeInTheDocument();
    expect(screen.queryByText(/T1\(GL\)/)).not.toBeInTheDocument();
  });

  it('shows tier stats once the stats interval fires', () => {
    vi.useFakeTimers({ toFake: FAKE_TIMERS });
    render(<Hud />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText(/T1\(GL\) 0 · T2\(DOM\) 0 · T3\(zzz\) 0/)).toBeInTheDocument();
    expect(screen.getByText(/contexts 0\/8 · losses 0/)).toBeInTheDocument();
  });

  it('shows aggregated process metrics once the metrics interval fires', async () => {
    vi.useFakeTimers({ toFake: FAKE_TIMERS });
    render(<Hud />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(window.dw.metrics).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/heap 0 MB · app 42 MB · cpu 12%/)).toBeInTheDocument();
  });

  it('updates the fps after a full second of animation frames', () => {
    // Drive the rAF loop manually — jsdom's own rAF never fires under fake
    // timers, so stub both it and performance.now to control the timing.
    let frame: FrameRequestCallback | null = null;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => {
      frame = fn;
      return 1;
    });
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    try {
      render(<Hud />);
      expect(frame).toBeTruthy();
      act(() => {
        frame?.(1000); // one second later
      });
      expect(screen.getByText('1 fps')).toBeInTheDocument();
    } finally {
      raf.mockRestore();
      now.mockRestore();
    }
  });

  it('cleans up intervals and the rAF loop on unmount', () => {
    vi.useFakeTimers({ toFake: FAKE_TIMERS });
    const { unmount } = render(<Hud />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(window.dw.metrics).not.toHaveBeenCalled();
    expect(screen.queryByText(/T1\(GL\)/)).not.toBeInTheDocument();
  });
});
