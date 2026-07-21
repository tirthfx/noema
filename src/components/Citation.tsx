import type { Citation as CitationData } from '../../shared/types'
export default function Citation({ citation }: { citation: CitationData }) {
  const open = citation.url
    ? () => window.noema.app.openExternal(citation.url!)
    : () => window.noema.vault.revealNote(citation.path)
  return <span className="citation-wrap"><button className="citation" onClick={() => void open()}>{citation.title}</button><span className="citation-popover">{citation.quote}</span></span>
}
