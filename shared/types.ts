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
export interface RecallItem extends NoteSummary { excerpt: string }

export interface ToolCallActivity {
  id: string
  tool: 'search_notes' | 'read_note' | 'list_notes' | 'write_note' | 'link_notes'
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
/**
 * A gated write. Tools return this instead of touching disk; only an approved
 * EditablePreview commit reaches the real fs write in vault.ts.
 * `baseContent` is the note's current on-disk text for `edit` proposals, which lets
 * EditablePreview highlight added lines without a diff library.
 */
export interface NoteProposal {
  path: string
  content: string
  kind: 'new' | 'edit'
  baseContent?: string
  source?: string
}

export type CaptureKind = 'text' | 'url'
export interface CaptureInput { kind: CaptureKind; value: string }
export interface ProposalResult extends AgentResult { proposal?: NoteProposal }
export interface WriteResult { ok: boolean; path?: string; error?: string }

export type Persona = 'Academic' | 'Socratic Critic' | 'Plain-Language'
export interface Citation { path: string; quote: string; title: string }
export interface ArtifactClaim { text: string; citations: Citation[] }
export interface Artifact { title: string; claims: ArtifactClaim[]; tensions: Array<{ question: string; sides: ArtifactClaim[] }> }
export interface ArtifactResult extends AgentResult { artifact?: Artifact }
export interface GroundedAnswer { claims: ArtifactClaim[]; refusal?: boolean }
export interface GroundedAnswerResult extends AgentResult { answer?: GroundedAnswer }

export interface NoemaApi {
  vault: {
    getSaved: () => Promise<VaultSelection | null>
    choose: () => Promise<VaultSelection | null>
    revealNote: (path: string) => Promise<void>
    approveWrite: (proposal: NoteProposal) => Promise<WriteResult>
  }
  capture: {
    propose: (input: CaptureInput) => Promise<ProposalResult>
    proposeLink: (fromPath: string, toPath: string, context: string) => Promise<ProposalResult>
  }
  recall: { get: () => Promise<RecallItem[]> }
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
    generateArtifact: (topic: string, persona: Persona) => Promise<ArtifactResult>
    answerQuestion: (question: string) => Promise<GroundedAnswerResult>
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
  }
}
