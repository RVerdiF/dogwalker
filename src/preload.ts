import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  DataBatch,
  DwApi,
  GraphSnapshot,
  PortalState,
  PresetId,
  Routine,
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
  setWalker: (id, walker) => ipcRenderer.send('pty:setWalker', { id, walker }),
  listPresets: () => ipcRenderer.invoke('preset:list'),
  createPreset: (input) => ipcRenderer.invoke('preset:create', input),
  updatePreset: (id, input) => ipcRenderer.invoke('preset:update', { id, input }),
  deletePreset: (id) => ipcRenderer.invoke('preset:delete', id),
  listRoles: () => ipcRenderer.invoke('role:list'),
  createRole: (input) => ipcRenderer.invoke('role:create', input),
  updateRole: (id, input) => ipcRenderer.invoke('role:update', { id, input }),
  deleteRole: (id) => ipcRenderer.invoke('role:delete', id),
  listContracts: () => ipcRenderer.invoke('contract:list'),
  createContract: (input) => ipcRenderer.invoke('contract:create', input),
  updateContract: (id, input) => ipcRenderer.invoke('contract:update', { id, input }),
  deleteContract: (id) => ipcRenderer.invoke('contract:delete', id),
  assignTerminalRole: (id, roleId) => ipcRenderer.invoke('role:assignTerminal', { id, roleId }),
  onRecruited: (cb) => {
    const listener = (
      _e: IpcRendererEvent,
      ev: {
        id: string;
        stableId: string;
        name: string;
        preset: PresetId;
        roleId?: string;
        walkerId: string;
        workspaceId: string;
      },
    ) => cb(ev);
    ipcRenderer.on('terminal:recruited', listener);
    return () => ipcRenderer.removeListener('terminal:recruited', listener);
  },
  onDismissed: (cb) => {
    const listener = (_e: IpcRendererEvent, id: string) => cb(id);
    ipcRenderer.on('terminal:dismissed', listener);
    return () => ipcRenderer.removeListener('terminal:dismissed', listener);
  },
  onReassigned: (cb) => {
    const listener = (_e: IpcRendererEvent, ev: { id: string; name: string }) => cb(ev);
    ipcRenderer.on('terminal:reassigned', listener);
    return () => ipcRenderer.removeListener('terminal:reassigned', listener);
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

  listWorkspaces: () => ipcRenderer.invoke('ws:list'),
  createWorkspace: (name, icon) => ipcRenderer.invoke('ws:create', { name, icon }),
  loadWorkspace: (id) => ipcRenderer.invoke('ws:load', id),
  saveLayout: (id, layout) => ipcRenderer.invoke('ws:saveLayout', { id, layout }),
  loadLayer: (workspaceId, floorId) =>
    ipcRenderer.invoke('ws:loadLayer', { workspaceId, floorId }),
  saveLayer: (workspaceId, floorId, layout) =>
    ipcRenderer.invoke('ws:saveLayer', { workspaceId, floorId, layout }),
  listFloors: (workspaceId) => ipcRenderer.invoke('floor:list', workspaceId),
  createFloor: (workspaceId, opts) =>
    ipcRenderer.invoke('floor:create', { workspaceId, opts }),
  removeFloor: (workspaceId, floorId, deleteBranch) =>
    ipcRenderer.invoke('floor:remove', { workspaceId, floorId, deleteBranch }),
  runFloorHook: (workspaceId, floorId) =>
    ipcRenderer.invoke('floor:hookRun', { workspaceId, floorId }),
  setActiveFloor: (workspaceId, floorId) =>
    ipcRenderer.invoke('floor:setActive', { workspaceId, floorId }),
  reconcileFloors: (workspaceId) => ipcRenderer.invoke('floor:reconcile', workspaceId),
  repoBranches: (workspaceId) => ipcRenderer.invoke('floor:repoBranches', workspaceId),
  landInfo: (workspaceId, floorId) =>
    ipcRenderer.invoke('floor:landInfo', { workspaceId, floorId }),
  land: (workspaceId, floorId, opts) =>
    ipcRenderer.invoke('floor:land', { workspaceId, floorId, opts }),
  renameWorkspace: (id, name, icon, cwd) =>
    ipcRenderer.invoke('ws:rename', { id, name, icon, cwd }),
  deleteWorkspace: (id) => ipcRenderer.invoke('ws:delete', id),
  setActiveWorkspace: (id) => ipcRenderer.invoke('ws:setActive', id),
  setSyncAgentDocs: (id, enabled) =>
    ipcRenderer.invoke('ws:setSyncAgentDocs', { id, enabled }),
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
  portalRegister: (id, name) => ipcRenderer.invoke('portal:register', { id, name }),
  portalUnregister: (id) => ipcRenderer.invoke('portal:unregister', id),
  portalCreate: (id, partition, url) =>
    ipcRenderer.send('portal:create', { id, partition, url }),
  portalSetBounds: (id, rect, zoom, visible) =>
    ipcRenderer.send('portal:setBounds', { id, rect, zoom, visible }),
  portalNavigate: (id, url) => ipcRenderer.send('portal:navigate', { id, url }),
  portalBack: (id) => ipcRenderer.send('portal:back', id),
  portalForward: (id) => ipcRenderer.send('portal:forward', id),
  portalReload: (id) => ipcRenderer.send('portal:reload', id),
  portalDestroy: (id) => ipcRenderer.send('portal:destroy', id),
  portalState: (id) => ipcRenderer.invoke('portal:state', id),
  onPortalNav: (cb) => {
    const listener = (_e: IpcRendererEvent, ev: { id: string } & PortalState) => cb(ev);
    ipcRenderer.on('portal:nav', listener);
    return () => ipcRenderer.removeListener('portal:nav', listener);
  },
  onPortalCreated: (cb) => {
    const listener = (
      _e: IpcRendererEvent,
      ev: { id: string; name: string; url: string; partition: string },
    ) => cb(ev);
    ipcRenderer.on('portal:created', listener);
    return () => ipcRenderer.removeListener('portal:created', listener);
  },

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

  listRoutines: (workspaceId) => ipcRenderer.invoke('routine:list', workspaceId),
  createRoutine: (workspaceId, opts) =>
    ipcRenderer.invoke('routine:create', { workspaceId, opts }),
  updateRoutine: (id, partial) => ipcRenderer.invoke('routine:update', { id, partial }),
  setRoutineEnabled: (id, enabled) =>
    ipcRenderer.invoke('routine:setEnabled', { id, enabled }),
  runRoutineNow: (id) => ipcRenderer.invoke('routine:runNow', id),
  deleteRoutine: (id) => ipcRenderer.invoke('routine:delete', id),
  onRoutineUpdate: (cb) => {
    const listener = (_e: IpcRendererEvent, r: Routine) => cb(r);
    ipcRenderer.on('routine:update', listener);
    return () => ipcRenderer.removeListener('routine:update', listener);
  },

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  listCustomThemes: () => ipcRenderer.invoke('themes:listCustom'),
};

contextBridge.exposeInMainWorld('dw', api);
