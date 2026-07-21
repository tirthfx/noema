import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, Brain, ChatCircleDots, Check, ClockCounterClockwise, FilePlus, FileText, FolderOpen, House,
  Link as LinkIcon, ListChecks, MagnifyingGlass, MonitorPlay, Pause, Play, Plus, Sparkle,
  Stop, Trash, Waveform, X
} from '@phosphor-icons/react'
import type {
  ActivityEvent, AgentResult, Artifact, CaptureKind, ContextSelection, ConversationTurn, CorpusNote, DisplaySource, FocusSession, GroundedAnswer, IndexProgress,
  NoteProposal, NoteSummary, Persona, PersistedChatTurn, RecallItem, ReviewItem, SessionContinuity, SuggestedPrompt, ToolCallActivity, VaultSelection, WorkspaceSessionState, TimelineEvent
} from '../shared/types'
import { buildFocusRecap, buildMeetingReviewItems, buildReviewItems, buildSessionRecap, buildSuggestedPrompts } from '../shared/workspace'
import AnswerView from './components/AnswerView'
import ArtifactView from './components/ArtifactView'
import CorpusOverview from './components/CorpusOverview'
import CorpusOnboarding from './components/CorpusOnboarding'
import EditablePreview from './components/EditablePreview'
import ToolCallIndicator from './components/ToolCallIndicator'

type WorkspaceMode = 'today' | 'ask' | 'create' | 'review' | 'capture' | 'library'
type ChatEntry =
  | { kind: 'question'; id: string; text: string }
  | { kind: 'tool'; value: ToolCallActivity }
  | { kind: 'answer'; id: string; value: GroundedAnswer; question: string }
type ChatError = AgentResult & { prompt: string }

const NAV = [
  { id: 'today' as const, label: 'Today', icon: House },
  { id: 'ask' as const, label: 'Ask', icon: ChatCircleDots },
  { id: 'create' as const, label: 'Create', icon: Sparkle },
  { id: 'review' as const, label: 'Review', icon: ListChecks },
  { id: 'capture' as const, label: 'Capture', icon: FilePlus },
  { id: 'library' as const, label: 'Library', icon: Archive }
]

const TITLES: Record<WorkspaceMode, { eyebrow: string; title: string; description: string }> = {
  today: { eyebrow: 'DAILY ORIENTATION', title: 'What deserves your attention?', description: 'Continue a thread, close a knowledge gap, or recover something worth remembering.' },
  ask: { eyebrow: 'CONVERSATION + MEMORY', title: 'Ask Noema anything', description: 'Noema interprets the conversation, chooses the right evidence mode, and can research your corpus, selected local context, or the live web.' },
  create: { eyebrow: 'ARTIFACT STUDIO', title: 'Turn notes into an argument', description: 'Create a literature review that exposes evidence, tensions, and missing ground.' },
  review: { eyebrow: 'KNOWLEDGE RECOVERY', title: 'Strengthen what is fading', description: 'Review open loops from your own notes, then mark them resolved.' },
  capture: { eyebrow: 'INBOX TO KNOWLEDGE', title: 'Bring something into your corpus', description: 'Noema drafts and files it. Nothing is written until you approve the exact note.' },
  library: { eyebrow: 'SOURCE OF TRUTH', title: 'Your indexed library', description: 'Inspect what Noema can actually search, cite, and connect.' }
}

function answerText(answer: GroundedAnswer): string {
  return answer.plainText ?? answer.notice ?? answer.claims.map((claim) => claim.text).join('\n')
}

function chatHistory(entries: ChatEntry[]): ConversationTurn[] {
  return entries.flatMap((entry): ConversationTurn[] => {
    if (entry.kind === 'question') return [{ role: 'user', content: entry.text }]
    if (entry.kind !== 'answer') return []
    const content = answerText(entry.value)
    return content ? [{ role: 'assistant', content }] : []
  }).slice(-8)
}

/** Distil the live conversation into a bounded, serializable transcript for durable restore. */
function persistConversation(entries: ChatEntry[]): PersistedChatTurn[] {
  return entries.flatMap((entry): PersistedChatTurn[] => {
    if (entry.kind === 'question') return [{ role: 'user', content: entry.text }]
    if (entry.kind !== 'answer') return []
    const content = answerText(entry.value)
    return content ? [{ role: 'assistant', content, mode: entry.value.mode }] : []
  }).slice(-40)
}

/** Rebuild displayable chat entries from a restored transcript (tool logs are not persisted). */
function restoreConversation(turns: PersistedChatTurn[]): ChatEntry[] {
  return turns.map((turn): ChatEntry => turn.role === 'user'
    ? { kind: 'question', id: crypto.randomUUID(), text: turn.content }
    : { kind: 'answer', id: crypto.randomUUID(), question: '', value: { claims: [], mode: turn.mode ?? 'conversation', plainText: turn.content } })
}

const WORKSPACE_MODES = new Set<WorkspaceMode>(['today', 'ask', 'create', 'review', 'capture', 'library'])

