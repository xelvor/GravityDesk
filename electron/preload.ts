import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    create: (payload: { title: string; cwd?: string; antigravity_id?: string }) => ipcRenderer.invoke('sessions:create', payload),
    select: (id: string) => ipcRenderer.invoke('sessions:select', id),
    delete: (id: string) => ipcRenderer.invoke('sessions:delete', id),
    updateCwd: (id: string, cwd: string) => ipcRenderer.invoke('sessions:updateCwd', id, cwd),
  },
  agy: {
    checkCommand: () => ipcRenderer.invoke('agy:checkCommand'),
    startSession: (payload: { sessionId: string; cwd?: string }) => ipcRenderer.invoke('agy:startSession', payload),
    send: (payload: { sessionId: string; text: string }) => ipcRenderer.invoke('agy:send', payload),
    stop: (payload: { sessionId: string }) => ipcRenderer.invoke('agy:stop', payload),
    syncTitle: (payload: { sessionId: string }) => ipcRenderer.invoke('agy:syncTitle', payload),
    listResumeSessions: () => ipcRenderer.invoke('agy:listResumeSessions'),
    listModels: () => ipcRenderer.invoke('agy:listModels'),
    onOutput: (callback: (payload: { sessionId: string; data: string }) => void) => {
      const handler = (_event: any, data: { sessionId: string; data: string }) => callback(data);
      ipcRenderer.on('agy:output', handler);
      return () => ipcRenderer.removeListener('agy:output', handler);
    },
    onStatusChange: (callback: (payload: { sessionId: string; status: string; pid?: number; error?: string }) => void) => {
      const handler = (_event: any, data: { sessionId: string; status: string; pid?: number; error?: string }) => callback(data);
      ipcRenderer.on('agy:status', handler);
      return () => ipcRenderer.removeListener('agy:status', handler);
    },
  },
  messages: {
    list: (sessionId: string) => ipcRenderer.invoke('messages:list', sessionId),
    add: (payload: { sessionId: string; role: 'user' | 'assistant' | 'system'; content: string; rawOutput?: string }) =>
      ipcRenderer.invoke('messages:add', payload),
  },
  export: {
    markdown: (sessionId: string) => ipcRenderer.invoke('export:markdown', sessionId),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },
  accounts: {
    add: (data: { name: string, payload: string }) => ipcRenderer.invoke('accounts:add', data),
    oauth: () => ipcRenderer.invoke('accounts:oauth'),
    delete: (id: string) => ipcRenderer.invoke('accounts:delete', id),
    list: () => ipcRenderer.invoke('accounts:list'),
    switch: (id: string) => ipcRenderer.invoke('accounts:switch', id),
    refresh: (id: string) => ipcRenderer.invoke('accounts:refresh', id)
  },
  utils: {
    getFilePath: (file: File) => {
      try {
        return webUtils.getPathForFile(file) || (file as any).path || file.name;
      } catch (e) {
        return (file as any).path || file.name;
      }
    },
    openExternal: (url: string) => ipcRenderer.invoke('utils:openExternal', url)
  }
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error('Failed to expose API via contextBridge:', error);
  }
} else {
  (window as any).api = api;
}

export type Api = typeof api;
