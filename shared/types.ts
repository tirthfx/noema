export interface VaultConfig {
  vaultPath: string
  name?: string
  kind?: 'noema' | 'folder'
}

export interface VaultSelection {
  vaultPath: string
  name?: string
  kind?: 'noema' | 'folder'
  indexStatus?: IndexStatus
}

export interface CorpusImportResult {
  imported: string[]
  skipped: Array<{ path: string; reason: string }>
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

export interface IndexProgress {
  processedFiles: number
  totalFiles: number
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
export interface CorpusNote extends NoteSummary {
  status: 'indexed' | 'stale' | 'error'
  modifiedAt: string
}
export interface RecallItem extends NoteSummary { excerpt: string }

/** F7: a cheap "since you were last here" signal built on real note mtimes, not agent output. */
export interface SessionContinuity { previousVisitAt: string; changedNotes: number }

export interface SuggestedPrompt {
  id: string
  label: string
  prompt: string
  reason: string
}

export interface ReviewItem {
  id: string
  title: string
  detail: string
  prompt: string
  sourcePaths: string[]
  status: 'open' | 'done'
}

export interface FocusSession {
  id: string
  context: string
  startedAt: string
  endedAt?: string
  checkpoints: string[]
  relatedNotes: RecallItem[]
  recap?: string
}
export interface DisplaySource { id: string; name: string }

export interface ToolCallActivity {
  id: string
  tool: 'search_notes' | 'read_note' | 'list_notes' | 'write_note' | 'link_notes' | 'web_search' | 'read_context'
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
  /** Opaque main-process token required to commit this specific reviewed proposal. */
  approvalId?: string
  path: string
  content: string
  kind: 'new' | 'edit'
  baseContent?: string
  source?: string
  actionItems?: string[]
}

export type CaptureKind = 'text' | 'url'
export interface CaptureInput { kind: CaptureKind; value: string }
export interface ProposalResult extends AgentResult { proposal?: NoteProposal }
export interface WriteResult { ok: boolean; path?: string; error?: string }

export interface TimelineEvent {
  id: string
  timestamp: string
  type: 'focus' | 'capture' | 'note' | 'link'
  title: string
  subtitle: string
  excerpt?: string
  path?: string
}

/**
 * Durable workspace session (F-continuity). Persists enough of the last working session that
 * reopening Noema feels like resuming, WITHOUT persisting security-sensitive capability tokens.
 * Selected context is stored as display metadata only; the read grant is re-requested on use.
 */
export interface SelectedContextMeta { name: string; kind: 'file' | 'folder'; displayPath: string }
export interface PersistedChatTurn {
  role: 'user' | 'assistant'
  content: string
  /** Evidence mode of an assistant turn, so a restored transcript keeps its provenance. */
  mode?: GroundedAnswer['mode']
}
export interface ActivityEvent {
  id: string
  at: string
  kind: 'capture' | 'artifact' | 'focus' | 'meeting' | 'link' | 'note' | 'answer'
  title: string
  detail?: string
  path?: string
}
export interface WorkspaceSessionState {
  updatedAt: string
  activeMode: string
  conversation: PersistedChatTurn[]
  /** Metadata only — never a capability token. Re-authorization is explicit on next use. */
  selectedContext: SelectedContextMeta[]
  recentActivity: ActivityEvent[]
}

export type Persona = 'Academic' | 'Socratic Critic' | 'Plain-Language'
export interface Citation { path: string; quote: string; title: string; url?: string }
export interface ArtifactClaim { text: string; citations: Citation[] }
export interface Artifact { title: string; claims: ArtifactClaim[]; tensions: Array<{ question: string; sides: ArtifactClaim[] }> }
export interface ArtifactResult extends AgentResult { artifact?: Artifact }
export interface RetrievedEvidence { path: string; title: string; excerpt: string; score: number }
export interface ConversationTurn { role: 'user' | 'assistant'; content: string }
export interface ContextSelection {
  id: string
  name: string
  kind: 'file' | 'folder'
  displayPath: string
  /** Restored from a previous session: shown for continuity, but the read grant has expired
   * and must be re-authorized (re-picked) before Noema can read it again. */
  stale?: boolean
}
export interface ContextRequest { reason: string }
export interface WebAnswerSource { title: string; url: string; excerpt: string }
export interface GroundedAnswer {
  claims: ArtifactClaim[]
  mode?: 'corpus' | 'general' | 'conversation' | 'clarification' | 'context' | 'web'
  plainText?: string
  contextRequest?: ContextRequest
  approach?: string[]
  /** Human-readable labels of the selected files/sections that actually grounded this answer. */
  contextFiles?: string[]
  webSources?: WebAnswerSource[]
  refusal?: boolean
  degraded?: boolean
  notice?: string
  evidence?: RetrievedEvidence[]
}
export interface GroundedAnswerResult extends AgentResult { answer?: GroundedAnswer }

export interface NoemaApi {
  vault: {
    getSaved: () => Promise<VaultSelection | null>
    createCorpus: () => Promise<VaultSelection>
    choose: () => Promise<VaultSelection | null>
    importFiles: () => Promise<CorpusImportResult>
    revealNote: (path: string) => Promise<void>
    approveWrite: (proposal: NoteProposal) => Promise<WriteResult>
  }
  capture: {
    propose: (input: CaptureInput) => Promise<ProposalResult>
    proposeLink: (fromPath: string, toPath: string, context: string) => Promise<ProposalResult>
    proposeMeeting: (transcript: string) => Promise<ProposalResult>
  }
  context: {
    pick: (kind: 'file' | 'folder') => Promise<ContextSelection | null>
  }
  session: {
    get: () => Promise<WorkspaceSessionState | null>
    save: (session: WorkspaceSessionState) => Promise<void>
    logActivity: (event: ActivityEvent) => Promise<void>
  }
  recall: {
    get: () => Promise<RecallItem[]>
    getTimeline: () => Promise<TimelineEvent[]>
    getContinuity: () => Promise<SessionContinuity | null>
  }
  review: {
    get: () => Promise<ReviewItem[]>
    save: (items: ReviewItem[]) => Promise<void>
  }
  focus: {
    sources: () => Promise<DisplaySource[]>
    selectSource: (id: string) => Promise<void>
    get: () => Promise<FocusSession[]>
    save: (session: FocusSession) => Promise<FocusSession>
    delete: (id: string) => Promise<void>
    proposeRecap: (session: FocusSession) => Promise<ProposalResult>
  }
  index: {
    status: () => Promise<IndexStatus | null>
    rebuild: () => Promise<IndexStatus>
    getCorpus: () => Promise<CorpusNote[]>
    onProgress: (listener: (progress: IndexProgress) => void) => () => void
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
    answerQuestion: (question: string, history?: ConversationTurn[], context?: ContextSelection[]) => Promise<GroundedAnswerResult>
  }
  app: {
    onQuickAsk: (listener: () => void) => () => void
    openExternal: (url: string) => Promise<void>
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
  }
}
