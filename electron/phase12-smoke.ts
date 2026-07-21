import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SelectedContextContent } from './context-reader'
import { isExclusiveContextRequest, packSelectedContext } from './selected-context-index'
import { createWorkspaceStore } from './workspace-store'
import type { WorkspaceSessionState } from '../shared/types'

// ---------------------------------------------------------------------------
// PART 2/3 — selected context is relevance-ranked and bounded, not dumped whole.
// ---------------------------------------------------------------------------

const projectFolder: SelectedContextContent = {
  name: 'Project',
  kind: 'folder',
  content: [
    'Folder: Project',
    '',
    'File tree (2 entries):',
    'auth.md',
    'billing.md',
    '',
    '--- auth.md ---',
    'The authentication system uses OAuth2 access tokens and refresh token rotation so that a login session stays secure. Passwords are hashed with bcrypt before storage.',
    '--- billing.md ---',
    'The billing module computes monthly invoices, applies regional tax rates to each line item, and issues refunds through the payments processor.'
  ].join('\n')
}

const relevant = packSelectedContext([projectFolder], 'How does the authentication and login token flow work?')
assert.ok(relevant.snippets.length > 0, 'Relevant selection should yield at least one snippet.')
assert.match(relevant.snippets[0].label, /auth\.md/, 'The auth file must rank above the billing file for an auth question.')
assert.ok(relevant.snippets[0].score > 0, 'A relevant snippet must score above zero.')
assert.ok(relevant.usedLabels.some((label) => /auth\.md/.test(label)), 'usedLabels should name the file that grounded the answer.')
assert.equal(relevant.exclusive, false, 'A normal question is not an exclusive-context request.')

// Selecting an irrelevant folder must NOT destroy the assistant: snippets come back with ~0
// score so the caller can tell the model the selection is probably unrelated.
const irrelevant = packSelectedContext([projectFolder], 'What is the capital of France and its population?')
assert.ok(irrelevant.snippets.every((snippet) => snippet.score === 0), 'An unrelated question should produce only zero-score snippets.')

// The whole selection is never dumped: total ranked context stays within the budget.
const hugeContent = Array.from({ length: 400 }, (_unused, index) => `Section ${index} about distributed consensus and quorum replication and log compaction.`).join('\n\n')
const bigFolder: SelectedContextContent = { name: 'Big', kind: 'folder', content: `Folder: Big\n\n--- notes.md ---\n${hugeContent}` }
const bounded = packSelectedContext([bigFolder], 'Explain quorum replication and log compaction in the consensus notes.')
assert.ok(bounded.totalChars <= 9_000, `Ranked context must stay bounded, got ${bounded.totalChars}.`)
assert.ok(bounded.snippets.length <= 8, 'Ranked context must cap the number of snippets.')

// Explicit "only this folder" requests are detected so the model can be constrained on purpose.
assert.equal(isExclusiveContextRequest('Answer using only this folder.'), true)
assert.equal(isExclusiveContextRequest('Summarize just this file, nothing else.'), true)
assert.equal(isExclusiveContextRequest('What does the auth module do?'), false)

// ---------------------------------------------------------------------------
// PART 1 — durable session survives a simulated restart; capability tokens do not.
// ---------------------------------------------------------------------------

const dataPath = await mkdtemp(join(tmpdir(), 'noema-session-'))
const session = createWorkspaceStore(dataPath)

// A renderer may accidentally attach a capability token to selected context. Persisting it
// would be a security regression, so the store must strip anything but display metadata.
const dirty = {
  updatedAt: new Date().toISOString(),
  activeMode: 'ask',
  conversation: [
    { role: 'user', content: 'Compare retrieval practice and spacing.' },
    { role: 'assistant', content: 'Retrieval practice strengthens durable recall; spacing improves retention.', mode: 'conversation' }
  ],
  selectedContext: [{ name: 'Project', kind: 'folder', displayPath: '/Users/demo/Project', id: 'capability-token-should-not-persist', capabilityId: 'secret' }],
  recentActivity: [{ id: 'act-1', at: new Date().toISOString(), kind: 'note', title: 'Saved note: retrieval.md', path: 'Learning/retrieval.md' }]
} as unknown as WorkspaceSessionState
await session.saveSession(dirty)

// Simulate a full app restart: a brand-new store instance reading the same data directory.
const afterRestart = createWorkspaceStore(dataPath)
const restored = await afterRestart.getSession()
assert.ok(restored, 'A saved session must survive restart.')
assert.equal(restored.activeMode, 'ask', 'The active section should be restored.')
assert.equal(restored.conversation.length, 2, 'The conversation transcript should be restored.')
assert.equal(restored.conversation[1].mode, 'conversation', 'Assistant turn provenance should be restored.')
assert.equal(restored.selectedContext[0].displayPath, '/Users/demo/Project', 'Selected-context metadata should be restored for continuity.')
assert.equal(restored.recentActivity[0].id, 'act-1', 'Recent activity should be restored.')

const rawSession = await readFile(join(dataPath, 'workspace-memory.json'), 'utf8')
assert.ok(!rawSession.includes('capability-token-should-not-persist'), 'Capability tokens must never be persisted to disk.')
assert.ok(!rawSession.includes('secret'), 'No selected-context capability id should reach disk.')
assert.ok(!('id' in restored.selectedContext[0]), 'Restored selected context must be display metadata only.')

// appendActivity accumulates across sessions and stays bounded/newest-first.
await afterRestart.appendActivity({ id: 'act-2', at: new Date().toISOString(), kind: 'artifact', title: 'Created literature review' })
const afterAppend = await createWorkspaceStore(dataPath).getSession()
assert.equal(afterAppend?.recentActivity[0].id, 'act-2', 'Newest activity should lead the feed after restart.')
assert.equal(afterAppend?.recentActivity.length, 2, 'Prior activity should remain after appending.')

// ---------------------------------------------------------------------------
// PART 4 — local recap draws on the durable session (conversation, actions, open loops).
// ---------------------------------------------------------------------------

const { buildSessionRecap } = await import('../shared/workspace')
const recap = buildSessionRecap({
  conversation: [
    { role: 'user', content: 'Compare retrieval practice and spacing.' },
    { role: 'assistant', content: 'Retrieval practice strengthens recall.' }
  ],
  recentActivity: [{ id: 'r1', at: new Date().toISOString(), kind: 'note', title: 'Saved note: retrieval.md', detail: 'Learning/retrieval.md' }],
  openReview: [{ id: 'rev1', title: 'Verify the evidence slide', detail: 'Check the citation before the demo', prompt: 'x', sourcePaths: [], status: 'open' }]
})
assert.match(recap, /Compare retrieval practice and spacing/, 'Recap should list what the user explored.')
assert.match(recap, /Saved note: retrieval\.md/, 'Recap should list what was produced.')
assert.match(recap, /Verify the evidence slide/, 'Recap should list still-open loops.')

console.log('Continuity behavior verified: relevance-ranked bounded context, exclusive detection, durable session restore without capability leakage, and offline session recap.')
