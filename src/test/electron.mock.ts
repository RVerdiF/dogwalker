// Minimal `electron` stand-in for Vitest (node project). Main-process modules
// import from 'electron' at module load; this lets them load under a plain node
// environment so their non-Electron logic is unit-testable. Extend as needed.
import * as os from 'node:os';

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
  on = noop;
}
export const nativeTheme = { shouldUseDarkColors: false, on: noop };
export class Notification { show() {} static isSupported() { return false; } }
export const shell = { openPath: async () => '', openExternal: async () => {} };
export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }) };
export class WebContentsView {}
export const session = { fromPartition: () => ({}) };

export default { app, ipcMain, BrowserWindow, nativeTheme, Notification, shell, dialog, WebContentsView, session };
