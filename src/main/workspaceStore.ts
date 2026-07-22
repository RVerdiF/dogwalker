import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  WorkspaceFile,
  WorkspaceLayout,
  WorkspaceMeta,
} from '../shared/ipc';

interface Index {
  active: string;
  order: string[];
}

const EMPTY_LAYOUT: WorkspaceLayout = { nodes: [], edges: [] };

/**
 * Persists workspaces as plain JSON on disk (PRODUCT.md §14 — open formats):
 * one `<id>.json` per workspace holding metadata + layout, plus `index.json`
 * tracking order and the active workspace. Layout is a renderer-assembled
 * snapshot (node specs + connections as stable-id pairs); main just stores it.
 */
export class WorkspaceStore {
  private dir: string;
  private indexPath: string;

  constructor(userData: string) {
    this.dir = path.join(userData, 'workspaces');
    this.indexPath = path.join(this.dir, 'index.json');
    fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.indexPath)) {
      const first = this.writeWorkspace(this.blank('My Workspace', '🐕'));
      this.writeIndex({ active: first.id, order: [first.id] });
    }
  }

  private blank(name: string, icon: string): WorkspaceFile {
    return {
      id: 'w' + crypto.randomBytes(4).toString('hex'),
      name,
      icon,
      layout: { ...EMPTY_LAYOUT },
    };
  }

  private filePath(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private readIndex(): Index {
    return JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as Index;
  }

  private writeIndex(index: Index): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
  }

  private writeWorkspace(ws: WorkspaceFile): WorkspaceFile {
    fs.writeFileSync(this.filePath(ws.id), JSON.stringify(ws, null, 2));
    return ws;
  }

  private read(id: string): WorkspaceFile {
    return JSON.parse(fs.readFileSync(this.filePath(id), 'utf8')) as WorkspaceFile;
  }

  list(): { workspaces: WorkspaceMeta[]; active: string } {
    const index = this.readIndex();
    const workspaces = index.order
      .filter((id) => fs.existsSync(this.filePath(id)))
      .map((id) => {
        const { name, icon } = this.read(id);
        return { id, name, icon };
      });
    return { workspaces, active: index.active };
  }

  create(name: string, icon: string): WorkspaceMeta {
    const ws = this.writeWorkspace(this.blank(name || 'Workspace', icon || '🐕'));
    const index = this.readIndex();
    index.order.push(ws.id);
    index.active = ws.id;
    this.writeIndex(index);
    return { id: ws.id, name: ws.name, icon: ws.icon };
  }

  load(id: string): WorkspaceFile {
    return this.read(id);
  }

  saveLayout(id: string, layout: WorkspaceLayout): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const ws = this.read(id);
    ws.layout = layout;
    this.writeWorkspace(ws);
  }

  rename(id: string, name: string, icon: string): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const ws = this.read(id);
    ws.name = name;
    ws.icon = icon;
    this.writeWorkspace(ws);
  }

  remove(id: string): void {
    const index = this.readIndex();
    if (index.order.length <= 1) return; // keep at least one
    index.order = index.order.filter((x) => x !== id);
    if (index.active === id) index.active = index.order[0];
    this.writeIndex(index);
    try {
      fs.unlinkSync(this.filePath(id));
    } catch {
      /* already gone */
    }
  }

  setActive(id: string): void {
    if (!fs.existsSync(this.filePath(id))) return;
    const index = this.readIndex();
    index.active = id;
    this.writeIndex(index);
  }
}
