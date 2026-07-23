import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { BUILTIN_THEMES } from '../shared/themes';

/**
 * The degradation ladder (ARCHITECTURE.md §4).
 * 1 — visible & readable: WebGL renderer (budgeted), immediate writes.
 * 2 — visible but small: DOM renderer, writes batched at ~4 fps.
 * 3 — offscreen: render suspended, writes queued; on promotion the terminal
 *     resyncs from the main-process mirror if the queue overflowed.
 *
 * Invariant (AGENTS.md #1): renderers hot-swap per terminal at runtime and a
 * terminal's identity never depends on its renderer.
 */
export type Tier = 1 | 2 | 3;

const MAX_WEBGL_CONTEXTS = 8;
const TIER2_FLUSH_MS = 250;
const TIER3_QUEUE_CAP = 256 * 1024;

interface Entry {
  term: Terminal;
  fit: FitAddon;
  webgl: WebglAddon | null;
  tier: Tier;
  queue: string;
  overflowed: boolean;
  resyncing: boolean;
  flushTimer: number | null;
  attached: boolean;
  contextLosses: number;
}

export interface TierStats {
  tier1: number;
  tier2: number;
  tier3: number;
  webglContexts: number;
  contextLosses: number;
}

class TerminalService {
  private entries = new Map<string, Entry>();
  private webglCount = 0;
  private contextLossTotal = 0;
  private theme: ITheme = BUILTIN_THEMES[0].theme;

  /** Apply a theme to every live terminal and to any spawned afterwards. */
  setTheme(theme: ITheme): void {
    this.theme = theme;
    for (const e of this.entries.values()) e.term.options.theme = theme;
  }

  create(id: string): void {
    if (this.entries.has(id)) return;
    const term = new Terminal({
      scrollback: 2000,
      fontSize: 13,
      fontFamily: '"Cascadia Mono", Consolas, Menlo, monospace',
      allowProposedApi: true,
      theme: this.theme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    this.entries.set(id, {
      term,
      fit,
      webgl: null,
      tier: 3,
      queue: '',
      overflowed: false,
      resyncing: false,
      flushTimer: null,
      attached: false,
      contextLosses: 0,
    });
  }

  attach(id: string, element: HTMLElement): void {
    const e = this.entries.get(id);
    if (!e || e.attached) return;
    e.term.open(element);
    e.attached = true;
    // The tier engine may have promoted this terminal before the DOM existed;
    // claim the WebGL context it was entitled to.
    if (e.tier === 1) this.acquireWebgl(e);
  }

  onInput(id: string, cb: (data: string) => void): void {
    this.entries.get(id)?.term.onData(cb);
  }

  fit(id: string): { cols: number; rows: number } | null {
    const e = this.entries.get(id);
    if (!e || !e.attached) return null;
    e.fit.fit();
    return { cols: e.term.cols, rows: e.term.rows };
  }

  write(id: string, data: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.resyncing || e.tier === 3) {
      e.queue += data;
      if (e.queue.length > TIER3_QUEUE_CAP) {
        e.queue = '';
        e.overflowed = true;
      }
      return;
    }
    if (e.tier === 2) {
      e.queue += data;
      if (e.flushTimer === null) {
        e.flushTimer = window.setTimeout(() => {
          e.flushTimer = null;
          const chunk = e.queue;
          e.queue = '';
          if (chunk) e.term.write(chunk);
        }, TIER2_FLUSH_MS);
      }
      return;
    }
    e.term.write(data);
  }

  setTier(id: string, tier: Tier): void {
    const e = this.entries.get(id);
    if (!e || e.tier === tier) return;
    const from = e.tier;
    e.tier = tier;

    if (tier !== 1 && e.webgl) this.releaseWebgl(e);

    if (from === 3 && tier !== 3) {
      void this.resync(id, e);
    }

    if (tier === 1) {
      this.acquireWebgl(e);
      this.flushNow(e);
    }
  }

  dispose(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    if (e.flushTimer !== null) clearTimeout(e.flushTimer);
    if (e.webgl) this.releaseWebgl(e);
    e.term.dispose();
  }

  stats(): TierStats {
    let tier1 = 0;
    let tier2 = 0;
    let tier3 = 0;
    for (const e of this.entries.values()) {
      if (e.tier === 1) tier1++;
      else if (e.tier === 2) tier2++;
      else tier3++;
    }
    return {
      tier1,
      tier2,
      tier3,
      webglContexts: this.webglCount,
      contextLosses: this.contextLossTotal,
    };
  }

  tierOf(id: string): Tier | null {
    return this.entries.get(id)?.tier ?? null;
  }

  /** Test helper: the background color applied to a terminal. */
  themeBg(id: string): string | undefined {
    return this.entries.get(id)?.term.options.theme?.background;
  }

  private acquireWebgl(e: Entry): void {
    if (e.webgl || this.webglCount >= MAX_WEBGL_CONTEXTS || !e.attached) return;
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        e.contextLosses++;
        this.contextLossTotal++;
        this.releaseWebgl(e);
      });
      e.term.loadAddon(webgl);
      e.webgl = webgl;
      this.webglCount++;
    } catch {
      // WebGL unavailable — DOM renderer keeps working, which is the design.
      e.webgl = null;
    }
  }

  private releaseWebgl(e: Entry): void {
    if (!e.webgl) return;
    e.webgl.dispose();
    e.webgl = null;
    this.webglCount--;
  }

  /**
   * Returning from tier 3: replay the queued bytes, or — if the queue
   * overflowed — reset and restore the screen from the main-process mirror.
   * Proves ROADMAP v0.0.1 output #4.
   */
  private async resync(id: string, e: Entry): Promise<void> {
    if (e.resyncing) return;
    if (!e.overflowed) {
      this.flushNow(e);
      return;
    }
    e.resyncing = true;
    try {
      const snapshot = await window.dw.serialize(id);
      if (!this.entries.has(id)) return;
      e.term.reset();
      if (snapshot) e.term.write(snapshot);
      e.overflowed = false;
    } finally {
      e.resyncing = false;
      this.flushNow(e);
    }
  }

  private flushNow(e: Entry): void {
    if (e.flushTimer !== null) {
      clearTimeout(e.flushTimer);
      e.flushTimer = null;
    }
    const chunk = e.queue;
    e.queue = '';
    if (chunk) e.term.write(chunk);
  }
}

export const terminals = new TerminalService();
