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
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
  }
}
