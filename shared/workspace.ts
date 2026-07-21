import type { ActivityEvent, ConversationTurn, FocusSession, GroundedAnswer, RecallItem, ReviewItem, SearchMatch, SuggestedPrompt, TimelineEvent, CorpusNote } from './types'

function cleanTitle(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.md$/i, '').replace(/[-_]+/g, ' ') || path
}

export function buildReviewItems(recalls: RecallItem[]): ReviewItem[] {
  return recalls.slice(0, 5).map((item) => ({
    id: `recall:${item.path}`,
    title: `Revisit ${item.title}`,
    detail: item.excerpt,
    prompt: `Quiz me on ${item.title}, then show what I missed using my notes.`,
    sourcePaths: [item.path],
    status: 'open'
  }))
}

export function buildMeetingReviewItems(actionItems: string[], sourcePath: string): ReviewItem[] {
  return actionItems.map((task, index) => ({
    id: `meeting:${sourcePath}:${index}`,
    title: 'Meeting task',
    detail: task,
    prompt: `Review meeting task: ${task}`,
    sourcePaths: [sourcePath],
    status: 'open'
  }))
}

export function buildSuggestedPrompts(input: {
  noteCount: number
  recalls: RecallItem[]
  reviewItems: ReviewItem[]
  focusSessions: FocusSession[]
}): SuggestedPrompt[] {
  const suggestions: SuggestedPrompt[] = []
  const latestFocus = input.focusSessions.find((session) => session.endedAt)
  if (latestFocus) suggestions.push({
    id: `focus:${latestFocus.id}`,
    label: 'Continue the thread',
    prompt: `Help me continue: ${latestFocus.context}. What should I do next based on my notes?`,
    reason: 'From your last focus session'
  })
  const review = input.reviewItems.find((item) => item.status === 'open')
  if (review) suggestions.push({ id: review.id, label: 'Test my understanding', prompt: review.prompt, reason: 'Ready for review' })
  const recall = input.recalls[0]
  if (recall) suggestions.push({
    id: `connect:${recall.path}`,
    label: 'Find a connection',
    prompt: `How does ${recall.title} connect to the other ideas in my corpus?`,
    reason: 'Based on a note worth resurfacing'
  })
  if (input.noteCount > 1) suggestions.push({
    id: 'gaps',
    label: 'Find a knowledge gap',
    prompt: 'What important question is my corpus currently unable to answer well?',
    reason: `Across ${input.noteCount} indexed notes`
  })
  if (suggestions.length < 3) suggestions.push({
    id: 'orient',
    label: 'Orient me',
    prompt: 'Summarize the strongest themes in this corpus and suggest one useful next step.',
    reason: 'A good place to begin'
  })
  return [...new Map(suggestions.map((item) => [item.prompt, item])).values()].slice(0, 4)
}

export function buildFocusRecap(session: FocusSession): string {
  const started = new Date(session.startedAt)
  const ended = session.endedAt ? new Date(session.endedAt) : new Date()
  const minutes = Math.max(1, Math.round((ended.getTime() - started.getTime()) / 60_000))
  const checkpoints = session.checkpoints.length
    ? session.checkpoints.map((checkpoint) => `- ${checkpoint}`).join('\n')
    : '- No checkpoints were added.'
  const related = session.relatedNotes.length
    ? session.relatedNotes.map((note) => `- [[${note.path}]]`).join('\n')
    : '- No related corpus notes found yet.'
  return `# Focus recap: ${session.context}\n\n${minutes} minute session.\n\n## Checkpoints\n\n${checkpoints}\n\n## Related notes\n\n${related}\n`
}

/**
 * A local, deterministic session recap built from the durable working session — no model call,
 * so it works offline and cannot fabricate. It answers "what did I do / decide / leave open"
 * from real conversation turns, logged actions, and open review loops. Cue's recap summarizes
 * an in-memory thread; Noema's recaps a session that actually survived restart, and can be sent
 * through the ordinary approval gate to become a corpus note.
 */
