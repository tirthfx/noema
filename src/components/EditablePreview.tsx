import { useMemo, useState } from 'react'
import type { NoteProposal } from '../../shared/types'

/**
 * The approval gate for every write (rules.md §4). The panel writes whatever is currently
 * in the textarea, so edits made here are what actually land on disk. Two actions only —
 * Approve & write, or Discard.
 */
export default function EditablePreview({ proposal, onWritten, onDiscard }: {
  proposal: NoteProposal
  onWritten: (path: string) => void
  onDiscard: () => void
}) {
  const [content, setContent] = useState(proposal.content)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hand-rolled added-line highlight (design.md): lines the edit introduces relative to the
  // note already on disk. Recomputed as the user types so the panel never shows a stale diff.
  const addedLines = useMemo(() => {
    if (proposal.kind !== 'edit' || proposal.baseContent === undefined) return []
    const existing = new Set(proposal.baseContent.split('\n'))
    return content.split('\n').filter((line) => line.trim() && !existing.has(line))
  }, [content, proposal.baseContent, proposal.kind])

  async function approve(): Promise<void> {
    if (writing) return
    setWriting(true)
    setError(null)
    try {
      const result = await window.noema.vault.approveWrite({ ...proposal, content })
      if (result.ok) onWritten(result.path ?? proposal.path)
      else setError(result.error ?? `Noema could not write ${proposal.path}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Noema could not write ${proposal.path}.`)
    } finally {
      setWriting(false)
    }
  }

  return (
    <section className="editable-preview" aria-label="Proposed note">
      <div className="preview-header">
        <p className="eyebrow">{proposal.kind === 'new' ? 'PROPOSED NEW NOTE' : 'PROPOSED EDIT'}</p>
        <p className="preview-path">{proposal.path}</p>
      </div>
      {proposal.source && <p className="preview-source">{proposal.source}</p>}
      <p className="preview-hint">Nothing has been written yet. Edit the draft below, then approve it.</p>

      {addedLines.length > 0 && (
        <div className="preview-additions">
          <p className="caption-label">Adds to the existing note</p>
          {addedLines.map((line, index) => <p className="added-line" key={`${index}-${line}`}>{line}</p>)}
        </div>
      )}

      <label className="sr-only" htmlFor="preview-content">Proposed note content</label>
      <textarea id="preview-content" className="preview-content" value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} rows={14} disabled={writing} />

      {error && <p className="error-copy" role="alert">{error}</p>}

      <div className="preview-actions">
        <button className="primary-action" onClick={() => void approve()} disabled={writing || !content.trim()}>{writing ? 'Writing…' : 'Approve & write'}</button>
        <button className="secondary-action" onClick={onDiscard} disabled={writing}>Discard</button>
      </div>
    </section>
  )
}
