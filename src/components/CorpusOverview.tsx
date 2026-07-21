import type { CorpusNote } from '../../shared/types'

const statusLabel: Record<CorpusNote['status'], string> = {
  indexed: 'Indexed',
  stale: 'Needs refresh',
  error: 'Index error'
}

export default function CorpusOverview({ notes, error }: { notes: CorpusNote[]; error: string | null }) {
  return (
    <section className="corpus-overview" aria-labelledby="corpus-heading">
      <div className="corpus-header"><div><p className="eyebrow">CORPUS OVERVIEW</p><h2 id="corpus-heading">Indexed notes</h2></div><p className="corpus-count">{notes.length} files</p></div>
      {error ? <p className="error-copy" role="alert">{error}</p> : notes.length === 0 ? <p className="corpus-empty">No Markdown notes are indexed in this corpus. Add a Markdown or text source to begin.</p> : (
        <ul className="corpus-list">
          {notes.map((note) => <li className="corpus-note" key={note.path}>
            <span className={`status-dot status-${note.status}`} role="img" aria-label={statusLabel[note.status]} />
            <span className="corpus-note-copy"><span className="corpus-note-title">{note.title}</span><span className="corpus-note-path">{note.path}</span></span>
            <span className="corpus-status">{statusLabel[note.status]}</span>
          </li>)}
        </ul>
      )}
    </section>
  )
}
