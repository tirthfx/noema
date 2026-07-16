import { FormEvent, useEffect, useRef, useState } from 'react'
import type { AgentResult, Artifact, CaptureKind, CorpusNote, GroundedAnswer, IndexProgress, NoteProposal, NoteSummary, Persona, RecallItem, ToolCallActivity, VaultSelection } from '../shared/types'
import ToolCallIndicator from './components/ToolCallIndicator'
import ArtifactView from './components/ArtifactView'
import AnswerView from './components/AnswerView'
import EditablePreview from './components/EditablePreview'
import RecallCard from './components/RecallCard'
import CorpusOverview from './components/CorpusOverview'

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
type ChatEntry = { kind: 'message'; value: ChatMessage } | { kind: 'tool'; value: ToolCallActivity } | { kind: 'answer'; value: GroundedAnswer }
type ChatError = AgentResult & { prompt: string }

function WindowsControls() {
  if (!navigator.userAgent.includes('Windows')) return null
  return (
    <div className="window-controls" aria-label="Window controls">
      <button aria-label="Minimize window" onClick={() => void window.noema.window.minimize()}>−</button>
      <button aria-label="Maximize window" onClick={() => void window.noema.window.toggleMaximize()}>□</button>
      <button className="close-control" aria-label="Close window" onClick={() => void window.noema.window.close()}>×</button>
    </div>
  )
}

