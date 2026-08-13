import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DevBar } from './DevBar';

describe('DevBar', () => {
  it('triggers the spawn and kill-all callbacks', () => {
    const onSpawn15 = vi.fn();
    const onKillAll = vi.fn();
    render(
      <DevBar onSpawn15={onSpawn15} onKillAll={onKillAll} hudOn={false} onToggleHud={vi.fn()} />,
    );
    expect(screen.getByText('DEV')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Spawn 15' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kill all' }));
    expect(onSpawn15).toHaveBeenCalledTimes(1);
    expect(onKillAll).toHaveBeenCalledTimes(1);
  });

  it('toggles the HUD and reflects its state in the Perf button class', () => {
    const onToggleHud = vi.fn();
    const { rerender } = render(
      <DevBar onSpawn15={vi.fn()} onKillAll={vi.fn()} hudOn={false} onToggleHud={onToggleHud} />,
    );
    const perf = screen.getByRole('button', { name: 'Perf' });
    expect(perf.className).not.toContain('dw-devbar-on');
    fireEvent.click(perf);
    expect(onToggleHud).toHaveBeenCalledTimes(1);
    rerender(
      <DevBar onSpawn15={vi.fn()} onKillAll={vi.fn()} hudOn onToggleHud={onToggleHud} />,
    );
    expect(screen.getByRole('button', { name: 'Perf' }).className).toContain('dw-devbar-on');
  });
});
