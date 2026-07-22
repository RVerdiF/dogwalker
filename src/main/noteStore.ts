import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import type { GraphStore } from './graphStore';

/**
 * Notes are markdown files on disk (PRODUCT.md §6), one `<stableId>.md` per note
 * under `userData/notes`. NoteStore is the single writer: the renderer's editor
 * and the CLI `note` verb both go through it, so there is one source of truth.
 * Each live note is also a graph node (kind "note") so it can be wired to
 * terminals and reached by the CLI. Emits `update` when content changes so the
 * UI can refresh after an agent writes.
 */
export class NoteStore extends EventEmitter {
  private dir: string;

  constructor(userData: string, private graph: GraphStore) {
    super();
    this.dir = path.join(userData, 'notes');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.md`);
  }

  /** Ensure the file exists and the note is a live graph node; return content. */
  register(id: string, name: string): string {
    if (!fs.existsSync(this.file(id))) {
      fs.writeFileSync(this.file(id), '');
    }
    this.graph.addNode(id, name, 'note');
    return this.read(id);
  }

  rename(id: string, name: string): void {
    this.graph.rename(id, name);
  }

  read(id: string): string {
    try {
      return fs.readFileSync(this.file(id), 'utf8');
    } catch {
      return '';
    }
  }

  write(id: string, content: string, notify = false): void {
    fs.writeFileSync(this.file(id), content);
    if (notify) this.emit('update', id);
  }

  append(id: string, content: string, notify = false): void {
    const cur = this.read(id);
    const joined = cur && !cur.endsWith('\n') ? cur + '\n' + content : cur + content;
    this.write(id, joined, notify);
  }

  /** Remove from the graph but keep the file (workspace switch / unload). */
  unload(id: string): void {
    this.graph.removeNode(id);
  }

  /** Remove from the graph and delete the file (user delete). */
  delete(id: string): void {
    this.graph.removeNode(id);
    try {
      fs.unlinkSync(this.file(id));
    } catch {
      /* already gone */
    }
  }
}
