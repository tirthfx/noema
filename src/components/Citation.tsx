import type { Citation as CitationData } from '../../shared/types'
export default function Citation({ citation }: { citation: CitationData }) {
  return <span className="citation-wrap"><button className="citation" onClick={() => void window.noema.vault.revealNote(citation.path)}>{citation.title}</button><span className="citation-popover">{citation.quote}</span></span>
}
