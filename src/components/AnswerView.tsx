import type { GroundedAnswer } from '../../shared/types'
import { FileText, FolderOpen } from '@phosphor-icons/react'
import Citation from './Citation'

function Approach({ items }: { items?: string[] }) {
  if (!items?.length) return null
  return <details className="answer-approach">
    <summary>How Noema approached this</summary>
    {items.map((item, index) => <p key={index}>{item}</p>)}
  </details>
}

export default function AnswerView({
  answer,
  onChooseContext
}: {
  answer: GroundedAnswer
  onChooseContext?: (kind: 'file' | 'folder') => void
}) {
  const approach = <Approach items={answer.approach} />
  if (answer.contextRequest) return <><section className="context-request">
    <div className="context-request-copy">
      <span>I NEED CONTEXT</span>
      <h3>Let me look at the right material</h3>
      <p>{answer.contextRequest.reason}</p>
    </div>
    <div className="context-request-actions">
      <button type="button" onClick={() => onChooseContext?.('file')}><FileText size={16} />Choose file</button>
      <button type="button" onClick={() => onChooseContext?.('folder')}><FolderOpen size={16} />Choose folder</button>
    </div>
    <small>Noema can only read what you explicitly choose.</small>
  </section>{approach}</>
  if (answer.refusal) return <><p className="no-match">{answer.notice ?? 'I couldn’t find reliable support for that request.'}</p>{approach}</>
  if (answer.plainText) {
    const label = answer.mode === 'general' ? 'GENERAL KNOWLEDGE' : answer.mode === 'clarification' ? 'CLARIFYING' : answer.mode === 'context' ? 'SELECTED CONTEXT' : 'NOEMA'
    return <><section className={`plain-answer ${answer.mode ?? 'conversation'}`}>
      <span>{label}</span>
      {answer.contextFiles?.length ? <p className="context-used"><FolderOpen size={12} />Using {answer.contextFiles.length} file{answer.contextFiles.length === 1 ? '' : 's'}: {answer.contextFiles.slice(0, 4).join(', ')}</p> : null}
      <p>{answer.plainText}</p>
    </section>{approach}</>
  }
  if (answer.degraded) return (
    <><section className="evidence-fallback">
      <p className="fallback-notice">{answer.notice}</p>
      <div className="evidence-list">
        {answer.evidence?.map((item) => (
          <button key={`${item.path}-${item.score}`} className="evidence-item" onClick={() => void window.noema.vault.revealNote(item.path)}>
            <span className="evidence-title">{item.title}</span>
            <span className="evidence-path">{item.path}</span>
            <span className="evidence-excerpt">{item.excerpt}</span>
          </button>
        ))}
        {answer.webSources?.map((item) => (
          <button key={item.url} className="evidence-item" onClick={() => void window.noema.app.openExternal(item.url)}>
            <span className="evidence-title">{item.title}</span>
            <span className="evidence-path">{item.url}</span>
            <span className="evidence-excerpt">{item.excerpt}</span>
          </button>
        ))}
      </div>
    </section>{approach}</>
  )
  return <><div className="grounded-answer"><span className="answer-mode">{answer.mode === 'web' ? 'LIVE WEB' : 'FROM YOUR CORPUS'}</span>{answer.claims.map((claim, index) => <p key={index}>{claim.text} {claim.citations.map((citation, citationIndex) => <Citation citation={citation} key={`${citation.path}-${citationIndex}`} />)}</p>)}</div>{approach}</>
}
