import * as os from 'node:os';
import * as path from 'node:path';
import * as pty from 'node-pty';
import type { WebContents } from 'electron';
import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import type { DataBatch, PresetId, SpawnOptions } from '../shared/ipc';
import { defaultShell, presetCommand } from './presets';

interface Entry {
  proc: pty.IPty;
  mirror: HeadlessTerminal;
  serializer: SerializeAddon;
  preset: PresetId;
}

const SCROLLBACK = 2000;
const FLUSH_MS = 16;
/** Delay before auto-executing the preset command, letting the shell init. */
const AUTOEXEC_DELAY_MS = 600;

/**
 * Owns every PTY and its headless mirror (ARCHITECTURE.md §3): the mirror is
 * the main-process source of truth for screen contents, independent of the
 * renderer's xterm instance — `serialize()` works even while the renderer
 * side is suspended (tier 3) or the workspace is hibernated.
 */
export class PtyManager {
  private entries = new Map<string, Entry>();
  private nextId = 1;
  private pending = new Map<string, string>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private target: WebContents) {}

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
        // Placeholder until the broker exists (v0.1); proves env injection.
        DOGWALKER_SOCKET: path.join(os.tmpdir(), 'dogwalker.sock'),
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
    });

    this.entries.set(id, { proc, mirror, serializer, preset: opts.preset });

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
  }

  killAll(): void {
    for (const id of [...this.entries.keys()]) this.kill(id);
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
