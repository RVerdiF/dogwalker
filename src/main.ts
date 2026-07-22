import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { PtyManager } from './main/ptyManager';
import { GraphStore } from './main/graphStore';
import { History } from './main/history';
import { Broker } from './main/broker';
import { createShimDir } from './main/shimDir';
import { runBrokerTest } from './main/brokerTest';
import { WorkspaceStore } from './main/workspaceStore';
import type {
  ProcessMetric,
  SpawnOptions,
  WorkspaceLayout,
} from './shared/ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let ptys: PtyManager | null = null;
let broker: Broker | null = null;

function brokerPipePath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\dogwalker-${process.pid}`;
  }
  return path.join(app.getPath('userData'), `broker-${process.pid}.sock`);
}

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

  const graph = new GraphStore();
  const history = new History(path.join(app.getPath('userData'), 'history'));
  const shimDir = createShimDir();
  const socketPath = brokerPipePath();

  ptys = new PtyManager(mainWindow.webContents, graph, { socketPath, shimDir });
  broker = new Broker(socketPath, graph, ptys, history);
  broker.listen();

  const wc = mainWindow.webContents;
  graph.on('change', (snap) => {
    if (!wc.isDestroyed()) wc.send('graph:update', snap);
  });
  history.on('append', (pair) => {
    if (!wc.isDestroyed()) wc.send('history:append', pair);
  });

  ipcMain.handle('graph:get', () => graph.snapshot());
  ipcMain.handle('graph:connect', (_e, { a, b }: { a: string; b: string }) =>
    graph.connect(a, b),
  );
  ipcMain.handle('graph:disconnect', (_e, edgeId: string) =>
    graph.disconnect(edgeId),
  );
  ipcMain.handle('history:between', (_e, { a, b }: { a: string; b: string }) =>
    history.between(a, b),
  );

  const workspaces = new WorkspaceStore(app.getPath('userData'));
  ipcMain.handle('ws:list', () => workspaces.list());
  ipcMain.handle('ws:create', (_e, { name, icon }: { name: string; icon: string }) =>
    workspaces.create(name, icon),
  );
  ipcMain.handle('ws:load', (_e, id: string) => workspaces.load(id));
  ipcMain.handle(
    'ws:saveLayout',
    (_e, { id, layout }: { id: string; layout: WorkspaceLayout }) =>
      workspaces.saveLayout(id, layout),
  );
  ipcMain.handle(
    'ws:rename',
    (_e, { id, name, icon }: { id: string; name: string; icon: string }) =>
      workspaces.rename(id, name, icon),
  );
  ipcMain.handle('ws:delete', (_e, id: string) => workspaces.remove(id));
  ipcMain.handle('ws:setActive', (_e, id: string) => workspaces.setActive(id));

  // Dev visibility: renderer console mirrored to stdout (no devtools needed).
  wc.on('console-message', (event) => {
    console.log(`[renderer:${event.level}] ${event.message}`);
  });
  mainWindow.on('closed', () => {
    ptys?.killAll();
    broker?.close();
    ptys = null;
    broker = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const params = [
      process.env.DW_SMOKE ? 'smoke=1' : '',
      process.env.DW_SOAK ? 'soak=1' : '',
      process.env.DW_QUIET ? 'quiet=1' : '',
      process.env.DW_SOAK_MIN ? `soakmin=${process.env.DW_SOAK_MIN}` : '',
      process.env.DW_EDGETEST ? 'edgetest=1' : '',
      process.env.DW_PERSISTTEST ? 'persisttest=1' : '',
      process.env.DW_PALETTETEST ? 'palettetest=1' : '',
    ]
      .filter(Boolean)
      .join('&');
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + (params ? `?${params}` : ''));
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (process.env.DW_BROKERTEST) {
    void runBrokerTest(ptys, graph, socketPath);
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
