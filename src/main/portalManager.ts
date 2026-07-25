import { BrowserWindow, WebContentsView, type WebContents } from 'electron';

export interface PortalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PortalState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

interface Entry {
  view: WebContentsView;
  partition: string;
  console: string[];
}

const CONSOLE_RING = 500;

/**
 * Portals (PRODUCT.md §9, ARCHITECTURE.md §9): one `WebContentsView` per portal,
 * overlaid on the window and kept aligned with its canvas node's on-screen rect.
 * Each gets an isolated persistent `session` partition so logins survive and
 * don't leak between portals; linked portals (v0.4 block 3) will share a
 * partition. The renderer owns geometry (it knows pan/zoom); main owns the view
 * and the browser lifecycle. Automation (block 2) attaches here too.
 */
export class PortalManager {
  private views = new Map<string, Entry>();

  constructor(
    private win: BrowserWindow,
    private renderer: WebContents,
  ) {}

  has(id: string): boolean {
    return this.views.has(id);
  }

  /** Live entry for automation (block 2); undefined if the portal is gone. */
  entry(id: string): Entry | undefined {
    return this.views.get(id);
  }

  create(id: string, partition: string, url: string): void {
    if (this.views.has(id)) return;
    const view = new WebContentsView({
      webPreferences: { partition: `persist:dw-portal-${partition}` },
    });
    // Start collapsed until the node reports its rect, so it can't flash at 0,0.
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    const entry: Entry = { view, partition, console: [] };
    this.views.set(id, entry);

    const wc = view.webContents;
    wc.on(
      'console-message',
      (e: { message?: string }, _level?: number, message?: string) => {
        const line = message ?? e.message ?? '';
        entry.console.push(line);
        if (entry.console.length > CONSOLE_RING) entry.console.shift();
      },
    );
    const nav = () => this.sendNav(id);
    wc.on('did-navigate', nav);
    wc.on('did-navigate-in-page', nav);
    wc.on('page-title-updated', nav);
    wc.on('did-finish-load', nav);

    if (url && url !== 'about:blank') {
      wc.loadURL(url).catch(() => this.sendNav(id));
    }
  }

  private sendNav(id: string): void {
    const e = this.views.get(id);
    if (!e || this.renderer.isDestroyed()) return;
    const wc = e.view.webContents;
    this.renderer.send('portal:nav', { id, ...this.readState(wc) });
  }

  private readState(wc: WebContents): PortalState {
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    };
  }

  state(id: string): PortalState | null {
    const e = this.views.get(id);
    return e ? this.readState(e.view.webContents) : null;
  }

  /** Position the view over the node's body and scale content to canvas zoom. */
  setBounds(id: string, b: PortalBounds, zoom: number, visible: boolean): void {
    const e = this.views.get(id);
    if (!e) return;
    const show = visible && b.width > 1 && b.height > 1;
    e.view.setVisible(show);
    if (show) {
      e.view.setBounds({
        x: Math.round(b.x),
        y: Math.round(b.y),
        width: Math.round(b.width),
        height: Math.round(b.height),
      });
      try {
        e.view.webContents.setZoomFactor(zoom > 0 ? zoom : 1);
      } catch {
        /* zoom factor rejected on some pages — ignore */
      }
    }
  }

  navigate(id: string, url: string): void {
    const e = this.views.get(id);
    if (!e) return;
    // Any explicit scheme (http:, https:, data:, about:, file:) is used as-is;
    // a bare host/path is assumed https.
    const target = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    e.view.webContents.loadURL(target).catch(() => this.sendNav(id));
  }

  back(id: string): void {
    const wc = this.views.get(id)?.view.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  forward(id: string): void {
    const wc = this.views.get(id)?.view.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(id: string): void {
    this.views.get(id)?.view.webContents.reload();
  }

  destroy(id: string): void {
    const e = this.views.get(id);
    if (!e) return;
    try {
      this.win.contentView.removeChildView(e.view);
      e.view.webContents.close();
    } catch {
      /* already torn down */
    }
    this.views.delete(id);
  }

  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.destroy(id);
  }
}
