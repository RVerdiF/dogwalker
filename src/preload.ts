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
};

contextBridge.exposeInMainWorld('dw', api);
