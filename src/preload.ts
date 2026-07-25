import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  DataBatch,
  DwApi,
  GraphSnapshot,
  SpawnOptions,
} from './shared/ipc';

const api: DwApi = {
  spawn: (opts: SpawnOptions) => ipcRenderer.invoke('pty:spawn', opts),
  write: (id, data) => ipcRenderer.send('pty:write', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  serialize: (id) => ipcRenderer.invoke('mirror:serialize', id),
  metrics: () => ipcRenderer.invoke('perf:metrics'),
  onData: (cb) => {
    const listener = (_e: IpcRendererEvent, batch: DataBatch) => cb(batch);
    ipcRenderer.on('pty:data', listener);
    return () => ipcRenderer.removeListener('pty:data', listener);
  },
  onExit: (cb) => {
    const listener = (_e: IpcRendererEvent, id: string) => cb(id);
    ipcRenderer.on('pty:exit', listener);
    return () => ipcRenderer.removeListener('pty:exit', listener);
  },
  onAttention: (cb) => {
    const listener = (_e: IpcRendererEvent, ev: { id: string; value: boolean }) =>
      cb(ev);
    ipcRenderer.on('pty:attention', listener);
    return () => ipcRenderer.removeListener('pty:attention', listener);
  },
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  setMemoryLimit: (id, mb) => ipcRenderer.send('pty:memoryLimit', { id, mb }),

  graph: () => ipcRenderer.invoke('graph:get'),
  connect: (a, b) => ipcRenderer.invoke('graph:connect', { a, b }),
  disconnect: (edgeId) => ipcRenderer.invoke('graph:disconnect', edgeId),
  onGraph: (cb) => {
    const listener = (_e: IpcRendererEvent, snap: GraphSnapshot) => cb(snap);
    ipcRenderer.on('graph:update', listener);
    return () => ipcRenderer.removeListener('graph:update', listener);
  },

  history: (a, b) => ipcRenderer.invoke('history:between', { a, b }),
  onHistory: (cb) => {
    const listener = (_e: IpcRendererEvent, pair: { a: string; b: string }) =>
      cb(pair);
    ipcRenderer.on('history:append', listener);
    return () => ipcRenderer.removeListener('history:append', listener);
  },

  listWorkspaces: () => ipcRenderer.invoke('ws:list'),
  createWorkspace: (name, icon) => ipcRenderer.invoke('ws:create', { name, icon }),
  loadWorkspace: (id) => ipcRenderer.invoke('ws:load', id),
  saveLayout: (id, layout) => ipcRenderer.invoke('ws:saveLayout', { id, layout }),
  renameWorkspace: (id, name, icon, cwd) =>
    ipcRenderer.invoke('ws:rename', { id, name, icon, cwd }),
  deleteWorkspace: (id) => ipcRenderer.invoke('ws:delete', id),
  setActiveWorkspace: (id) => ipcRenderer.invoke('ws:setActive', id),
  listTerminals: (workspaceId) => ipcRenderer.invoke('ws:listTerminals', workspaceId),
  hibernateWorkspace: (workspaceId) => ipcRenderer.invoke('ws:hibernate', workspaceId),
  addDivider: (label) => ipcRenderer.invoke('ws:addDivider', label),
  renameDivider: (id, label) =>
    ipcRenderer.invoke('ws:renameDivider', { id, label }),
  removeDivider: (id) => ipcRenderer.invoke('ws:removeDivider', id),
  reorderSidebar: (entries) => ipcRenderer.invoke('ws:reorderSidebar', entries),
  pickDirectory: () => ipcRenderer.invoke('sys:pickDirectory'),
  openPath: (p) => ipcRenderer.invoke('sys:openPath', p),

  readDir: (dir) => ipcRenderer.invoke('fs:readDir', dir),
  readFile: (file) => ipcRenderer.invoke('fs:readFile', file),
  readImage: (file) => ipcRenderer.invoke('fs:readImage', file),
  writeFile: (file, content) => ipcRenderer.invoke('fs:writeFile', { file, content }),
  createEntry: (target, isDir) => ipcRenderer.invoke('fs:create', { target, isDir }),
  renameEntry: (from, to) => ipcRenderer.invoke('fs:rename', { from, to }),
  removeEntry: (target) => ipcRenderer.invoke('fs:remove', target),
  statEntry: (target) => ipcRenderer.invoke('fs:stat', target),
  searchFiles: (root, limit) => ipcRenderer.invoke('fs:searchFiles', { root, limit }),
  grepFiles: (root, query, limit) =>
    ipcRenderer.invoke('fs:grepFiles', { root, query, limit }),

  gitStatus: (cwd) => ipcRenderer.invoke('git:status', cwd),
  gitBranches: (cwd) => ipcRenderer.invoke('git:branches', cwd),
  gitLog: (cwd, limit) => ipcRenderer.invoke('git:log', { cwd, limit }),
  gitDiff: (cwd, file) => ipcRenderer.invoke('git:diff', { cwd, file }),
  gitCommit: (cwd, message) => ipcRenderer.invoke('git:commit', { cwd, message }),
  gitCheckout: (cwd, branch) => ipcRenderer.invoke('git:checkout', { cwd, branch }),
  gitCreateBranch: (cwd, name) => ipcRenderer.invoke('git:createBranch', { cwd, name }),
  gitMerge: (cwd, branch) => ipcRenderer.invoke('git:merge', { cwd, branch }),
  gitStash: (cwd) => ipcRenderer.invoke('git:stash', cwd),
  gitStashPop: (cwd) => ipcRenderer.invoke('git:stashPop', cwd),
  gitFetch: (cwd) => ipcRenderer.invoke('git:fetch', cwd),
  gitPull: (cwd) => ipcRenderer.invoke('git:pull', cwd),
  gitPush: (cwd) => ipcRenderer.invoke('git:push', cwd),

  registerNote: (id, name) => ipcRenderer.invoke('note:register', { id, name }),
  renameNote: (id, name) => ipcRenderer.invoke('note:rename', { id, name }),
  readNote: (id) => ipcRenderer.invoke('note:read', id),
  saveNote: (id, content) => ipcRenderer.invoke('note:save', { id, content }),
  unloadNote: (id) => ipcRenderer.invoke('note:unload', id),
  deleteNote: (id) => ipcRenderer.invoke('note:delete', id),
  saveNoteImage: (id, name, bytes) =>
    ipcRenderer.invoke('note:saveImage', { id, name, bytes }),
  onNoteUpdate: (cb) => {
    const listener = (_e: IpcRendererEvent, id: string) => cb(id);
    ipcRenderer.on('note:update', listener);
    return () => ipcRenderer.removeListener('note:update', listener);
  },

  sendPrompt: (terminalId, text) =>
    ipcRenderer.send('compose:send', { id: terminalId, text }),
  getDraft: (stableId) => ipcRenderer.invoke('compose:getDraft', stableId),
  setDraft: (stableId, text) =>
    ipcRenderer.send('compose:setDraft', { stableId, text }),
  saveDropImage: (name, bytes) =>
    ipcRenderer.invoke('compose:saveImage', { name, bytes }),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  listCustomThemes: () => ipcRenderer.invoke('themes:listCustom'),
};

contextBridge.exposeInMainWorld('dw', api);
