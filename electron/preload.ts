import { contextBridge, ipcRenderer } from 'electron'
import type { NoemaApi } from '../shared/types'

const noema: NoemaApi = {
  vault: {
    getSaved: () => ipcRenderer.invoke('vault:get-saved'),
    createCorpus: () => ipcRenderer.invoke('vault:create-corpus'),
    choose: () => ipcRenderer.invoke('vault:choose'),
    importFiles: () => ipcRenderer.invoke('vault:import-files'),
    revealNote: (path) => ipcRenderer.invoke('vault:reveal-note', path),
    approveWrite: (proposal) => ipcRenderer.invoke('vault:approve-write', proposal)
  },
  capture: {
    propose: (input) => ipcRenderer.invoke('capture:propose', input),
    proposeLink: (fromPath, toPath, context) => ipcRenderer.invoke('capture:propose-link', fromPath, toPath, context),
    proposeMeeting: (transcript) => ipcRenderer.invoke('capture:propose-meeting', transcript)
  },
  context: {
    pick: (kind) => ipcRenderer.invoke('context:pick', kind)
  },
  session: {
    get: () => ipcRenderer.invoke('session:get'),
    save: (session) => ipcRenderer.invoke('session:save', session),
    logActivity: (event) => ipcRenderer.invoke('session:log-activity', event)
  },
  recall: {
    get: () => ipcRenderer.invoke('recall:get'),
    getTimeline: () => ipcRenderer.invoke('recall:get-timeline'),
    getContinuity: () => ipcRenderer.invoke('recall:get-continuity')
  },
  review: {
    get: () => ipcRenderer.invoke('review:get'),
    save: (items) => ipcRenderer.invoke('review:save', items)
  },
  focus: {
    sources: () => ipcRenderer.invoke('focus:list-sources'),
    selectSource: (id) => ipcRenderer.invoke('focus:select-source', id),
    get: () => ipcRenderer.invoke('focus:get'),
    save: (session) => ipcRenderer.invoke('focus:save', session),
    delete: (id) => ipcRenderer.invoke('focus:delete', id),
    proposeRecap: (session) => ipcRenderer.invoke('focus:propose-recap', session)
  },
  index: {
    status: () => ipcRenderer.invoke('index:status'),
    rebuild: () => ipcRenderer.invoke('index:rebuild'),
    getCorpus: () => ipcRenderer.invoke('index:get-corpus'),
    onProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) => listener(progress)
      ipcRenderer.on('index:progress', handler)
      return () => ipcRenderer.removeListener('index:progress', handler)
    }
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
    },
    generateArtifact: (topic, persona) => ipcRenderer.invoke('agent:generate-artifact', topic, persona),
    answerQuestion: (question, history, context) => ipcRenderer.invoke('agent:answer-question', question, history, context)
  },
  app: {
    onQuickAsk: (listener) => {
      const handler = () => listener()
      ipcRenderer.on('app:quick-ask', handler)
      return () => ipcRenderer.removeListener('app:quick-ask', handler)
    },
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close')
  }
}

contextBridge.exposeInMainWorld('noema', noema)
