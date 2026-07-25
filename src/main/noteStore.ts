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

  private assetsDir(id: string): string {
    return path.join(this.dir, `${id}.assets`);
  }

  /**
   * Store a pasted image next to the note (PRODUCT.md §6) and return its
   * absolute path (forward slashes, so it drops cleanly into a markdown link).
   * The file lives on disk beside the note, so a connected agent reading the
   * note's markdown can open the referenced image.
   */
  saveImage(id: string, name: string, bytes: Uint8Array): string {
    const dir = this.assetsDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const safe = (name || 'image.png').replace(/[^\w.-]/g, '_') || 'image.png';
    const file = path.join(dir, `${Date.now()}-${safe}`);
    fs.writeFileSync(file, Buffer.from(bytes));
    return file.replace(/\\/g, '/');
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
    try {
      fs.rmSync(this.assetsDir(id), { recursive: true, force: true });
    } catch {
      /* no assets */
    }
  }
}
