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
  if (!window.noema) {
    return (
      <main className="app-shell browser-notice">
        <div>
          <p className="eyebrow">ELECTRON REQUIRED</p>
          <h1>Open Noema from the desktop app.</h1>
          <p className="status-copy">This renderer has no filesystem or native-dialog access when opened directly in a browser.</p>
        </div>
      </main>
    )
  }

  const [vault, setVault] = useState<VaultSelection | null>(null)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
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

  async function rebuildIndex(): Promise<void> {
    if (!vault) return
    setRebuilding(true)
    try {
      const indexStatus = await window.noema.index.rebuild()
      setVault({ ...vault, indexStatus })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Noema could not rebuild the vault index.')
    } finally {
      setRebuilding(false)
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
            {vault.indexStatus?.error ? (
              <>
                <p className="error-copy" role="alert">{vault.indexStatus.error}</p>
                <button className="primary-action" onClick={() => void rebuildIndex()} disabled={rebuilding}>
                  {rebuilding ? 'Rebuilding index…' : 'Retry indexing'}
                </button>
              </>
            ) : (
              <p className="status-copy">
                {vault.indexStatus ? `Indexed ${vault.indexStatus.indexedNotes} notes in ${vault.indexStatus.indexedChunks} chunks. ` : ''}
                Agent tools begin in Phase 2.
              </p>
            )}
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