function WindowsControls() {
  if (!navigator.userAgent.includes('Windows')) return null
  return <div className="window-controls" aria-label="Window controls">
    <button aria-label="Minimize window" onClick={() => void window.noema.window.minimize()}>−</button>
    <button aria-label="Maximize window" onClick={() => void window.noema.window.toggleMaximize()}>□</button>
    <button className="close-control" aria-label="Close window" onClick={() => void window.noema.window.close()}>×</button>
  </div>
}

function PromptSuggestions({ prompts, onChoose }: { prompts: SuggestedPrompt[]; onChoose: (prompt: string) => void }) {
  return <div className="prompt-stack">{prompts.map((item) => (
    <button className="prompt-row" key={item.id} onClick={() => onChoose(item.prompt)}>
      <span><strong>{item.label}</strong><small>{item.prompt}</small></span>
      <span className="prompt-reason">{item.reason}</span>
    </button>
  ))}</div>
}

function FocusPanel({
  sessions, recalls, onSave, onDelete, onProposal
}: {
  sessions: FocusSession[]
  recalls: RecallItem[]
  onSave: (session: FocusSession) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onProposal: (session: FocusSession) => Promise<void>
}) {
  const [context, setContext] = useState('')
  const [checkpoint, setCheckpoint] = useState('')
  const [active, setActive] = useState<FocusSession | null>(null)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<DisplaySource[]>([])
  const [sourceId, setSourceId] = useState('')
  const stream = useRef<MediaStream | null>(null)
  const activeRef = useRef<FocusSession | null>(null)

  useEffect(() => {
    window.noema.focus.sources().then((items) => { setSources(items); setSourceId((current) => current || items[0]?.id || '') }).catch(() => setError('Noema could not list screens and windows on this device.'))
  }, [])

  async function start(): Promise<void> {
    if (!context.trim() || !sourceId) return
    setError(null)
    try {
      await window.noema.focus.selectSource(sourceId)
      const selected = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      stream.current = selected
      const session: FocusSession = { id: crypto.randomUUID(), context: context.trim(), startedAt: new Date().toISOString(), checkpoints: [], relatedNotes: [] }
      activeRef.current = session
      setActive(session)
      selected.getVideoTracks()[0]?.addEventListener('ended', () => void finish(activeRef.current ?? session, selected))
    } catch (reason) {
      setError(reason instanceof Error && reason.name !== 'NotAllowedError' ? reason.message : 'Screen selection was cancelled. Nothing was recorded.')
    }
  }

  function togglePause(): void {
    if (!stream.current) return
    const next = !paused
    stream.current.getVideoTracks().forEach((track) => { track.enabled = !next })
    setPaused(next)
  }

  function addCheckpoint(): void {
    if (!active || !checkpoint.trim()) return
    const next = { ...active, checkpoints: [...active.checkpoints, checkpoint.trim()] }
    activeRef.current = next
    setActive(next)
    setCheckpoint('')
  }

  async function finish(snapshot = active, selected = stream.current): Promise<void> {
    if (!snapshot) return
    selected?.getTracks().forEach((track) => track.stop())
    const words = `${snapshot.context} ${snapshot.checkpoints.join(' ')}`.toLowerCase().split(/\W+/).filter((word) => word.length > 4)
    const ranked = recalls.map((note) => ({ note, score: words.filter((word) => `${note.title} ${note.excerpt}`.toLowerCase().includes(word)).length }))
      .sort((a, b) => b.score - a.score).filter((item) => item.score > 0).slice(0, 3).map((item) => item.note)
    const ended: FocusSession = { ...snapshot, endedAt: new Date().toISOString(), relatedNotes: ranked }
    ended.recap = buildFocusRecap(ended)
    await onSave(ended)
    activeRef.current = null
    stream.current = null
    setActive(null); setPaused(false); setContext('')
  }

  const latest = sessions[0]
  return <section className="focus-panel">
    <div className="section-heading"><div><p className="section-kicker">FOCUS MEMORY</p><h2>Remember the work, not the screen</h2></div><span className="local-badge">LOCAL</span></div>
    {active ? <div className="active-focus">
      <div className="recording-line"><span className="recording-dot" /><strong>{paused ? 'Paused' : 'Session active'}</strong><span>{active.context}</span></div>
      <div className="checkpoint-row"><input value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addCheckpoint() }} placeholder="Add a checkpoint: what changed or what might you forget?" /><button onClick={addCheckpoint} disabled={!checkpoint.trim()} aria-label="Add checkpoint"><Plus size={17} /></button></div>
      {active.checkpoints.length > 0 && <ol className="checkpoint-list">{active.checkpoints.map((item) => <li key={item}>{item}</li>)}</ol>}
      <div className="focus-actions"><button className="quiet-button" onClick={togglePause}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Resume' : 'Pause'}</button><button className="primary-action" onClick={() => void finish()}><Stop size={16} weight="fill" />Finish session</button></div>
    </div> : <>
      <p className="focus-copy">Choose one screen or window. Noema stores only the context and checkpoints you add, then reconnects them to your corpus locally.</p>
      <div className="focus-source"><label htmlFor="focus-source">VISIBLE SOURCE</label><select id="focus-source" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Choose a screen or window</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></div>
      <div className="focus-start"><input value={context} onChange={(event) => setContext(event.target.value)} placeholder="What are you working on?" /><button className="primary-action" onClick={() => void start()} disabled={!context.trim() || !sourceId}><MonitorPlay size={17} />Start focus session</button></div>
      {error && <p className="inline-notice" role="status">{error}</p>}
    </>}
    {latest && !active && <article className="focus-recap">
      <div><p className="section-kicker">LAST SESSION</p><h3>{latest.context}</h3><p>{latest.checkpoints.length} checkpoints · {latest.relatedNotes.length} related notes</p></div>
      <div className="row-actions"><button className="icon-button" aria-label="Read recap aloud" onClick={() => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(latest.recap ?? buildFocusRecap(latest))) }}><Waveform size={18} /></button><button className="quiet-button" onClick={() => void onProposal(latest)}>Save recap</button><button className="icon-button danger" aria-label="Delete focus session" onClick={() => void onDelete(latest.id)}><Trash size={17} /></button></div>
    </article>}
  </section>
}

