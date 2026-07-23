import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import type { HistoryEntry } from '../shared/ipc';

/**
 * Append-only JSONL message log (ARCHITECTURE.md §5.2, §10). Every ask/reply/
 * check flows through the broker, so an exact, replayable conversation log is
 * possible — the structural advantage over screen-scraping designs. Keyed per
 * unordered node pair; the UI reads it when a leash is clicked.
 */
export class History extends EventEmitter {
  private buffers = new Map<string, HistoryEntry[]>();
  private file: string;

  constructor(dir: string) {
    super();
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'messages.jsonl');
  }

  private key(a: string, b: string): string {
    return [a, b].sort().join('|');
  }

  append(entry: HistoryEntry): void {
    const k = this.key(entry.from, entry.to);
    const list = this.buffers.get(k) ?? [];
    list.push(entry);
    this.buffers.set(k, list);
    fs.appendFile(this.file, JSON.stringify({ ...entry, pair: k }) + '\n', () => {
      /* best-effort; spike-grade durability */
    });
    this.emit('append', { a: entry.from, b: entry.to });
  }

  between(a: string, b: string): HistoryEntry[] {
    return this.buffers.get(this.key(a, b)) ?? [];
  }
}
