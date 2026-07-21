import type { RecallItem, SearchMatch } from '../shared/types'
import { buildEvidenceFallback, buildFocusRecap, buildReviewItems, buildSuggestedPrompts, safeProviderMessage } from '../shared/workspace'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspaceStore } from './workspace-store'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const recalls: RecallItem[] = [
  { path: 'Learning/retrieval.md', title: 'Retrieval practice', excerpt: 'Testing strengthens durable recall.' },
  { path: 'Learning/spacing.md', title: 'Spacing', excerpt: 'Spacing practice improves retention.' }
]
const reviewItems = buildReviewItems(recalls)
assert(reviewItems.length === 2, 'Recall notes should become actionable review items.')
assert(reviewItems[0].prompt.includes('Retrieval practice'), 'Review prompts should carry note context.')

const prompts = buildSuggestedPrompts({ noteCount: 14, recalls, reviewItems, focusSessions: [] })
assert(prompts.length >= 3 && prompts.length <= 4, 'Today should offer a compact set of suggested prompts.')
assert(new Set(prompts.map((item) => item.prompt)).size === prompts.length, 'Suggested prompts should not repeat.')
assert(prompts.some((item) => item.prompt.includes('Retrieval practice')), 'Suggestions should use live vault context.')

const recap = buildFocusRecap({
  id: 'focus-1',
  context: 'Prepare the learning science demo',
  startedAt: '2026-07-19T10:00:00.000Z',
  endedAt: '2026-07-19T10:25:00.000Z',
  checkpoints: ['Compared retrieval and spacing', 'Need to verify the evidence slide'],
  relatedNotes: recalls
})
assert(recap.includes('Prepare the learning science demo'), 'Focus recap should preserve the user-defined context.')
assert(recap.includes('Need to verify the evidence slide'), 'Focus recap should preserve checkpoints.')
assert(recap.includes('Learning/retrieval.md'), 'Focus recap should include locally related notes.')

const matches: SearchMatch[] = [{ notePath: 'Learning/retrieval.md', chunkId: 'heading-1', text: '# Retrieval\nTesting strengthens durable recall.', score: 0.82 }]
const fallback = buildEvidenceFallback(matches, 'NIM chat request timed out. Response: secret payload')
assert(fallback.degraded === true && fallback.evidence?.length === 1, 'Retrieved evidence should survive provider failure.')
assert(!JSON.stringify(fallback).includes('secret payload'), 'Provider payloads must never reach renderer-safe results.')
assert(safeProviderMessage('HTTP 429 Response: raw') === 'The answer service is busy. Your matching notes are still available below.', 'Rate limits should receive calm product copy.')

const dataPath = await mkdtemp(join(tmpdir(), 'noema-workspace-'))
const store = createWorkspaceStore(dataPath)
await store.saveReviewItems(reviewItems)
assert((await store.getReviewItems()).length === 2, 'Review items should survive local persistence.')
await store.saveFocusSession({ id: 'focus-local', context: 'Demo', startedAt: new Date().toISOString(), checkpoints: [], relatedNotes: [] })
assert((await store.getFocusSessions())[0]?.id === 'focus-local', 'Focus sessions should survive local persistence.')
await store.deleteFocusSession('focus-local')
assert((await store.getFocusSessions()).length === 0, 'A user should be able to delete a local focus session.')

console.log('Workspace behavior verified: prompts, review, focus recap, and evidence recovery.')
