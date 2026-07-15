import { contextBridge, ipcRenderer } from 'electron'
import type { NoemaApi } from '../shared/types'

const noema: NoemaApi = {
  vault: {
    getSaved: () => ipcRenderer.invoke('vault:get-saved'),
    choose: () => ipcRenderer.invoke('vault:choose')
  },
  index: {
    status: () => ipcRenderer.invoke('index:status'),
    rebuild: () => ipcRenderer.invoke('index:rebuild')
  },
  tools: {
    searchNotes: (query, topK) => ipcRenderer.invoke('tools:search-notes', query, topK),
    readNote: (path) => ipcRenderer.invoke('tools:read-note', path),
    listNotes: (folder) => ipcRenderer.invoke('tools:list-notes', folder)
  },
  agent: {
    sendMessage: (message) => ipcRenderer.invoke('agent:send-message', message),
    onToolCallActivity: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, activity: Parameters<typeof listener>[0]) => listener(activity)
      ipcRenderer.on('agent:tool-call-activity', handler)
      return () => ipcRenderer.removeListener('agent:tool-call-activity', handler)
    }
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close')
  }
}

contextBridge.exposeInMainWorld('noema', noema)
