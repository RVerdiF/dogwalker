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
  pickDirectory: () => ipcRenderer.invoke('sys:pickDirectory'),
  openPath: (p) => ipcRenderer.invoke('sys:openPath', p),

  registerNote: (id, name) => ipcRenderer.invoke('note:register', { id, name }),
  renameNote: (id, name) => ipcRenderer.invoke('note:rename', { id, name }),
  readNote: (id) => ipcRenderer.invoke('note:read', id),
  saveNote: (id, content) => ipcRenderer.invoke('note:save', { id, content }),
  unloadNote: (id) => ipcRenderer.invoke('note:unload', id),
  deleteNote: (id) => ipcRenderer.invoke('note:delete', id),
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
