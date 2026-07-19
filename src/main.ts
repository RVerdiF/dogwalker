import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { PtyManager } from './main/ptyManager';
import type { ProcessMetric, SpawnOptions } from './shared/ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let ptys: PtyManager | null = null;

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Smoke runs measure fps; Chromium throttles rAF to ~0 in occluded
      // windows, which would corrupt the numbers if the window is covered.
      backgroundThrottling: !process.env.DW_SMOKE,
    },
  });

  ptys = new PtyManager(mainWindow.webContents);

  // Dev visibility: renderer console mirrored to stdout (no devtools needed).
  mainWindow.webContents.on('console-message', (event) => {
    console.log(`[renderer:${event.level}] ${event.message}`);
  });
  mainWindow.on('closed', () => {
    ptys?.killAll();
    ptys = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const params = [
      process.env.DW_SMOKE ? 'smoke=1' : '',
      process.env.DW_SOAK ? 'soak=1' : '',
      process.env.DW_QUIET ? 'quiet=1' : '',
      process.env.DW_SOAK_MIN ? `soakmin=${process.env.DW_SOAK_MIN}` : '',
    ]
      .filter(Boolean)
      .join('&');
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + (params ? `?${params}` : ''));
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

ipcMain.handle('pty:spawn', (_e, opts: SpawnOptions) => ptys?.spawn(opts));
ipcMain.on('pty:write', (_e, { id, data }: { id: string; data: string }) =>
  ptys?.write(id, data),
);
ipcMain.on(
  'pty:resize',
  (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) =>
    ptys?.resize(id, cols, rows),
);
ipcMain.on('pty:kill', (_e, id: string) => ptys?.kill(id));
ipcMain.handle('mirror:serialize', (_e, id: string) => ptys?.serialize(id) ?? '');
ipcMain.handle('perf:metrics', (): ProcessMetric[] =>
  app.getAppMetrics().map((m) => ({
    type: m.type,
    pid: m.pid,
    cpuPercent: Math.round(m.cpu.percentCPUUsage * 10) / 10,
    memoryMB: Math.round((m.memory.workingSetSize ?? 0) / 1024),
  })),
);

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
