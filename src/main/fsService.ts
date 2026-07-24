import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { DirListing, FileEntry } from '../shared/ipc';

/**
 * Main-process file-system access for the File Tree node (PRODUCT.md §8). The
 * renderer is sandboxed, so every read/write/mutate crosses IPC to here. Paths
 * are normalized but not sandboxed to a root — a file manager is allowed to
 * roam — however `~` is expanded and results are guarded so a listing failure
 * (permissions, a vanished directory) degrades to an error string rather than
 * throwing across the bridge.
 */

function expand(p: string): string {
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/** Sort a directory: folders first, then files, each case-insensitively. */
function sortEntries(entries: FileEntry[]): FileEntry[] {
  return entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export class FsService {
  /** List a directory's immediate children (one level; the tree lazy-loads). */
  async readDir(dir: string): Promise<DirListing> {
    const abs = path.resolve(expand(dir));
    let dirents: fs.Dirent[];
    try {
      dirents = await fsp.readdir(abs, { withFileTypes: true });
    } catch (e) {
      return { path: abs, entries: [], error: (e as Error).message };
    }
    const entries: FileEntry[] = [];
    for (const d of dirents) {
      const full = path.join(abs, d.name);
      let isDir = d.isDirectory();
      let size = 0;
      let mtime = 0;
      try {
        // Follow symlinks so a linked directory still expands; stat lazily.
        const st = await fsp.stat(full);
        isDir = st.isDirectory();
        size = st.size;
        mtime = st.mtimeMs;
      } catch {
        // Broken symlink or race — keep the dirent's guess, zero the rest.
      }
      entries.push({ name: d.name, path: full, isDir, size, mtime });
    }
    return { path: abs, entries: sortEntries(entries) };
  }

  async readFile(file: string): Promise<string> {
    return fsp.readFile(path.resolve(expand(file)), 'utf8');
  }

  async writeFile(file: string, content: string): Promise<void> {
    await fsp.writeFile(path.resolve(expand(file)), content, 'utf8');
  }

  /** Create a file or directory; parents are made as needed. Returns its path. */
  async create(target: string, isDir: boolean): Promise<string> {
    const abs = path.resolve(expand(target));
    if (isDir) {
      await fsp.mkdir(abs, { recursive: true });
    } else {
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      // Fail if it already exists rather than truncate a real file.
      const fh = await fsp.open(abs, 'wx');
      await fh.close();
    }
    return abs;
  }

  /** Rename or move; used for both in-place rename and drag-move. */
  async rename(from: string, to: string): Promise<void> {
    const dst = path.resolve(expand(to));
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rename(path.resolve(expand(from)), dst);
  }

  async remove(target: string): Promise<void> {
    await fsp.rm(path.resolve(expand(target)), { recursive: true, force: true });
  }

  async stat(target: string): Promise<FileEntry | null> {
    const abs = path.resolve(expand(target));
    try {
      const st = await fsp.stat(abs);
      return {
        name: path.basename(abs),
        path: abs,
        isDir: st.isDirectory(),
        size: st.size,
        mtime: st.mtimeMs,
      };
    } catch {
      return null;
    }
  }
}
