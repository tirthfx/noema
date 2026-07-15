export interface VaultConfig {
  vaultPath: string
}

export interface VaultSelection {
  vaultPath: string
  indexStatus?: IndexStatus
}

export interface IndexRecord {
  notePath: string
  chunkId: string
  text: string
  embedding: number[]
  mtime: number
}

export interface IndexStatus {
  indexedNotes: number
  indexedChunks: number
  embeddedChunks: number
  removedChunks: number
  needsRebuild: boolean
  error?: string
}

export interface SearchMatch {
  notePath: string
  chunkId: string
  text: string
  score: number
}

export interface NoteSummary {
  path: string
  title: string
}

export interface ToolCallActivity {
  id: string
  tool: 'search_notes' | 'read_note' | 'list_notes'
  input: Record<string, unknown>
  status: 'running' | 'complete'
  summary?: string
}

export interface AgentResult {
  content?: string
  error?: string
  rawResponse?: string
  retryable?: boolean
}

export interface NoemaApi {
  vault: {
    getSaved: () => Promise<VaultSelection | null>
    choose: () => Promise<VaultSelection | null>
  }
  index: {
    status: () => Promise<IndexStatus | null>
    rebuild: () => Promise<IndexStatus>
  }
  tools: {
    searchNotes: (query: string, topK?: number) => Promise<SearchMatch[]>
    readNote: (path: string) => Promise<string | null>
    listNotes: (folder?: string) => Promise<NoteSummary[]>
  }
  agent: {
    sendMessage: (message: string) => Promise<AgentResult>
    onToolCallActivity: (listener: (activity: ToolCallActivity) => void) => () => void
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
  }
}
