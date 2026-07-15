import { useEffect, useState } from 'react'
import type { VaultSelection } from '../shared/types'

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
  const [vault, setVault] = useState<VaultSelection | null>(null)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.noema.vault.getSaved()
      .then(setVault)
      .catch(() => setError('Noema could not read the previously selected vault. Choose it again to continue.'))
      .finally(() => setLoading(false))
  }, [])

  async function chooseVault(): Promise<void> {
    setSelecting(true)
    setError(null)
    try {
      setVault(await window.noema.vault.choose())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Noema could not save the selected vault.')
    } finally {
      setSelecting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="titlebar">
        <span className="titlebar-wordmark">NOEMA</span>
        <WindowsControls />
      </header>
      <section className="content">
        {loading ? <p className="status-copy">Opening your research workspace…</p> : vault ? (
          <div className="vault-ready">
            <p className="eyebrow">VAULT CONNECTED</p>
            <h1>Your research workspace is ready.</h1>
            <p className="vault-path">{vault.vaultPath}</p>
            <p className="status-copy">Indexing and agent tools begin in Phase 1.</p>
          </div>
        ) : (
          <div className="empty-state">
            <p className="eyebrow">NO VAULT SELECTED</p>
            <h1>Choose the notes you want Noema to remember.</h1>
            <p className="status-copy">Noema works directly with a folder on your device.</p>
            <button className="primary-action" onClick={() => void chooseVault()} disabled={selecting}>
              {selecting ? 'Opening folder picker…' : 'Choose vault folder'}
            </button>
            {error && <p className="error-copy" role="alert">{error}</p>}
          </div>
        )}
      </section>
    </main>
  )
}