export default function App() {
  if (!window.noema) return <main className="app-shell browser-notice"><p className="status-copy">Open Noema from the desktop app.</p></main>

  const [vault, setVault] = useState<VaultSelection | null>(null)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<ChatError | null>(null)
  const [topic, setTopic] = useState('')
  const [persona, setPersona] = useState<Persona>('Academic')
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [generating, setGenerating] = useState(false)
  const [retryArtifact, setRetryArtifact] = useState(false)
  const [captureKind, setCaptureKind] = useState<CaptureKind>('url')
  const [captureValue, setCaptureValue] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [proposal, setProposal] = useState<NoteProposal | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [writtenPath, setWrittenPath] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [linkFrom, setLinkFrom] = useState('')
  const [linkTo, setLinkTo] = useState('')
  const [linkContext, setLinkContext] = useState('')
  const [recalls, setRecalls] = useState<RecallItem[]>([])
  const [corpusOpen, setCorpusOpen] = useState(false)
  const [corpus, setCorpus] = useState<CorpusNote[]>([])
  const [corpusError, setCorpusError] = useState<string | null>(null)
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    const removeProgressListener = window.noema.index.onProgress(setIndexProgress)
    if (!initialized.current) {
      initialized.current = true
      window.noema.vault.getSaved().then(async (saved) => { setVault(saved); if (saved) setRecalls(await window.noema.recall.get()) }).catch(() => setError('Noema could not read the previously selected vault. Choose it again to continue.')).finally(() => { setIndexProgress(null); setLoading(false) })
    }
    const removeToolListener = window.noema.agent.onToolCallActivity((activity) => {
      setEntries((current) => {
        const existing = current.findIndex((entry) => entry.kind === 'tool' && entry.value.id === activity.id)
        return existing === -1
          ? [...current, { kind: 'tool', value: activity }]
          : current.map((entry) => entry.kind === 'tool' && entry.value.id === activity.id ? { kind: 'tool', value: activity } : entry)
      })
    })
    return () => { removeProgressListener(); removeToolListener() }
  }, [])

  async function chooseVault(): Promise<void> {
    setSelecting(true); setError(null)
    try {
      const selected = await window.noema.vault.choose()
      if (selected) {
        setVault(selected); setEntries([]); setArtifact(null); setProposal(null); setWrittenPath(null); setChatError(null); setLinkFrom(''); setLinkTo(''); setLinkContext(''); setCorpus([]); setCorpusOpen(false)
        setRecalls(await window.noema.recall.get())
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Noema could not save the selected vault configuration.') } finally { setIndexProgress(null); setSelecting(false) }
  }

  async function rebuildIndex(): Promise<void> {
    if (!vault) return
    setRebuilding(true)
    try { setVault({ ...vault, indexStatus: await window.noema.index.rebuild() }); if (corpusOpen) await loadCorpus() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Noema could not rebuild the vault index.') } finally { setIndexProgress(null); setRebuilding(false) }
  }

  async function send(prompt = draft): Promise<void> {
    const message = prompt.trim()
    if (!message || sending) return
    setDraft(''); setSending(true); setChatError(null); setRetryArtifact(false)
    setEntries((current) => [...current, { kind: 'message', value: { id: crypto.randomUUID(), role: 'user', content: message } }])
    try {
      const result = await window.noema.agent.answerQuestion(message)
      const answer = result.answer
      if (answer) setEntries((current) => [...current, { kind: 'answer', value: answer }])
      else setChatError({ ...result, prompt: message })
    } catch (reason) {
      setChatError({ prompt: message, error: reason instanceof Error ? reason.message : 'Noema could not reach NIM for this vault answer. Check the connection and retry.', retryable: true })
    } finally { setSending(false) }
  }

  async function loadNotes(): Promise<void> {
    try { setNotes(await window.noema.tools.listNotes()) } catch { setNotes([]) }
  }

  async function loadCorpus(): Promise<void> {
    setCorpusError(null)
    try { setCorpus(await window.noema.index.getCorpus()) } catch (reason) { setCorpusError(reason instanceof Error ? reason.message : 'Noema could not read the indexed note list from this vault.') }
  }

  function toggleCorpus(): void {
    const opening = !corpusOpen
    setCorpusOpen(opening)
    if (opening) void loadCorpus()
  }

  useEffect(() => { if (vault) void loadNotes() }, [vault?.vaultPath])

  /** Capture proposes a draft only — EditablePreview is the sole route to disk. */
  async function runCapture(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!captureValue.trim() || capturing) return
    setCapturing(true); setCaptureError(null); setProposal(null); setWrittenPath(null)
    try {
      const result = await window.noema.capture.propose({ kind: captureKind, value: captureValue })
      if (result.proposal) setProposal(result.proposal)
      else setCaptureError(result.error ?? 'Noema could not create a capture draft from that content.')
    } catch (reason) {
      setCaptureError(reason instanceof Error ? reason.message : 'Noema could not reach NIM to create this capture draft. Retry when the service is available.')
    } finally { setCapturing(false) }
  }

  async function runLink(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!linkFrom || !linkTo || capturing) return
    setCapturing(true); setCaptureError(null); setProposal(null); setWrittenPath(null)
    try {
      const result = await window.noema.capture.proposeLink(linkFrom, linkTo, linkContext)
      if (result.proposal) setProposal(result.proposal)
      else setCaptureError(result.error ?? 'Noema could not create a link proposal for those notes.')
    } catch (reason) {
      setCaptureError(reason instanceof Error ? reason.message : 'Noema could not read those notes to create a link proposal.')
    } finally { setCapturing(false) }
  }

  function onWritten(path: string): void {
    setProposal(null); setWrittenPath(path); setCaptureValue('')
    void loadNotes()
    if (corpusOpen) void loadCorpus()
    window.noema.index.status().then((status) => setVault((current) => current ? { ...current, indexStatus: status ?? current.indexStatus } : current)).catch(() => undefined)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); void send() }
  async function runArtifact(): Promise<void> {
    if (!topic.trim() || generating) return
    setGenerating(true); setChatError(null); setArtifact(null); setRetryArtifact(false)
    try { const result = await window.noema.agent.generateArtifact(topic, persona); if (result.artifact) setArtifact(result.artifact); else { setRetryArtifact(true); setChatError({ ...result, prompt: topic }) } }
    catch (reason) { setRetryArtifact(true); setChatError({ prompt: topic, error: reason instanceof Error ? reason.message : 'NIM did not return a literature review. Check the connection and retry.', retryable: true }) }
    finally { setGenerating(false) }
  }
  function generateArtifact(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); void runArtifact() }
  const progressText = indexProgress ? `Indexing ${indexProgress.processedFiles} of ${indexProgress.totalFiles} files` : null

  return (
    <main className="app-shell">
      <header className="titlebar"><span className="titlebar-wordmark">NOEMA</span><WindowsControls /></header>
      <section className="content">
        {loading ? <p className="status-copy">{progressText ?? 'Opening your research workspace…'}</p> : vault ? (
          <div className="chat-shell">
            <div className="chat-header"><p className="eyebrow">VAULT CONNECTED</p><div className="vault-header-actions"><p className="index-summary">{progressText ?? (vault.indexStatus ? `${vault.indexStatus.indexedNotes} notes · ${vault.indexStatus.indexedChunks} chunks` : 'Index status unavailable')}</p><button className="secondary-action" onClick={toggleCorpus} aria-expanded={corpusOpen}>{corpusOpen ? 'Hide corpus' : 'Corpus overview'}</button><button className="secondary-action" onClick={() => void chooseVault()} disabled={selecting}>{selecting ? 'Choosing…' : 'Choose another vault'}</button></div></div>
            {error && <div className="index-error"><p className="error-copy" role="alert">{error}</p></div>}
            {vault.indexStatus?.error && <div className="index-error"><p className="error-copy" role="alert">{vault.indexStatus.error}</p><button className="secondary-action" onClick={() => void rebuildIndex()} disabled={rebuilding}>{rebuilding ? (progressText ?? 'Rebuilding index…') : 'Retry indexing'}</button></div>}
            {recalls.length > 0 && <section className="recalls">{recalls.map((item) => <RecallCard item={item} key={item.path} onDismiss={() => setRecalls((current) => current.filter((card) => card.path !== item.path))} />)}</section>}
            <form className="artifact-controls" onSubmit={generateArtifact}><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Literature-review topic" disabled={generating} /><select value={persona} onChange={(event) => setPersona(event.target.value as Persona)} disabled={generating}><option>Academic</option><option>Socratic Critic</option><option>Plain-Language</option></select><button className="secondary-action" disabled={generating || !topic.trim()}>{generating ? 'Contacting NIM…' : 'Generate review'}</button></form>
            <form className="capture-controls" onSubmit={(event) => void runCapture(event)}>
              <label className="sr-only" htmlFor="capture-kind">Capture type</label>
              <select id="capture-kind" value={captureKind} onChange={(event) => setCaptureKind(event.target.value as CaptureKind)} disabled={capturing}><option value="url">URL</option><option value="text">Text</option></select>
              <label className="sr-only" htmlFor="capture-value">Content to capture</label>
              <input id="capture-value" value={captureValue} onChange={(event) => setCaptureValue(event.target.value)} placeholder={captureKind === 'url' ? 'https://example.com/article' : 'Paste text to file as a note'} disabled={capturing} />
              <button className="secondary-action" disabled={capturing || !captureValue.trim()}>{capturing ? 'Drafting…' : 'Capture'}</button>
            </form>
            {notes.length > 1 && (
              <form className="capture-controls link-controls" onSubmit={(event) => void runLink(event)}>
                <label className="sr-only" htmlFor="link-from">Link from note</label>
                <select id="link-from" value={linkFrom} onChange={(event) => setLinkFrom(event.target.value)} disabled={capturing}><option value="">Link from…</option>{notes.map((note) => <option key={note.path} value={note.path}>{note.title}</option>)}</select>
                <label className="sr-only" htmlFor="link-to">Link to note</label>
                <select id="link-to" value={linkTo} onChange={(event) => setLinkTo(event.target.value)} disabled={capturing}><option value="">Link to…</option>{notes.map((note) => <option key={note.path} value={note.path}>{note.title}</option>)}</select>
                <label className="sr-only" htmlFor="link-context">Link context</label>
                <input id="link-context" value={linkContext} onChange={(event) => setLinkContext(event.target.value)} placeholder="Why these connect (optional)" disabled={capturing} />
                <button className="secondary-action" disabled={capturing || !linkFrom || !linkTo}>Propose link</button>
              </form>
            )}
            <div className="message-list" aria-live="polite">
              {corpusOpen && <CorpusOverview notes={corpus} error={corpusError} />}
              {entries.length === 0 && !chatError && <p className="chat-empty">Ask a question about the notes in this vault.</p>}
              {entries.map((entry) => entry.kind === 'message'
                ? <article className={`chat-message ${entry.value.role}`} key={entry.value.id}><p>{entry.value.content}</p></article>
                : entry.kind === 'tool' ? <ToolCallIndicator activity={entry.value} key={entry.value.id} /> : <AnswerView answer={entry.value} key={`answer-${entries.indexOf(entry)}`} />)}
              {artifact && <ArtifactView artifact={artifact} />}
              {captureError && <div className="agent-error" role="alert"><p>{captureError}</p></div>}
              {writtenPath && <p className="capture-written" role="status">Wrote {writtenPath} to your vault.</p>}
              {chatError && <div className="agent-error" role="alert"><p>{chatError.error}</p>{chatError.rawResponse && <pre>{chatError.rawResponse}</pre>}{chatError.retryable && <button className="secondary-action" onClick={() => retryArtifact ? void runArtifact() : void send(chatError.prompt)} disabled={sending || generating}>{retryArtifact ? 'Retry review' : 'Retry message'}</button>}</div>}
            </div>
            {proposal && <div className="preview-overlay"><EditablePreview proposal={proposal} onWritten={onWritten} onDiscard={() => setProposal(null)} /></div>}
            <form className="chat-input" onSubmit={onSubmit}><label className="sr-only" htmlFor="chat-message">Ask about your notes</label><textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your notes…" rows={2} disabled={sending || Boolean(vault.indexStatus?.error)} /><button className="primary-action" type="submit" disabled={sending || !draft.trim() || Boolean(vault.indexStatus?.error)}>{sending ? 'Working…' : 'Send'}</button></form>
          </div>
        ) : <div className="empty-state"><p className="eyebrow">NO VAULT SELECTED</p><p className="status-copy">Choose a vault folder to begin.</p><button className="primary-action" onClick={() => void chooseVault()} disabled={selecting}>{selecting ? 'Opening folder picker…' : 'Choose vault folder'}</button>{error && <p className="error-copy" role="alert">{error}</p>}</div>}
      </section>
    </main>
  )
}
