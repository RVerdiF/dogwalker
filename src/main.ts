import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { PtyManager } from './main/ptyManager';
import { GraphStore } from './main/graphStore';
import { History } from './main/history';
import { Broker } from './main/broker';
import { createShimDir } from './main/shimDir';
import { installSkill } from './main/skillInstall';
import { runBrokerTest } from './main/brokerTest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { WorkspaceStore } from './main/workspaceStore';
import { NoteStore } from './main/noteStore';
import { DraftStore } from './main/draftStore';
import { SettingsStore } from './main/settingsStore';
import { seedFirstRun } from './main/firstRun';
import { runMemTest } from './main/memTest';
import { FsService } from './main/fsService';
import { runFsTest } from './main/fsTest';
import { GitService } from './main/gitService';
import { runGitTest } from './main/gitTest';
import { PortalManager, type PortalBounds } from './main/portalManager';
import { runPortalCliTest, runPortalLinkTest } from './main/portalCliTest';
import type { AppSettings } from './shared/ipc';
import type {
  ProcessMetric,
  SidebarEntry,
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
  const notes = new NoteStore(app.getPath('userData'), graph);
  const shimDir = createShimDir();
  installSkill();
  const socketPath = brokerPipePath();

  ptys = new PtyManager(mainWindow.webContents, graph, { socketPath, shimDir });
  const portals = new PortalManager(mainWindow, mainWindow.webContents);
  broker = new Broker(socketPath, graph, ptys, history, notes, portals);
  broker.listen();

  const wc = mainWindow.webContents;
  graph.on('change', (snap) => {
    if (!wc.isDestroyed()) wc.send('graph:update', snap);
  });
  history.on('append', (pair) => {
    if (!wc.isDestroyed()) wc.send('history:append', pair);
  });
  notes.on('update', (id: string) => {
    if (!wc.isDestroyed()) wc.send('note:update', id);
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

  ipcMain.handle('note:register', (_e, { id, name }: { id: string; name: string }) =>
    notes.register(id, name),
  );
  ipcMain.handle('note:rename', (_e, { id, name }: { id: string; name: string }) =>
    notes.rename(id, name),
  );
  ipcMain.handle('note:read', (_e, id: string) => notes.read(id));
  ipcMain.handle('note:save', (_e, { id, content }: { id: string; content: string }) =>
    notes.write(id, content),
  );
  ipcMain.handle('note:unload', (_e, id: string) => notes.unload(id));
  ipcMain.handle('note:delete', (_e, id: string) => notes.delete(id));
  ipcMain.handle(
    'note:saveImage',
    (_e, { id, name, bytes }: { id: string; name: string; bytes: Uint8Array }) =>
      notes.saveImage(id, name, bytes),
  );

  ipcMain.on('notify', (_e, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });

  const settings = new SettingsStore(app.getPath('userData'));
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) =>
    settings.set(partial),
  );
  ipcMain.handle('themes:listCustom', () => settings.listCustomThemes());

  const drafts = new DraftStore(app.getPath('userData'));
  ipcMain.on(
    'compose:send',
    (_e, { id, text }: { id: string; text: string }) => ptys?.inject(id, text),
  );
  ipcMain.handle('compose:getDraft', (_e, stableId: string) => drafts.get(stableId));
  ipcMain.on(
    'compose:setDraft',
    (_e, { stableId, text }: { stableId: string; text: string }) =>
      drafts.set(stableId, text),
  );
  ipcMain.handle(
    'compose:saveImage',
    (_e, { name, bytes }: { name: string; bytes: Uint8Array }) => {
      const dir = path.join(os.tmpdir(), 'dogwalker-drops');
      fs.mkdirSync(dir, { recursive: true });
      const safe = name.replace(/[^\w.-]/g, '_') || 'image.png';
      const file = path.join(dir, `${Date.now()}-${safe}`);
      fs.writeFileSync(file, Buffer.from(bytes));
      return file;
    },
  );

  const workspaces = new WorkspaceStore(app.getPath('userData'));
  seedFirstRun(workspaces, notes);
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
    (
      _e,
      {
        id,
        name,
        icon,
        cwd,
      }: { id: string; name: string; icon: string; cwd?: string },
    ) => workspaces.rename(id, name, icon, cwd),
  );
  ipcMain.handle('ws:delete', (_e, id: string) => workspaces.remove(id));
  ipcMain.handle('ws:setActive', (_e, id: string) => workspaces.setActive(id));
  ipcMain.handle('ws:listTerminals', (_e, workspaceId: string) =>
    ptys?.listForWorkspace(workspaceId) ?? [],
  );
  ipcMain.handle('ws:hibernate', (_e, workspaceId: string) => {
    ptys?.killWorkspace(workspaceId);
  });
  ipcMain.handle('ws:addDivider', (_e, label: string) =>
    workspaces.addDivider(label),
  );
  ipcMain.handle('ws:renameDivider', (_e, { id, label }: { id: string; label: string }) =>
    workspaces.renameDivider(id, label),
  );
  ipcMain.handle('ws:removeDivider', (_e, id: string) =>
    workspaces.removeDivider(id),
  );
  ipcMain.handle('ws:reorderSidebar', (_e, entries: SidebarEntry[]) =>
    workspaces.reorder(entries),
  );
  ipcMain.handle('sys:pickDirectory', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return res.canceled ? '' : res.filePaths[0];
  });
  ipcMain.handle('sys:openPath', (_e, p: string) => shell.openPath(p).then(() => undefined));

  const fsService = new FsService();
  ipcMain.handle('fs:readDir', (_e, dir: string) => fsService.readDir(dir));
  ipcMain.handle('fs:readFile', (_e, file: string) => fsService.readFile(file));
  ipcMain.handle('fs:readImage', (_e, file: string) => fsService.readImage(file));
  ipcMain.handle('fs:writeFile', (_e, { file, content }: { file: string; content: string }) =>
    fsService.writeFile(file, content),
  );
  ipcMain.handle('fs:create', (_e, { target, isDir }: { target: string; isDir: boolean }) =>
    fsService.create(target, isDir),
  );
  ipcMain.handle('fs:rename', (_e, { from, to }: { from: string; to: string }) =>
    fsService.rename(from, to),
  );
  ipcMain.handle('fs:remove', (_e, target: string) => fsService.remove(target));
  ipcMain.handle('fs:stat', (_e, target: string) => fsService.stat(target));
  ipcMain.handle('fs:searchFiles', (_e, { root, limit }: { root: string; limit: number }) =>
    fsService.searchFiles(root, limit),
  );
  ipcMain.handle(
    'fs:grepFiles',
    (_e, { root, query, limit }: { root: string; query: string; limit: number }) =>
      fsService.grepFiles(root, query, limit),
  );

  const git = new GitService();
  ipcMain.handle('git:status', (_e, cwd: string) => git.status(cwd));
  ipcMain.handle('git:branches', (_e, cwd: string) => git.branches(cwd));
  ipcMain.handle('git:log', (_e, { cwd, limit }: { cwd: string; limit: number }) =>
    git.log(cwd, limit),
  );
  ipcMain.handle('git:diff', (_e, { cwd, file }: { cwd: string; file?: string }) =>
    git.diff(cwd, file),
  );
  ipcMain.handle('git:commit', (_e, { cwd, message }: { cwd: string; message: string }) =>
    git.commit(cwd, message),
  );
  ipcMain.handle('git:checkout', (_e, { cwd, branch }: { cwd: string; branch: string }) =>
    git.checkout(cwd, branch),
  );
  ipcMain.handle('git:createBranch', (_e, { cwd, name }: { cwd: string; name: string }) =>
    git.createBranch(cwd, name),
  );
  ipcMain.handle('git:merge', (_e, { cwd, branch }: { cwd: string; branch: string }) =>
    git.merge(cwd, branch),
  );
  ipcMain.handle('git:stash', (_e, cwd: string) => git.stash(cwd));
  ipcMain.handle('git:stashPop', (_e, cwd: string) => git.stashPop(cwd));
  ipcMain.handle('git:fetch', (_e, cwd: string) => git.fetch(cwd));
  ipcMain.handle('git:pull', (_e, cwd: string) => git.pull(cwd));
  ipcMain.handle('git:push', (_e, cwd: string) => git.push(cwd));

  ipcMain.handle(
    'portal:register',
    (_e, { id, name }: { id: string; name: string }) =>
      graph.addNode(id, name, 'portal'),
  );
  ipcMain.handle('portal:unregister', (_e, id: string) => graph.removeNode(id));
  ipcMain.on(
    'portal:create',
    (_e, { id, partition, url }: { id: string; partition: string; url: string }) =>
      portals.create(id, partition, url),
  );
  ipcMain.on(
    'portal:setBounds',
    (
      _e,
      {
        id,
        rect,
        zoom,
        visible,
      }: { id: string; rect: PortalBounds; zoom: number; visible: boolean },
    ) => portals.setBounds(id, rect, zoom, visible),
  );
  ipcMain.on('portal:navigate', (_e, { id, url }: { id: string; url: string }) =>
    portals.navigate(id, url),
  );
  ipcMain.on('portal:back', (_e, id: string) => portals.back(id));
  ipcMain.on('portal:forward', (_e, id: string) => portals.forward(id));
  ipcMain.on('portal:reload', (_e, id: string) => portals.reload(id));
  ipcMain.on('portal:destroy', (_e, id: string) => portals.destroy(id));
  ipcMain.handle('portal:state', (_e, id: string) => portals.state(id));

  // Dev visibility: renderer console mirrored to stdout (no devtools needed).
  wc.on('console-message', (event) => {
    console.log(`[renderer:${event.level}] ${event.message}`);
  });
  mainWindow.on('closed', () => {
    ptys?.killAll();
    broker?.close();
    portals.destroyAll();
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
      process.env.DW_NOTETEST ? 'notetest=1' : '',
      process.env.DW_COMPOSERTEST ? 'composertest=1' : '',
      process.env.DW_THEMETEST ? 'themetest=1' : '',
      process.env.DW_ATTENTIONTEST ? 'attentiontest=1' : '',
      process.env.DW_LAYOUTTEST ? 'layouttest=1' : '',
      process.env.DW_BGTEST ? 'bgtest=1' : '',
      process.env.DW_SWITCHTEST ? 'switchtest=1' : '',
      process.env.DW_GROUPTEST ? 'grouptest=1' : '',
      process.env.DW_SNAPTEST ? 'snaptest=1' : '',
      process.env.DW_SIDEBARTEST ? 'sidebartest=1' : '',
      process.env.DW_FSNODETEST ? 'fsnodetest=1' : '',
      process.env.DW_FILEOPSTEST ? 'fileopstest=1' : '',
      process.env.DW_EDITORTEST ? 'editortest=1' : '',
      process.env.DW_SEARCHTEST ? 'searchtest=1' : '',
      process.env.DW_IMGTEST ? 'imgtest=1' : '',
      process.env.DW_PORTALTEST ? 'portaltest=1' : '',
    ]
      .filter(Boolean)
      .join('&');
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + (params ? `?${params}` : ''));
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (process.env.DW_MEMTEST && ptys) {
    void runMemTest(ptys, workspaces);
  }

  if (process.env.DW_FSTEST) {
    void runFsTest(fsService);
  }

  if (process.env.DW_GITTEST) {
    void runGitTest(git);
  }

  if (process.env.DW_BROKERTEST) {
    void runBrokerTest(ptys, graph, socketPath);
  }

  if (process.env.DW_PORTALCLITEST) {
    void runPortalCliTest(ptys, graph, portals, socketPath);
  }

  if (process.env.DW_PORTALLINKTEST) {
    void runPortalLinkTest(ptys, graph, portals, socketPath);
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
ipcMain.on('pty:memoryLimit', (_e, { id, mb }: { id: string; mb: number }) =>
  ptys?.setMemoryLimit(id, mb),
);
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
