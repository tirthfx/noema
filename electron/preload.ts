import { contextBridge, ipcRenderer } from 'electron'
import type { NoemaApi } from '../shared/types'

const noema: NoemaApi = {
  vault: {
    getSaved: () => ipcRenderer.invoke('vault:get-saved'),
    choose: () => ipcRenderer.invoke('vault:choose')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close')
  }
}

contextBridge.exposeInMainWorld('noema', noema)