export function buildSessionRecap(input: {
  conversation: ConversationTurn[]
  recentActivity: ActivityEvent[]
  openReview: ReviewItem[]
}): string {
  const questions = input.conversation.filter((turn) => turn.role === 'user').map((turn) => turn.content.trim()).filter(Boolean)
  const created = input.recentActivity.filter((event) => event.kind === 'note' || event.kind === 'artifact' || event.kind === 'capture' || event.kind === 'meeting')
  const askedList = questions.length
    ? questions.slice(-6).map((question) => `- ${question.slice(0, 200)}`).join('\n')
    : '- Nothing was asked this session.'
  const createdList = created.length
    ? created.slice(0, 8).map((event) => `- ${event.title}${event.detail && event.detail !== event.title ? ` (${event.detail})` : ''}`).join('\n')
    : '- No notes or artifacts were produced.'
  const openList = input.openReview.length
    ? input.openReview.slice(0, 8).map((item) => `- [ ] ${item.title}: ${item.detail}`.slice(0, 240)).join('\n')
    : '- No open review loops.'
  return `# Session recap: ${new Date().toLocaleString()}\n\n## What you explored\n\n${askedList}\n\n## What you produced\n\n${createdList}\n\n## Still open\n\n${openList}\n`
}

export function safeProviderMessage(error?: string): string {
  const value = error?.toLowerCase() ?? ''
  if (value.includes('429') || value.includes('rate limit') || value.includes('busy')) return 'The answer service is busy. Your matching notes are still available below.'
  if (value.includes('timeout') || value.includes('timed out')) return 'The answer took too long. Your matching notes are still available below.'
  if (value.includes('forbidden') || value.includes('api key')) return 'The answer service needs attention. Your matching notes are still available below.'
  return 'Noema could not compose an answer right now. Your matching notes are still available below.'
}

export function buildEvidenceFallback(matches: SearchMatch[], error?: string): GroundedAnswer {
  return {
    claims: [],
    degraded: true,
    notice: safeProviderMessage(error),
    evidence: matches.slice(0, 5).map((match) => ({
      path: match.notePath,
      title: cleanTitle(match.notePath),
      excerpt: match.text.replace(/^#{1,6}\s+.*\n?/, '').trim().slice(0, 520),
      score: match.score
    }))
  }
}

export function buildTimelineEvents(input: {
  notes: CorpusNote[]
  focusSessions: FocusSession[]
}): TimelineEvent[] {
  const events: TimelineEvent[] = []
  
  for (const session of input.focusSessions) {
    events.push({
      id: `focus:${session.id}`,
      timestamp: session.endedAt ?? session.startedAt,
      type: 'focus',
      title: `Focused on ${session.context}`,
      subtitle: `${session.checkpoints.length} checkpoints · ${session.relatedNotes.length} related notes`,
      excerpt: session.checkpoints.slice(0, 3).join(' · ') || undefined
    })
  }

  for (const note of input.notes) {
    if (note.path.startsWith('.noema/')) continue
    const isFocusRecap = note.path.startsWith('Focus/') || note.path.startsWith('Noema Focus/')
    const isMeetingRecap = note.path.startsWith('Meetings/') || note.path.startsWith('Noema Meetings/')
    events.push({
      id: `note:${note.path}`,
      timestamp: note.modifiedAt,
      type: 'note',
      title: isFocusRecap ? 'Saved focus session recap' : isMeetingRecap ? 'Ingested meeting recap' : `Updated note: ${note.title}`,
      subtitle: note.path,
      path: note.path
    })
  }

  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15)
}

export function buildMeetingRecap(summary: string, actionItems: string[], decisions: string[]): string {
  const actionsList = actionItems.length
    ? actionItems.map((item) => `- [ ] ${item}`).join('\n')
    : '- No action items extracted.'
  const decisionsList = decisions.length
    ? decisions.map((item) => `- ${item}`).join('\n')
    : '- No specific decisions recorded.'
  return `# Meeting Recap: ${new Date().toLocaleDateString()}\n\n## Summary\n\n${summary}\n\n## Action Items\n\n${actionsList}\n\n## Decisions & Takeaways\n\n${decisionsList}\n`
}
