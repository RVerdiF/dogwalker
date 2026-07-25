import { BrowserWindow, WebContentsView, type WebContents } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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

  /** Tell the renderer to add a canvas node for a portal main just created. */
  notifyCreated(id: string, name: string, url: string, partition: string): void {
    if (this.renderer.isDestroyed()) return;
    this.renderer.send('portal:created', { id, name, url, partition });
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

  // ---- Automation (v0.4 block 2): exposed to agents via `portal` CLI --------

  private wc(id: string): WebContents | null {
    return this.views.get(id)?.view.webContents ?? null;
  }

  /** Run arbitrary JS in the page and return its (JSON-serializable) result. */
  async js(id: string, code: string): Promise<unknown> {
    const wc = this.wc(id);
    if (!wc) throw new Error('portal is gone');
    return wc.executeJavaScript(code, true);
  }

  /** Click the first element matching a CSS selector. */
  async click(id: string, selector: string): Promise<unknown> {
    const sel = JSON.stringify(selector);
    return this.js(
      id,
      `(()=>{const el=document.querySelector(${sel});if(!el)return{ok:false,error:'no element'};el.scrollIntoView({block:'center'});el.click();return{ok:true,tag:el.tagName.toLowerCase()};})()`,
    );
  }

  /** Focus a field and set its value, firing input/change. */
  async type(id: string, selector: string, text: string): Promise<unknown> {
    const sel = JSON.stringify(selector);
    const val = JSON.stringify(text);
    return this.js(
      id,
      `(()=>{const el=document.querySelector(${sel});if(!el)return{ok:false,error:'no element'};el.focus();const set=Object.getOwnPropertyDescriptor(el.__proto__,'value');if(set&&set.set)set.set.call(el,${val});else el.value=${val};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return{ok:true};})()`,
    );
  }

  /** Scroll the window (or a selector's element) by dx/dy. */
  async scroll(id: string, dx: number, dy: number): Promise<unknown> {
    return this.js(
      id,
      `(()=>{window.scrollBy(${Number(dx) || 0},${Number(dy) || 0});return{ok:true,x:window.scrollX,y:window.scrollY};})()`,
    );
  }

  /** Outer HTML of a selector (or the whole document), capped for token thrift. */
  async dom(id: string, selector?: string): Promise<string> {
    const sel = selector ? JSON.stringify(selector) : 'null';
    const html = (await this.js(
      id,
      `(()=>{const el=${sel}?document.querySelector(${sel}):document.documentElement;return el?el.outerHTML:'';})()`,
    )) as string;
    return html.slice(0, 200_000);
  }

  /** Ring-buffered console output for the portal. */
  consoleLog(id: string): string {
    return (this.views.get(id)?.console ?? []).join('\n');
  }

  /**
   * Capture the page via CDP so it works even when the portal is offscreen
   * (the compositor rasterizes on demand). Returns a temp-file path, so an agent
   * ingests it the same way as a composer image.
   */
  async screenshot(id: string): Promise<string> {
    const wc = this.wc(id);
    if (!wc) throw new Error('portal is gone');
    const dbg = wc.debugger;
    if (!dbg.isAttached()) dbg.attach('1.3');
    const res = (await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    })) as { data: string };
    const dir = path.join(os.tmpdir(), 'dogwalker-portal');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${id}-${Date.now()}.png`);
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    return file;
  }

  destroy(id: string): void {
    const e = this.views.get(id);
    if (!e) return;
    try {
      const dbg = e.view.webContents.debugger;
      if (dbg.isAttached()) dbg.detach();
    } catch {
      /* not attached */
    }
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