interface TimelineFeedProps {
  events: TimelineEvent[]
  onReveal: (path: string) => void
}

function TimelineFeed({ events, onReveal }: TimelineFeedProps) {
  return (
    <section className="timeline-section">
      <div className="section-heading">
        <div>
          <p className="section-kicker">PRIVATE MEMORY</p>
          <h2>Work Timeline</h2>
        </div>
        <span className="local-badge">LOCAL ONLY</span>
      </div>
      <div className="timeline-list">
        {events.map((event) => (
          <div key={event.id} className="timeline-card">
            <div className="timeline-marker">
              <span className={`timeline-dot type-${event.type}`} />
              <div className="timeline-connector" />
            </div>
            <div className="timeline-event-content">
              <div className="timeline-header-row">
                <span className="timeline-time">
                  {new Date(event.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="timeline-type-tag">{event.type}</span>
              </div>
              <h4>{event.title}</h4>
              <p>{event.subtitle}</p>
              {event.excerpt && <blockquote className="timeline-excerpt">{event.excerpt}</blockquote>}
              {event.path && (
                <button className="text-button timeline-open" onClick={() => onReveal(event.path!)}>
                  Open note
                </button>
              )}
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <p className="empty-copy">Your work memory is empty. Start a focus session or capture notes.</p>
        )}
      </div>
    </section>
  )
}

export default function App() {
  if (!window.noema) return <main className="browser-notice">Open Noema from the desktop app.</main>
  const [vault, setVault] = useState<VaultSelection | null>(null)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [mode, setMode] = useState<WorkspaceMode>('today')
  const [recalls, setRecalls] = useState<RecallItem[]>([])
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [sessions, setSessions] = useState<FocusSession[]>([])
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [corpus, setCorpus] = useState<CorpusNote[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [continuity, setContinuity] = useState<SessionContinuity | null>(null)
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([])
  const hydrated = useRef(false)
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [draft, setDraft] = useState('')
  const [selectedContext, setSelectedContext] = useState<ContextSelection[]>([])
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<ChatError | null>(null)
  const [topic, setTopic] = useState('')
  const [persona, setPersona] = useState<Persona>('Academic')
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [generating, setGenerating] = useState(false)
  const [captureKind, setCaptureKind] = useState<'url' | 'text' | 'meeting'>('url')
  const [captureValue, setCaptureValue] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<NoteProposal | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [linkFrom, setLinkFrom] = useState('')
  const [linkTo, setLinkTo] = useState('')
  const [linkContext, setLinkContext] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const initialized = useRef(false)
  const askInput = useRef<HTMLTextAreaElement>(null)

  async function hydrate(saved: VaultSelection): Promise<void> {
    const [nextRecalls, storedReview, storedSessions, nextNotes, nextTimeline] = await Promise.all([
      window.noema.recall.get(),
      window.noema.review.get(),
      window.noema.focus.get(),
      window.noema.tools.listNotes(),
      window.noema.recall.getTimeline()
    ])
    setRecalls(nextRecalls); setSessions(storedSessions); setNotes(nextNotes); setTimeline(nextTimeline)
    const nextReview = storedReview.length ? storedReview : buildReviewItems(nextRecalls)
    setReviewItems(nextReview)
    if (!storedReview.length) await window.noema.review.save(nextReview)
  }

  useEffect(() => {
    const removeProgress = window.noema.index.onProgress(setIndexProgress)
    const removeActivity = window.noema.agent.onToolCallActivity((activity) => setEntries((current) => {
      const index = current.findIndex((entry) => entry.kind === 'tool' && entry.value.id === activity.id)
      return index === -1 ? [...current, { kind: 'tool', value: activity }] : current.map((entry, position) => position === index ? { kind: 'tool', value: activity } : entry)
    }))
    const removeQuickAsk = window.noema.app.onQuickAsk(() => {
      setMode('ask')
      requestAnimationFrame(() => askInput.current?.focus())
    })
    if (!initialized.current) {
      initialized.current = true
      // Fetched once per launch (not inside hydrate, which also runs on corpus switches
      // and imports mid-session) so "since you were last here" reflects the last app
      // session, not the last time any workspace data happened to refresh.
      void (async () => {
        try {
          // getSaved refreshes the index first; continuity can then reuse that corpus snapshot
          // instead of triggering a second startup walk.
          const saved = await window.noema.vault.getSaved()
          setVault(saved)
          if (saved) {
            const [, , session] = await Promise.all([
              hydrate(saved),
              window.noema.recall.getContinuity().then(setContinuity).catch(() => setContinuity(null)),
              window.noema.session.get().catch(() => null)
            ])
            if (session) restoreSession(session)
          }
        } catch (reason) {
          setLaunchError(reason instanceof Error ? reason.message : 'Noema could not open the saved corpus.')
          setContinuity(null)
        } finally {
          setIndexProgress(null)
          setLoading(false)
          // Only allow persistence to overwrite the stored session AFTER restore has run, so a
          // slow launch cannot clobber last session's transcript with an empty one.
          hydrated.current = true
        }
      })()
    }
    return () => { removeProgress(); removeActivity(); removeQuickAsk() }
  }, [])

  // Durable session persistence (debounced). Conversation, active section, and selected-context
  // METADATA survive restart; capability tokens never do (re-authorized on next use).
  useEffect(() => {
    if (!hydrated.current || !vault) return
    const handle = setTimeout(() => {
      const state: WorkspaceSessionState = {
        updatedAt: new Date().toISOString(),
        activeMode: mode,
        conversation: persistConversation(entries),
        selectedContext: selectedContext.map((item) => ({ name: item.name, kind: item.kind, displayPath: item.displayPath })),
        recentActivity
      }
      void window.noema.session.save(state).catch(() => undefined)
    }, 400)
    return () => clearTimeout(handle)
  }, [entries, mode, selectedContext, recentActivity, vault])

  function restoreSession(session: WorkspaceSessionState): void {
    if (WORKSPACE_MODES.has(session.activeMode as WorkspaceMode)) setMode(session.activeMode as WorkspaceMode)
    if (session.conversation.length) setEntries(restoreConversation(session.conversation))
    // Restored context chips are shown for continuity but marked stale: the read grant expired
    // with the previous process, so they must be reconnected before Noema will read them again.
    if (session.selectedContext.length) {
      setSelectedContext(session.selectedContext.map((item) => ({ id: `stale:${item.displayPath}`, name: item.name, kind: item.kind, displayPath: item.displayPath, stale: true })))
    }
    setRecentActivity(session.recentActivity)
  }

  function logActivity(event: Omit<ActivityEvent, 'id' | 'at'> & { id?: string }): void {
    const full: ActivityEvent = { id: event.id ?? crypto.randomUUID(), at: new Date().toISOString(), kind: event.kind, title: event.title, detail: event.detail, path: event.path }
    setRecentActivity((current) => [full, ...current.filter((item) => item.id !== full.id)].slice(0, 30))
    void window.noema.session.logActivity(full).catch(() => undefined)
  }

  const prompts = useMemo(() => buildSuggestedPrompts({ noteCount: vault?.indexStatus?.indexedNotes ?? 0, recalls, reviewItems, focusSessions: sessions }), [vault?.indexStatus?.indexedNotes, recalls, reviewItems, sessions])
  const meta = TITLES[mode]
  const progressText = indexProgress ? `Indexing ${indexProgress.processedFiles} of ${indexProgress.totalFiles}` : null

  async function chooseVault(): Promise<void> {
    setSelecting(true); setLaunchError(null)
    try { const selected = await window.noema.vault.choose(); if (selected) { setVault(selected); setMode('today'); setEntries([]); setSelectedContext([]); setRecentActivity([]); await hydrate(selected) } }
    catch (reason) { setLaunchError(reason instanceof Error ? reason.message : 'Noema could not connect that folder.') }
    finally { setSelecting(false); setIndexProgress(null) }
  }

  async function createCorpus(): Promise<void> {
    setSelecting(true); setLaunchError(null)
    try {
      const selected = await window.noema.vault.createCorpus()
      setVault(selected); setMode('today'); setEntries([]); setSelectedContext([]); setRecentActivity([]); await hydrate(selected)
    } catch (reason) { setLaunchError(reason instanceof Error ? reason.message : 'Noema could not create your local corpus.') }
    finally { setSelecting(false); setIndexProgress(null) }
  }

  async function importSources(): Promise<void> {
    if (importing || !vault) return
    setImporting(true)
    try {
      const result = await window.noema.vault.importFiles()
      if (result.indexStatus) setVault({ ...vault, indexStatus: result.indexStatus })
      await Promise.all([loadLibrary(), hydrate(vault)])
      if (result.imported.length) setNotice(`Added ${result.imported.length} source${result.imported.length === 1 ? '' : 's'} to your corpus.`)
      else if (result.skipped.length) setNotice(result.skipped[0].reason)
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Noema could not add those sources.') }
    finally { setImporting(false); setIndexProgress(null) }
  }

  function askPrompt(prompt: string): void { setMode('ask'); void send(prompt) }
  /** Only freshly-authorized selections carry a live read grant; stale restored chips do not. */
  function activeContext(): ContextSelection[] { return selectedContext.filter((item) => !item.stale) }
  async function send(prompt = draft): Promise<void> {
    const question = prompt.trim(); if (!question || sending) return
    if (selectedContext.some((item) => item.stale) && activeContext().length === 0) {
      setNotice('Your attached context from last session needs to be reconnected before Noema can read it.')
    }
    const history = chatHistory(entries)
    setDraft(''); setSending(true); setChatError(null)
    setEntries((current) => [...current, { kind: 'question', id: crypto.randomUUID(), text: question }])
    try {
      const result = await window.noema.agent.answerQuestion(question, history, activeContext())
      if (result.answer) {
        setEntries((current) => [...current, { kind: 'answer', id: crypto.randomUUID(), value: result.answer!, question }])
        logActivity({ kind: 'answer', title: question.slice(0, 120), detail: `Answered via ${result.answer.mode ?? 'conversation'}` })
      } else setChatError({ ...result, prompt: question })
    } catch (reason) { setChatError({ prompt: question, error: reason instanceof Error ? reason.message : 'Noema could not answer right now.', retryable: true }) }
    finally { setSending(false) }
  }

  async function chooseContext(kind: 'file' | 'folder', resumeQuestion?: string): Promise<void> {
    if (sending) return
    setChatError(null)
    try {
      const selection = await window.noema.context.pick(kind)
      if (!selection) return
      const next = [...selectedContext.filter((item) => item.displayPath !== selection.displayPath), selection].slice(-4)
      setSelectedContext(next)
      if (!resumeQuestion) return
      setSending(true)
      const result = await window.noema.agent.answerQuestion(resumeQuestion, chatHistory(entries), next.filter((item) => !item.stale))
      if (result.answer) setEntries((current) => [...current, { kind: 'answer', id: crypto.randomUUID(), value: result.answer!, question: resumeQuestion }])
      else setChatError({ ...result, prompt: resumeQuestion })
    } catch (reason) {
      setChatError({ prompt: resumeQuestion ?? draft, error: reason instanceof Error ? reason.message : 'Noema could not read that context.', retryable: true })
    } finally {
      if (resumeQuestion) setSending(false)
    }
  }

  /** Local, offline recap of the durable session — surfaced in Ask, savable via the approval gate. */
  function recapSession(): void {
    const recap = buildSessionRecap({ conversation: persistConversation(entries), recentActivity, openReview: reviewItems.filter((item) => item.status === 'open') })
    setMode('ask')
    setEntries((current) => [...current, { kind: 'answer', id: crypto.randomUUID(), question: 'Recap this session', value: { claims: [], mode: 'context', plainText: recap, approach: ['Built a local recap from this session’s conversation, actions, and open review loops — no model call.'] } }])
  }

  async function addQuestionToReview(question: string): Promise<void> {
    const item: ReviewItem = { id: crypto.randomUUID(), title: 'Investigate an open question', detail: question, prompt: question, sourcePaths: [], status: 'open' }
    const next = [item, ...reviewItems]; setReviewItems(next); await window.noema.review.save(next); setNotice('Added to Review.')
  }

  async function toggleReview(id: string): Promise<void> {
    const next = reviewItems.map((item) => item.id === id ? { ...item, status: item.status === 'open' ? 'done' as const : 'open' as const } : item)
    setReviewItems(next); await window.noema.review.save(next)
  }

  async function runArtifact(event: FormEvent): Promise<void> {
    event.preventDefault(); if (!topic.trim() || generating) return
    setGenerating(true); setArtifact(null); setChatError(null)
    try { const result = await window.noema.agent.generateArtifact(topic.trim(), persona); if (result.artifact) { setArtifact(result.artifact); logActivity({ kind: 'artifact', title: result.artifact.title || `Review: ${topic.trim().slice(0, 80)}`, detail: `${persona} literature review` }) } else setChatError({ ...result, prompt: topic }) }
    finally { setGenerating(false) }
  }

  async function runCapture(event: FormEvent): Promise<void> {
    event.preventDefault(); if (capturing) return
    setCapturing(true); setCaptureError(null); setProposal(null)
    try {
      const result = linkMode
        ? await window.noema.capture.proposeLink(linkFrom, linkTo, linkContext)
        : captureKind === 'meeting'
        ? await window.noema.capture.proposeMeeting(captureValue)
        : await window.noema.capture.propose({ kind: captureKind as CaptureKind, value: captureValue })
      if (result.proposal) setProposal(result.proposal); else setCaptureError(result.error ?? 'Noema could not create a draft.')
    } catch (reason) { setCaptureError(reason instanceof Error ? reason.message : 'Noema could not create a draft.') }
    finally { setCapturing(false) }
  }

  async function loadLibrary(): Promise<void> { setCorpus(await window.noema.index.getCorpus()) }
  function switchMode(next: WorkspaceMode): void { setMode(next); setNotice(null); if (next === 'library') void loadLibrary() }
  
  async function saveFocus(session: FocusSession): Promise<void> {
    await window.noema.focus.save(session)
    setSessions(await window.noema.focus.get())
    setTimeline(await window.noema.recall.getTimeline())
  }
  
  async function deleteFocus(id: string): Promise<void> {
    await window.noema.focus.delete(id)
    setSessions(await window.noema.focus.get())
    setTimeline(await window.noema.recall.getTimeline())
  }
  
  async function proposeFocus(session: FocusSession): Promise<void> { const result = await window.noema.focus.proposeRecap(session); if (result.proposal) setProposal(result.proposal) }
  
  function written(path: string, actionItems?: string[]): void {
    setProposal(null)
    setNotice(`Saved ${path} to your corpus.`)
    logActivity({ kind: 'note', title: `Saved note: ${path.split('/').pop() ?? path}`, detail: path, path })
    void window.noema.tools.listNotes().then(setNotes)
    void window.noema.recall.getTimeline().then(setTimeline)
    if (actionItems && actionItems.length > 0) {
      const items = buildMeetingReviewItems(actionItems, path)
      const next = [...items, ...reviewItems]
      setReviewItems(next)
      void window.noema.review.save(next)
    }
  }

  if (loading || !vault) return <CorpusOnboarding loading={loading} busy={selecting} progress={progressText} error={launchError} onCreate={() => void createCorpus()} onConnect={() => void chooseVault()} />

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="drag-region" />
      <div className="brand-lockup"><Brain size={20} weight="duotone" /><span>Noema</span></div>
      <nav aria-label="Knowledge workspaces">{NAV.map(({ id, label, icon: Icon }) => <button key={id} aria-current={mode === id ? 'page' : undefined} onClick={() => switchMode(id)}><Icon size={17} /><span>{label}</span>{id === 'review' && reviewItems.some((item) => item.status === 'open') && <em>{reviewItems.filter((item) => item.status === 'open').length}</em>}</button>)}</nav>
      <div className="vault-foot"><p>{vault.name ?? vault.vaultPath.split(/[\\/]/).filter(Boolean).pop()}</p><span>{progressText ?? `${vault.indexStatus?.indexedNotes ?? 0} notes · ${vault.kind === 'noema' ? 'owned corpus' : 'connected folder'}`}</span><button onClick={() => void chooseVault()} disabled={selecting}>Switch corpus</button></div>
    </aside>
    <section className="main">
      <header className="topbar"><div><p>{meta.eyebrow}</p><h1>{meta.title}</h1></div><div className="topbar-status"><kbd>{navigator.userAgent.includes('Mac') ? '⌘⇧Space' : 'Ctrl Shift Space'}</kbd><span className="status-dot" />Corpus ready</div><WindowsControls /></header>
      {vault.indexStatus?.error && <div className="service-notice" role="status"><strong>Search is using the last healthy index.</strong><span>{vault.indexStatus.error.split(' Response:')[0]}</span><button onClick={() => void window.noema.index.rebuild().then((status) => setVault({ ...vault, indexStatus: status }))}>Retry index</button></div>}
      {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice(null)}><X size={15} /></button></div>}
      <div className="workspace-scroll">
        <div className="workspace-intro"><p>{meta.description}</p>{mode === 'today' && continuity && <p className="continuity-note"><ClockCounterClockwise size={13} />Since you were last here ({new Date(continuity.previousVisitAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}): {continuity.changedNotes === 0 ? 'no notes have changed.' : `${continuity.changedNotes} note${continuity.changedNotes === 1 ? '' : 's'} changed.`}</p>}</div>

        {mode === 'today' && recentActivity.length > 0 && <section className="resume-panel">
          <div className="section-heading"><div><p className="section-kicker">PICK UP WHERE YOU LEFT OFF</p><h2>Recent activity</h2></div><div className="row-actions"><button className="quiet-button" onClick={recapSession}><ClockCounterClockwise size={15} />Recap session</button><span className="local-badge">RESTORED</span></div></div>
          <div className="resume-list">
            {recentActivity.slice(0, 6).map((event) => <button key={event.id} className="resume-row" onClick={() => { if (event.path) void window.noema.vault.revealNote(event.path); else if (event.kind === 'answer') { setMode('ask') } }}>
              <span className={`resume-dot kind-${event.kind}`} />
              <span className="resume-copy"><strong>{event.title}</strong>{event.detail && <small>{event.detail}</small>}</span>
              <span className="resume-time">{new Date(event.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </button>)}
          </div>
        </section>}

        {mode === 'today' && <div className="today-grid">
          <section className="today-primary"><div className="section-heading"><div><p className="section-kicker">NEXT MOVES</p><h2>Start from what Noema already knows</h2></div><span>{prompts.length} suggestions</span></div><PromptSuggestions prompts={prompts} onChoose={askPrompt} /></section>
          <aside className="today-review"><div className="section-heading"><div><p className="section-kicker">REVIEW QUEUE</p><h2>Open loops</h2></div><button className="text-button" onClick={() => switchMode('review')}>View all</button></div>{reviewItems.filter((item) => item.status === 'open').slice(0, 3).map((item) => <button className="mini-review" key={item.id} onClick={() => askPrompt(item.prompt)}><ClockCounterClockwise size={16} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}{!reviewItems.some((item) => item.status === 'open') && <p className="empty-copy">No open reviews. Capture or ask something new.</p>}</aside>
          <FocusPanel sessions={sessions} recalls={recalls} onSave={saveFocus} onDelete={deleteFocus} onProposal={proposeFocus} />
          <div className="focus-panel timeline-panel">
            <TimelineFeed events={timeline} onReveal={(path) => void window.noema.vault.revealNote(path)} />
          </div>
        </div>}

        {mode === 'ask' && <div className="ask-layout">
          <div className="conversation">
            {entries.length === 0 && <PromptSuggestions prompts={prompts} onChoose={(prompt) => void send(prompt)} />}
            {entries.map((entry) => entry.kind === 'question'
              ? <article className="question" key={entry.id}><p>{entry.text}</p></article>
              : entry.kind === 'tool'
                ? <ToolCallIndicator key={entry.value.id} activity={entry.value} />
                : <article className="answer-block" key={entry.id}>
                  <AnswerView answer={entry.value} onChooseContext={(kind) => void chooseContext(kind, entry.question)} />
                  {!entry.value.contextRequest && entry.value.mode !== 'conversation' && entry.value.mode !== 'clarification' && <div className="answer-actions">
                    <button onClick={() => void addQuestionToReview(entry.question)}><ListChecks size={15} />Review later</button>
                    <button onClick={() => { setMode('create'); setTopic(entry.question) }}><Sparkle size={15} />Create from this</button>
                    {entry.value.mode === 'web' && entry.value.webSources?.[0] && <button onClick={() => { setMode('capture'); setCaptureKind('url'); setCaptureValue(entry.value.webSources![0].url) }}><FilePlus size={15} />Save source</button>}
                    {entry.value.mode === 'context' && entry.value.plainText && <button onClick={() => { setLinkMode(false); setMode('capture'); setCaptureKind('text'); setCaptureValue(entry.value.plainText!) }}><FilePlus size={15} />Save to corpus</button>}
                  </div>}
                </article>)}
            {sending && <div className="thinking"><span /><span /><span />Thinking with the right context</div>}
            {chatError && <div className="agent-error" role="alert"><strong>Answer unavailable</strong><p>{chatError.error?.split(' Response:')[0]}</p><button className="quiet-button" onClick={() => void send(chatError.prompt)}>Try again</button></div>}
          </div>
          <form className="ask-composer" onSubmit={(event) => { event.preventDefault(); void send() }}>
            {selectedContext.length > 0 && <div className="context-strip" aria-label="Selected context">
              {selectedContext.map((item) => <span className={`context-chip${item.stale ? ' stale' : ''}`} key={item.id} title={item.stale ? `${item.displayPath} — reconnect to re-authorize access` : item.displayPath}>
                {item.kind === 'file' ? <FileText size={13} /> : <FolderOpen size={13} />}
                <span>{item.name}</span>
                {item.stale && <button type="button" className="reconnect" onClick={() => void chooseContext(item.kind)}>Reconnect</button>}
                <button type="button" aria-label={`Remove ${item.name}`} onClick={() => setSelectedContext((current) => current.filter((candidate) => candidate.id !== item.id))}><X size={12} /></button>
              </span>)}
            </div>}
            <div className="composer-input">
              <textarea ref={askInput} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder="Ask anything — refer to your notes or attach local context" rows={2} />
              <button className="primary-action" disabled={!draft.trim() || sending}>Ask Noema</button>
            </div>
            <div className="composer-meta">
              <div className="context-picker-actions">
                <button type="button" onClick={() => void chooseContext('file')}><FileText size={13} />File</button>
                <button type="button" onClick={() => void chooseContext('folder')}><FolderOpen size={13} />Folder</button>
              </div>
              <p><MagnifyingGlass size={13} />Noema chooses conversation, selected context, your corpus, or live web research.</p>
            </div>
          </form>
        </div>}

        {mode === 'create' && <div className="studio-layout"><form className="studio-form" onSubmit={(event) => void runArtifact(event)}><label htmlFor="topic">TOPIC OR QUESTION</label><textarea id="topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What argument should Noema build from your corpus?" rows={4} /><label htmlFor="persona">VOICE</label><select id="persona" value={persona} onChange={(event) => setPersona(event.target.value as Persona)}><option>Academic</option><option>Socratic Critic</option><option>Plain-Language</option></select><button className="primary-action" disabled={!topic.trim() || generating}>{generating ? 'Checking sources...' : 'Build literature review'}</button><p>Noema only renders claims whose cited passage can be verified in the named note.</p></form><div className="artifact-stage">{artifact ? <ArtifactView artifact={artifact} /> : <div className="stage-empty"><Sparkle size={25} /><h2>Your artifact will appear here</h2><p>Claims, citations, and genuine tensions are separated so you can inspect the reasoning.</p></div>}{chatError && <div className="agent-error" role="alert"><strong>Review unavailable</strong><p>{chatError.error?.split(' Response:')[0]}</p></div>}</div></div>}

        {mode === 'review' && <section className="review-list"><div className="review-summary"><strong>{reviewItems.filter((item) => item.status === 'open').length}</strong><span>open loops</span><p>These are not notifications. They are ideas worth retrieving before they fade.</p></div>{reviewItems.map((item, index) => <article className={`review-row ${item.status}`} key={item.id}><span className="review-index">{String(index + 1).padStart(2, '0')}</span><div><p className="section-kicker">{item.status === 'open' ? 'READY TO REVIEW' : 'RESOLVED'}</p><h2>{item.title}</h2><p>{item.detail}</p><small>{item.sourcePaths.join(', ') || 'Question captured from Ask'}</small></div><div className="row-actions"><button className="quiet-button" onClick={() => askPrompt(item.prompt)}>Open in Ask</button><button className="icon-button" aria-label={item.status === 'open' ? 'Mark complete' : 'Reopen'} onClick={() => void toggleReview(item.id)}>{item.status === 'open' ? <Check size={17} /> : <ClockCounterClockwise size={17} />}</button></div></article>)}</section>}

        {mode === 'capture' && <div className="capture-layout"><div className="capture-switch"><button aria-pressed={!linkMode} onClick={() => setLinkMode(false)}><FilePlus size={16} />Capture source</button><button aria-pressed={linkMode} onClick={() => setLinkMode(true)}><LinkIcon size={16} />Connect notes</button></div><form className="capture-form" onSubmit={(event) => void runCapture(event)}>{linkMode ? <><div className="field-grid"><label>FROM NOTE<select value={linkFrom} onChange={(event) => setLinkFrom(event.target.value)}><option value="">Choose a note</option>{notes.map((note) => <option key={note.path}>{note.path}</option>)}</select></label><label>TO NOTE<select value={linkTo} onChange={(event) => setLinkTo(event.target.value)}><option value="">Choose a note</option>{notes.map((note) => <option key={note.path}>{note.path}</option>)}</select></label></div><label>WHY THEY CONNECT<textarea value={linkContext} onChange={(event) => setLinkContext(event.target.value)} rows={5} placeholder="Optional context for the link" /></label><button className="primary-action" disabled={!linkFrom || !linkTo || capturing}>{capturing ? 'Preparing edit...' : 'Preview link edit'}</button></> : <><label>CAPTURE TYPE<select value={captureKind} onChange={(event) => setCaptureKind(event.target.value as 'url' | 'text' | 'meeting')}><option value="url">Web page URL</option><option value="text">Pasted text</option><option value="meeting">Meeting transcript</option></select></label><label>SOURCE<textarea value={captureValue} onChange={(event) => setCaptureValue(event.target.value)} rows={9} placeholder={captureKind === 'url' ? 'https://example.com/article' : captureKind === 'meeting' ? 'Paste the meeting transcript or discussion log...' : 'Paste the text you want to remember'} /></label><button className="primary-action" disabled={!captureValue.trim() || capturing}>{capturing ? 'Drafting note...' : 'Create editable draft'}</button></>}{captureError && <p className="inline-notice" role="alert">{captureError}</p>}<p className="approval-note"><Check size={14} /> You approve the path and full Markdown before Noema writes anything.</p></form></div>}

        {mode === 'library' && <div className="library-layout"><div className="library-toolbar"><span><MagnifyingGlass size={15} />Search scope: Markdown notes in this corpus</span><div className="library-actions"><button className="primary-action" onClick={() => void importSources()} disabled={importing}>{importing ? 'Adding sources…' : 'Add files'}</button><button className="quiet-button" onClick={() => void loadLibrary()}>Refresh</button></div></div><CorpusOverview notes={corpus} error={null} /></div>}
      </div>
    </section>
    {proposal && <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Review proposed corpus change"><EditablePreview proposal={proposal} onWritten={(path, actionItems) => written(path, actionItems)} onDiscard={() => setProposal(null)} /></div>}
  </main>
}
