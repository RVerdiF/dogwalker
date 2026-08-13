// Minimal `electron` stand-in for Vitest (node project). Main-process modules
// import from 'electron' at module load; this lets them load under a plain node
// environment so their non-Electron logic is unit-testable. Extend as needed.
import * as os from 'node:os';
import { EventEmitter } from 'node:events';

const noop = () => {};

export const app = {
  getAppPath: () => process.cwd(),
  getPath: () => os.tmpdir(),
  getName: () => 'dogwalker',
  whenReady: () => Promise.resolve(),
  on: noop,
  quit: noop,
};
export const ipcMain = { handle: noop, on: noop, removeHandler: noop };
export class BrowserWindow {
  static getAllWindows() { return []; }
  webContents = { send: noop };
  contentView = { addChildView: noop, removeChildView: noop };
  on = noop;
}
export const nativeTheme = { shouldUseDarkColors: false, on: noop };
export class Notification { show() {} static isSupported() { return false; } }
export const shell = { openPath: async () => '', openExternal: async () => {} };
export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }) };
// --- WebContentsView / WebContents fakes (PortalManager) ---------------------
// `WebContentsView` is a real class in Electron but an empty stub here; tests
// for portalManager.ts need a working view: a fake `webContents` EventEmitter
// with the events (`console-message`, `did-navigate`, …) and methods
// (loadURL/getURL/getTitle/reload/executeJavaScript/debugger/…) the manager
// drives. State is exposed as plain fields so tests can arrange and assert.

export interface FakeRect { x: number; y: number; width: number; height: number; }

/** Minimal `WebContents` stand-in: EventEmitter plus the APIs PortalManager uses. */
export class FakeWebContents extends EventEmitter {
  // Navigable state — tests set these to arrange `getURL`/`getTitle`/history.
  url = 'about:blank';
  title = '';
  canGoBack = false;
  canGoForward = false;
  zoomFactor = 1;

  debugger = {
    attached: false,
    isAttached: () => this.debugger.attached,
    attach: (_version: string) => { this.debugger.attached = true; },
    detach: () => { this.debugger.attached = false; },
    sendCommand: async (_method: string, _params?: unknown): Promise<{ data: string }> => ({ data: '' }),
  };

  navigationHistory = {
    canGoBack: () => this.canGoBack,
    canGoForward: () => this.canGoForward,
    goBack: () => {},
    goForward: () => {},
  };

  async loadURL(_url: string): Promise<void> {}
  getURL(): string { return this.url; }
  getTitle(): string { return this.title; }
  reload(): void {}
  setZoomFactor(factor: number): void { this.zoomFactor = factor; }
  async executeJavaScript(_code: string, _userGesture?: boolean): Promise<unknown> { return undefined; }
  close(): void {}
}

export class WebContentsView {
  webContents = new FakeWebContents();
  /** Options handed to the constructor (webPreferences.partition, …). */
  webPreferences: Record<string, unknown> | undefined;
  bounds: FakeRect | null = null;
  visible = false;

  constructor(options?: { webPreferences?: Record<string, unknown> }) {
    this.webPreferences = options?.webPreferences;
  }
  setBounds(b: FakeRect): void { this.bounds = b; }
  setVisible(v: boolean): void { this.visible = v; }
}
export const session = { fromPartition: () => ({}) };

export default { app, ipcMain, BrowserWindow, nativeTheme, Notification, shell, dialog, WebContentsView, session };
