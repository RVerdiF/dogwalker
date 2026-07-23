import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Per-terminal composer drafts (PRODUCT.md §7), keyed by the terminal's stable
 * id so a draft survives workspace switches and app restarts. Plain JSON, one
 * file. Writes are debounced by the renderer; here we just persist.
 */
export class DraftStore {
  private file: string;
  private data: Record<string, string> = {};

  constructor(userData: string) {
    this.file = path.join(userData, 'drafts.json');
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.data = {};
    }
  }

  get(stableId: string): string {
    return this.data[stableId] ?? '';
  }

  set(stableId: string, text: string): void {
    if (text) this.data[stableId] = text;
    else delete this.data[stableId];
    this.persist();
  }

  private persist(): void {
    fs.writeFile(this.file, JSON.stringify(this.data), () => {
      /* best-effort */
    });
  }
}
