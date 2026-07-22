import * as os from 'node:os';
import * as path from 'node:path';
import * as pty from 'node-pty';
import type { WebContents } from 'electron';
import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import type { DataBatch, SpawnOptions } from '../shared/ipc';
import { defaultShell, presetCommand } from './presets';
import type { GraphStore } from './graphStore';

interface Entry {
  proc: pty.IPty;
  mirror: HeadlessTerminal;
  serializer: SerializeAddon;
  name: string;
}

interface PtyEnv {
  socketPath: string;
  shimDir: string;
}

const SCROLLBACK = 2000;
const FLUSH_MS = 16;
/** Delay before auto-executing the preset command, letting the shell init. */
const AUTOEXEC_DELAY_MS = 600;

/**
 * Owns every PTY and its headless mirror (ARCHITECTURE.md §3): the mirror is
 * the main-process source of truth for screen contents, independent of the
 * renderer's xterm instance — `serialize()` works even while the renderer
 * side is suspended (tier 3) or the workspace is hibernated. Also the sole
 * writer to a PTY, so the broker's injected messages and the user's keystrokes
 * share one path.
 */
export class PtyManager {
  private entries = new Map<string, Entry>();
  private nextId = 1;
  private pending = new Map<string, string>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private target: WebContents,
    private graph: GraphStore,
    private env: PtyEnv,
  ) {}

  spawn(opts: SpawnOptions): { id: string } {
    const id = `t${this.nextId++}`;
    const shell = defaultShell();

    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: os.homedir(),
      env: {
        ...process.env,
        DOGWALKER_TERMINAL_ID: id,
        DOGWALKER_SOCKET: this.env.socketPath,
        // The shim dir goes first so `dogwalker`/`walk` resolve here and only
        // inside canvas terminals (ARCHITECTURE.md §3, §5.1).
        PATH: `${this.env.shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });

    const mirror = new HeadlessTerminal({
      cols: opts.cols,
      rows: opts.rows,
      scrollback: SCROLLBACK,
      allowProposedApi: true,
    });
    const serializer = new SerializeAddon();
    mirror.loadAddon(serializer);

    proc.onData((data) => {
      mirror.write(data);
      this.pending.set(id, (this.pending.get(id) ?? '') + data);
      this.scheduleFlush();
    });

    proc.onExit(() => {
      this.target.send('pty:exit', id);
      this.graph.removeTerminal(id);
    });

    this.entries.set(id, { proc, mirror, serializer, name: opts.name });
    this.graph.addTerminal(id, opts.name, opts.preset);

    const command = presetCommand(opts.preset);
    if (command) {
      setTimeout(() => {
        if (this.entries.has(id)) proc.write(command + '\r');
      }, AUTOEXEC_DELAY_MS);
    }

    return { id };
  }

  write(id: string, data: string): void {
    this.entries.get(id)?.proc.write(data);
  }

  /**
   * Deliver a message to a terminal as if pasted by the user. Bracketed-paste
   * open + body + close + CR go in ONE write so the TUI processes the whole
   * paste and the submit in a single pass — no flash, no interleaving with the
   * user (AGENTS.md invariant #3). Paste-wrap only when the target has DEC mode
   * 2004 active; a bare shell gets a plain line.
   */
  inject(id: string, body: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const bracketed = entry.mirror.modes.bracketedPasteMode;
    const payload = bracketed ? `\x1b[200~${body}\x1b[201~\r` : `${body}\r`;
    entry.proc.write(payload);
    return true;
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.entries.get(id);
    if (!entry || cols < 2 || rows < 2) return;
    entry.proc.resize(cols, rows);
    entry.mirror.resize(cols, rows);
  }

  kill(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.pending.delete(id);
    entry.proc.kill();
    entry.mirror.dispose();
    this.graph.removeTerminal(id);
  }

  killAll(): void {
    for (const id of [...this.entries.keys()]) this.kill(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  serialize(id: string): string {
    const entry = this.entries.get(id);
    if (!entry) return '';
    return entry.serializer.serialize({ scrollback: SCROLLBACK });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.pending.size === 0 || this.target.isDestroyed()) return;
      const batch: DataBatch = [...this.pending.entries()];
      this.pending.clear();
      this.target.send('pty:data', batch);
    }, FLUSH_MS);
  }
}
