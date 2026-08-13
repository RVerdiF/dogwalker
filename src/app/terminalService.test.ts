import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ITheme } from '@xterm/xterm';

// Fake xterm classes so the service runs headless (no canvas, no real DOM
// measurement). Instances are recorded in hoisted arrays so tests can assert
// on what the service did to the underlying Terminal/addons.
const h = vi.hoisted(() => {
  const termInstances: FakeTerminal[] = [];
  const fitInstances: FakeFitAddon[] = [];
  const webglInstances: FakeWebglAddon[] = [];
  class FakeTerminal {
    options: Record<string, unknown> & { theme?: ITheme };
    cols = 80;
    rows = 24;
    writes: string[] = [];
    addons: unknown[] = [];
    dataCb: ((data: string) => void) | null = null;
    opened = 0;
    resetCount = 0;
    disposed = false;
    constructor(options?: Record<string, unknown>) {
      this.options = { ...(options ?? {}) };
      termInstances.push(this);
    }
    loadAddon(a: unknown): void {
      this.addons.push(a);
    }
    onData(cb: (data: string) => void): void {
      this.dataCb = cb;
    }
    open(): void {
      this.opened += 1;
    }
    write(data: string): void {
      this.writes.push(data);
    }
    reset(): void {
      this.resetCount += 1;
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  class FakeFitAddon {
    fits = 0;
    constructor() {
      fitInstances.push(this);
    }
    fit(): void {
      this.fits += 1;
    }
  }
  class FakeWebglAddon {
    lossCb: (() => void) | null = null;
    disposed = false;
    constructor() {
      webglInstances.push(this);
    }
    onContextLoss(cb: () => void): void {
      this.lossCb = cb;
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { FakeTerminal, FakeFitAddon, FakeWebglAddon, termInstances, fitInstances, webglInstances };
});

vi.mock('@xterm/xterm', () => ({ Terminal: h.FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: h.FakeFitAddon }));
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: h.FakeWebglAddon }));

import { terminals } from './terminalService';

const created: string[] = [];

function newTerm(id: string) {
  terminals.create(id);
  created.push(id);
  const term = h.termInstances[h.termInstances.length - 1];
  const fit = h.fitInstances[h.fitInstances.length - 1];
  return { term, fit, el: document.createElement('div') };
}

describe('terminalService', () => {
  beforeEach(() => {
    window.dw = {
      serialize: vi.fn().mockResolvedValue(''),
    } as unknown as typeof window.dw;
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const id of created) terminals.dispose(id);
    created.length = 0;
    h.termInstances.length = 0;
    h.fitInstances.length = 0;
    h.webglInstances.length = 0;
  });

  it('create is idempotent and starts at tier 3', () => {
    const { term } = newTerm('t1');
    const count = h.termInstances.length;
    terminals.create('t1');
    expect(h.termInstances.length).toBe(count);
    expect(terminals.tierOf('t1')).toBe(3);
    expect(term.opened).toBe(0);
  });

  it('attach opens the terminal exactly once', () => {
    const { term, el } = newTerm('t1');
    terminals.attach('t1', el);
    expect(term.opened).toBe(1);
    terminals.attach('t1', el);
    expect(term.opened).toBe(1);
  });

  it('attach after promotion to tier 1 claims the WebGL context', () => {
    const { term, el } = newTerm('t1');
    terminals.setTier('t1', 1);
    expect(h.webglInstances.length).toBe(0); // not attached yet
    terminals.attach('t1', el);
    expect(term.opened).toBe(1);
    expect(h.webglInstances.length).toBe(1);
    expect(term.addons.length).toBe(2); // fit + webgl
    expect(terminals.stats().webglContexts).toBe(1);
  });

  it('tier 3 queues writes and overflows past the cap', () => {
    const { term } = newTerm('t1');
    terminals.write('t1', 'abc');
    terminals.write('t1', 'def');
    expect(term.writes).toEqual([]);
    terminals.write('t1', 'x'.repeat(256 * 1024 + 10));
    expect(term.writes).toEqual([]);
    // The overflow path flags the entry; promotion triggers a mirror resync
    // (asserted below) — here we just confirm the queue itself never reached
    // the terminal.
  });

  it('promotion from tier 3 with overflow resyncs from the mirror', async () => {
    const { term, el } = newTerm('t1');
    terminals.write('t1', 'x'.repeat(256 * 1024 + 1));
    vi.mocked(window.dw.serialize).mockResolvedValue('SNAPSHOT');
    terminals.attach('t1', el);
    terminals.setTier('t1', 1);
    await vi.waitFor(() => expect(term.resetCount).toBe(1));
    expect(window.dw.serialize).toHaveBeenCalledWith('t1');
    expect(term.writes).toContain('SNAPSHOT');
    expect(terminals.tierOf('t1')).toBe(1);
  });

  it('promotion from tier 3 without overflow flushes the queue', async () => {
    const { term } = newTerm('t1');
    terminals.write('t1', 'hello');
    terminals.setTier('t1', 1);
    await vi.waitFor(() => expect(term.writes).toEqual(['hello']));
    expect(window.dw.serialize).not.toHaveBeenCalled();
  });

  it('tier 2 batches writes and flushes after 250ms', () => {
    vi.useFakeTimers();
    const { term } = newTerm('t1');
    terminals.setTier('t1', 2);
    terminals.write('t1', 'chunk1');
    terminals.write('t1', 'chunk2');
    expect(term.writes).toEqual([]);
    vi.advanceTimersByTime(249);
    expect(term.writes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(term.writes).toEqual(['chunk1chunk2']);
  });

  it('tier 1 writes immediately', async () => {
    const { term } = newTerm('t1');
    terminals.setTier('t1', 1);
    // Let the async resync settle so the queue is drained before the write.
    await vi.waitFor(() => expect(term.writes).toEqual([]));
    terminals.write('t1', 'now');
    expect(term.writes).toEqual(['now']);
  });

  it('demotion from tier 1 releases the WebGL context', () => {
    const { el } = newTerm('t1');
    terminals.attach('t1', el);
    terminals.setTier('t1', 1);
    expect(h.webglInstances.length).toBe(1);
    terminals.setTier('t1', 3);
    expect(h.webglInstances[0].disposed).toBe(true);
    expect(terminals.stats().webglContexts).toBe(0);
    expect(terminals.tierOf('t1')).toBe(3);
  });

  it('caps WebGL contexts at 8', () => {
    const els: HTMLElement[] = [];
    for (let i = 0; i < 9; i++) {
      const { el } = newTerm(`t${i}`);
      els.push(el);
      terminals.attach(`t${i}`, el);
      terminals.setTier(`t${i}`, 1);
    }
    expect(h.webglInstances.length).toBe(8);
    expect(terminals.stats().webglContexts).toBe(8);
    // The 9th terminal gets only the fit addon, no webgl.
    const ninth = h.termInstances[h.termInstances.length - 1];
    expect(ninth.addons.length).toBe(1);
  });

  it('onContextLoss counts the loss and releases the context', () => {
    const { el } = newTerm('t1');
    terminals.attach('t1', el);
    terminals.setTier('t1', 1);
    const lossesBefore = terminals.stats().contextLosses;
    h.webglInstances[0].lossCb?.();
    expect(terminals.stats().contextLosses).toBe(lossesBefore + 1);
    expect(h.webglInstances[0].disposed).toBe(true);
    expect(terminals.stats().webglContexts).toBe(0);
  });

  it('setTheme applies to every live terminal and future ones', () => {
    newTerm('a');
    newTerm('b');
    terminals.setTheme({ background: '#123456' } as ITheme);
    expect(terminals.themeBg('a')).toBe('#123456');
    expect(terminals.themeBg('b')).toBe('#123456');
    const c = newTerm('c');
    expect(c.term.options.theme).toEqual({ background: '#123456' });
    expect(terminals.themeBg('missing')).toBeUndefined();
  });

  it('stats counts tiers and tierOf reports per-terminal tier', () => {
    newTerm('a');
    newTerm('b');
    newTerm('c');
    terminals.setTier('a', 1);
    terminals.setTier('b', 2);
    // contextLosses is a lifetime counter on the singleton and is not
    // reset between tests; assert the per-test-relevant fields only.
    expect(terminals.stats()).toMatchObject({
      tier1: 1,
      tier2: 1,
      tier3: 1,
      webglContexts: 0,
    });
    expect(terminals.tierOf('a')).toBe(1);
    expect(terminals.tierOf('b')).toBe(2);
    expect(terminals.tierOf('c')).toBe(3);
    expect(terminals.tierOf('missing')).toBeNull();
  });

  it('setTier to the same tier is a no-op', () => {
    const { term, el } = newTerm('t1');
    terminals.setTier('t1', 1);
    terminals.attach('t1', el);
    terminals.setTier('t1', 1);
    expect(h.webglInstances.length).toBe(1);
    expect(term.writes).toEqual([]);
  });

  it('dispose clears the flush timer, releases WebGL and disposes the terminal', () => {
    vi.useFakeTimers();
    const { term, el } = newTerm('t1');
    terminals.attach('t1', el);
    terminals.setTier('t1', 1);
    terminals.setTier('t1', 2);
    terminals.write('t1', 'data');
    expect(term.writes).toEqual([]);
    terminals.dispose('t1');
    expect(term.disposed).toBe(true);
    expect(h.webglInstances[0].disposed).toBe(true);
    expect(terminals.tierOf('t1')).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(term.writes).toEqual([]); // pending flush never fired
    expect(() => terminals.dispose('t1')).not.toThrow();
  });

  it('fit returns null when not attached, else the measured dimensions', () => {
    const { term, fit, el } = newTerm('t1');
    expect(terminals.fit('t1')).toBeNull();
    expect(terminals.fit('missing')).toBeNull();
    terminals.attach('t1', el);
    expect(terminals.fit('t1')).toEqual({ cols: 80, rows: 24 });
    expect(fit.fits).toBe(1);
  });

  it('onInput forwards terminal data to the callback', () => {
    const { term } = newTerm('t1');
    const cb = vi.fn();
    terminals.onInput('t1', cb);
    term.dataCb?.('ls -la');
    expect(cb).toHaveBeenCalledWith('ls -la');
  });

  it('write/setTier/dispose on an unknown id are no-ops', () => {
    expect(() => terminals.write('nope', 'x')).not.toThrow();
    expect(() => terminals.setTier('nope', 1)).not.toThrow();
    expect(() => terminals.dispose('nope')).not.toThrow();
    expect(terminals.fit('nope')).toBeNull();
  });
});
