import { FormEvent, useEffect, useState } from 'react'
import type { AgentResult, ToolCallActivity, VaultSelection } from '../shared/types'
import ToolCallIndicator from './components/ToolCallIndicator'

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
type ChatEntry = { kind: 'message'; value: ChatMessage } | { kind: 'tool'; value: ToolCallActivity }
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

  useEffect(() => {
    window.noema.vault.getSaved().then(setVault).catch(() => setError('Noema could not read the previously selected vault. Choose it again to continue.')).finally(() => setLoading(false))
    return window.noema.agent.onToolCallActivity((activity) => {
      setEntries((current) => {
        const existing = current.findIndex((entry) => entry.kind === 'tool' && entry.value.id === activity.id)
        return existing === -1
          ? [...current, { kind: 'tool', value: activity }]
          : current.map((entry) => entry.kind === 'tool' && entry.value.id === activity.id ? { kind: 'tool', value: activity } : entry)
      })
    })
  }, [])

  async function chooseVault(): Promise<void> {
    setSelecting(true); setError(null)
    try { setVault(await window.noema.vault.choose()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Noema could not save the selected vault.') } finally { setSelecting(false) }
  }

  async function rebuildIndex(): Promise<void> {
    if (!vault) return
    setRebuilding(true)
    try { setVault({ ...vault, indexStatus: await window.noema.index.rebuild() }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Noema could not rebuild the vault index.') } finally { setRebuilding(false) }
  }

  async function send(prompt = draft): Promise<void> {
    const message = prompt.trim()
    if (!message || sending) return
    setDraft(''); setSending(true); setChatError(null)
    setEntries((current) => [...current, { kind: 'message', value: { id: crypto.randomUUID(), role: 'user', content: message } }])
    try {
      const result = await window.noema.agent.sendMessage(message)
      const content = result.content
      if (content) setEntries((current) => [...current, { kind: 'message', value: { id: crypto.randomUUID(), role: 'assistant', content } }])
      else setChatError({ ...result, prompt: message })
    } catch (reason) {
      setChatError({ prompt: message, error: reason instanceof Error ? reason.message : 'Noema could not send this message.', retryable: true })
    } finally { setSending(false) }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); void send() }

  return (
    <main className="app-shell">
      <header className="titlebar"><span className="titlebar-wordmark">NOEMA</span><WindowsControls /></header>
      <section className="content">
        {loading ? <p className="status-copy">Opening your research workspace…</p> : vault ? (
          <div className="chat-shell">
            <div className="chat-header"><p className="eyebrow">VAULT CONNECTED</p><p className="index-summary">{vault.indexStatus ? `${vault.indexStatus.indexedNotes} notes · ${vault.indexStatus.indexedChunks} chunks` : 'Index status unavailable'}</p></div>
            {vault.indexStatus?.error && <div className="index-error"><p className="error-copy" role="alert">{vault.indexStatus.error}</p><button className="secondary-action" onClick={() => void rebuildIndex()} disabled={rebuilding}>{rebuilding ? 'Rebuilding index…' : 'Retry indexing'}</button></div>}
            <div className="message-list" aria-live="polite">
              {entries.length === 0 && !chatError && <p className="chat-empty">Ask a question about the notes in this vault.</p>}
              {entries.map((entry) => entry.kind === 'message'
                ? <article className={`chat-message ${entry.value.role}`} key={entry.value.id}><p>{entry.value.content}</p></article>
                : <ToolCallIndicator activity={entry.value} key={entry.value.id} />)}
              {chatError && <div className="agent-error" role="alert"><p>{chatError.error}</p>{chatError.rawResponse && <pre>{chatError.rawResponse}</pre>}{chatError.retryable && <button className="secondary-action" onClick={() => void send(chatError.prompt)} disabled={sending}>Retry message</button>}</div>}
            </div>
            <form className="chat-input" onSubmit={onSubmit}><label className="sr-only" htmlFor="chat-message">Ask about your notes</label><textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your notes…" rows={2} disabled={sending || Boolean(vault.indexStatus?.error)} /><button className="primary-action" type="submit" disabled={sending || !draft.trim() || Boolean(vault.indexStatus?.error)}>{sending ? 'Working…' : 'Send'}</button></form>
          </div>
        ) : <div className="empty-state"><p className="eyebrow">NO VAULT SELECTED</p><h1>Choose the notes you want Noema to remember.</h1><p className="status-copy">Noema works directly with a folder on your device.</p><button className="primary-action" onClick={() => void chooseVault()} disabled={selecting}>{selecting ? 'Opening folder picker…' : 'Choose vault folder'}</button>{error && <p className="error-copy" role="alert">{error}</p>}</div>}
      </section>
    </main>
  )
}
