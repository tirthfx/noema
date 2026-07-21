import type { RecallItem } from '../../shared/types'
export default function RecallCard({ item, onDismiss }: { item: RecallItem; onDismiss: () => void }) { return <article className="recall-card"><button aria-label={`Dismiss ${item.title}`} onClick={onDismiss}>×</button><p className="recall-path">{item.path}</p><h2>{item.title}</h2><p>{item.excerpt}</p></article> }
