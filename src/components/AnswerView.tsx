import type { GroundedAnswer } from '../../shared/types'
import Citation from './Citation'
export default function AnswerView({ answer }: { answer: GroundedAnswer }) {
  if (answer.refusal) return <p className="no-match">Nothing relevant found in this vault for that question.</p>
  return <div className="grounded-answer">{answer.claims.map((claim, index) => <p key={index}>{claim.text} {claim.citations.map((citation, citationIndex) => <Citation citation={citation} key={`${citation.path}-${citationIndex}`} />)}</p>)}</div>
}
