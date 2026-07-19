import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { DataBatch, DwApi, SpawnOptions } from './shared/ipc';

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
};

contextBridge.exposeInMainWorld('dw', api);
