import { mkdtemp, mkdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { proposeMeeting } from './agent'
import { buildTimelineEvents } from '../shared/workspace'
import type { FocusSession, CorpusNote } from '../shared/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

const vault = await mkdtemp(join(tmpdir(), 'noema-phase9-'))
await mkdir(join(vault, '.noema'), { recursive: true })
await mkdir(join(vault, 'Meetings'), { recursive: true })

const transcript = `
Project Sync Transcript
Tirth: Hey, we need to finalize the visual designs for Noema today. I think the light warm-paper theme is perfect.
Aaryan: Agreed. Let's use #F7F6F2 for the backgrounds and make indicators green for success, amber for thinking.
Tirth: Cool. I will record the 3-minute demo script using the seed vault tomorrow.
Aaryan: Let's also make sure we build the packaging artifact. I'll test it on macOS.
Tirth: Sounds good. Let's get to work.
`

console.log('Testing proposeMeeting with NIM API...')
const result = await proposeMeeting(vault, transcript, () => {})

assert(result.proposal, `Expected a meeting proposal result, got: ${result.error ?? ''}`)
const proposal = result.proposal
assert(proposal.path.startsWith('Meetings/recap-'), `Expected path to be in Meetings, got: ${proposal.path}`)
assert(proposal.path.endsWith('.md'), `Expected Markdown path, got: ${proposal.path}`)
assert(Array.isArray(proposal.actionItems), 'Expected actionItems to be extracted')
assert(proposal.actionItems.length > 0, 'Expected at least one action item')

console.log('Meeting transcript parsed successfully!')
console.log('Extracted Action Items:', proposal.actionItems)
assert(proposal.content.includes('Summary'), 'Expected summary section in content')
assert(proposal.content.includes('Action Items'), 'Expected action items section in content')

assert(!(await exists(join(vault, proposal.path))), 'Proposal wrote to disk before approval!')
console.log('Verified proposal has not been written to disk yet.')

console.log('Testing buildTimelineEvents...')
const mockFocus: FocusSession = {
  id: 'session-123',
  context: 'Aesthetics and typography',
  startedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
  endedAt: new Date().toISOString(),
  checkpoints: ['Styled the timeline dots', 'Verified Reading Room layout'],
  relatedNotes: []
}

const mockNotes: CorpusNote[] = [
  { path: 'Meetings/meeting-recap.md', title: 'meeting-recap', status: 'indexed' as const, modifiedAt: '2026-07-19T10:00:00.000Z' }
]

const events = buildTimelineEvents({ notes: mockNotes, focusSessions: [mockFocus] })
assert(events.length === 2, `Expected 2 timeline events, got ${events.length}`)
assert(events[0].type === 'focus' || events[0].type === 'note', 'Expected correct event types')
console.log('Timeline events compiled successfully!')
console.log(events)

console.log('Phase 9 Littlebird integration smoke test passed successfully!')
