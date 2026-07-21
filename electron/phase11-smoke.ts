import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { Artifact, ReviewItem } from '../shared/types'
import { parseNvidiaApiKeyEnv } from './index'
import { parseModelJson } from './model-json'
import { readSelectedContext } from './context-reader'
import { createWorkspaceStore } from './workspace-store'
import { defaultUserDataPath, lastVaultPointerPath, resolveSavedVault } from './vault-pointer'

const citationA = { path: 'a.md', quote: 'Alpha evidence' }
const citationB = { path: 'b.md', quote: 'Beta evidence' }
const artifact: Artifact = {
  title: 'A review',
  claims: [{ text: 'A grounded claim', citations: [{ ...citationA, title: 'A' }] }],
  tensions: [{
    question: 'Which approach?',
    sides: [
      { text: 'Approach A', citations: [{ ...citationA, title: 'A' }] },
      { text: 'Approach B', citations: [{ ...citationB, title: 'B' }] }
    ]
  }]
}

const modelArtifact = {
  ...artifact,
  claims: artifact.claims.map((claim) => ({ text: claim.text, citations: claim.citations.map(({ path, quote }) => ({ path, quote })) })),
  tensions: artifact.tensions.map((tension) => ({
    question: tension.question,
    sides: tension.sides.map((side) => ({ text: side.text, citations: side.citations.map(({ path, quote }) => ({ path, quote })) }))
  }))
}

// Valid, fenced, reasoned, and trailing-prose responses all preserve ordinary JSON behavior.
assert.deepEqual(parseModelJson(JSON.stringify(modelArtifact)), modelArtifact)
assert.deepEqual(parseModelJson(`\`\`\`json\n${JSON.stringify(modelArtifact)}\n\`\`\``), modelArtifact)
assert.deepEqual(parseModelJson(`<think>private reasoning</think>\n${JSON.stringify(modelArtifact)}`), modelArtifact)
assert.deepEqual(parseModelJson(`Here is the review:\n${JSON.stringify(modelArtifact)}\nDone.`), modelArtifact)

// A cut after a completed citation keeps the completed claim despite missing outer closers.
const afterInnerCitation = parseModelJson('{"title":"Review","claims":[{"text":"A","citations":[{"path":"a.md","quote":"Alpha"}') as Artifact
assert.equal(afterInnerCitation.claims.length, 1)
assert.deepEqual(afterInnerCitation.claims[0].citations, [{ path: 'a.md', quote: 'Alpha' }])

// A cut during the second tension side retains only the genuinely completed first side.
const duringSecondSide = parseModelJson('{"title":"Review","claims":[],"tensions":[{"question":"Which?","sides":[{"text":"A","citations":[{"path":"a.md","quote":"Alpha"}]},{"text":"unfinished') as Artifact
assert.equal(duringSecondSide.tensions[0].sides.length, 1)
assert.equal(duringSecondSide.tensions[0].sides[0].text, 'A')
assert.ok(!JSON.stringify(duringSecondSide).includes('unfinished'))

// A lone backslash cannot be converted into invented quoted text.
const afterLoneBackslash = parseModelJson('{"title":"Review","claims":[{"text":"A","citations":[]},{"text":"invented\\') as Artifact
assert.equal(afterLoneBackslash.claims.length, 1)
assert.ok(!JSON.stringify(afterLoneBackslash).includes('invented'))

// Recover the model's specific two-sides-merged-as-duplicate-keys failure.
const mergedSides = parseModelJson('{"title":"Review","claims":[],"tensions":[{"question":"Which?","sides":[{"text":"A","citations":[{"path":"a.md","quote":"Alpha"}],"text":"B","citations":[{"path":"b.md","quote":"Beta"}]}]}]}') as Artifact
assert.equal(mergedSides.tensions[0].sides.length, 2)
assert.deepEqual(mergedSides.tensions[0].sides.map((side) => side.text), ['A', 'B'])

// Duplicate keys anywhere else retain JSON.parse-style last-key-wins behavior.
const ordinaryDuplicate = parseModelJson('{"title":"first","title":"second","claims":[{"text":"A","text":"B","citations":[]}],"tensions":[]}') as Artifact
assert.equal(ordinaryDuplicate.title, 'second')
assert.equal(ordinaryDuplicate.claims.length, 1)
assert.equal(ordinaryDuplicate.claims[0].text, 'B')

// A malformed tail cannot erase completed top-level claims or fabricate the partial tail.
const malformedTail = parseModelJson('{"title":"Review","claims":[{"text":"A","citations":[]}],"tensions":[{"question":"cut","sides":[{"text":"partial') as Artifact
assert.equal(malformedTail.claims.length, 1)
assert.ok(!JSON.stringify(malformedTail).includes('partial'))

// Common .env forms, including comments and quoted # characters.
assert.equal(parseNvidiaApiKeyEnv('NVIDIA_API_KEY=nvapi-plain'), 'nvapi-plain')
assert.equal(parseNvidiaApiKeyEnv(' NVIDIA_API_KEY = nvapi-commented   # local demo key'), 'nvapi-commented')
assert.equal(parseNvidiaApiKeyEnv('NVIDIA_API_KEY=nvapi-commented#inline'), 'nvapi-commented')
assert.equal(parseNvidiaApiKeyEnv('NVIDIA_API_KEY="nvapi-hash#inside" # outside'), 'nvapi-hash#inside')
assert.equal(parseNvidiaApiKeyEnv("export NVIDIA_API_KEY = 'nvapi-single#inside'"), 'nvapi-single#inside')
assert.equal(parseNvidiaApiKeyEnv('OTHER=value'), undefined)

// Desktop and standalone MCP resolution share the same lowercase application directory and
// pointer/config validation rather than carrying platform-specific copies.
assert.equal(basename(defaultUserDataPath()), 'noema')
const pointerDataPath = await mkdtemp(join(tmpdir(), 'noema-pointer-'))
const pointerVault = await mkdtemp(join(tmpdir(), 'noema-pointer-vault-'))
await mkdir(join(pointerVault, '.noema'), { recursive: true })
const pointer = { vaultPath: pointerVault, name: 'Shared corpus', kind: 'noema' as const }
await Promise.all([
  writeFile(lastVaultPointerPath(pointerDataPath), `${JSON.stringify(pointer)}\n`, 'utf8'),
  writeFile(join(pointerVault, '.noema', 'config.json'), `${JSON.stringify(pointer)}\n`, 'utf8')
])
assert.deepEqual(await resolveSavedVault(pointerDataPath), pointer)

// Concurrent mutations must preserve both updates and fields unknown to this app version.
const dataPath = await mkdtemp(join(tmpdir(), 'noema-remediation-'))
const workspacePath = join(dataPath, 'workspace-memory.json')
await writeFile(workspacePath, '{"reviewItems":[],"focusSessions":[],"futureField":{"kept":true}}\n', 'utf8')
const store = createWorkspaceStore(dataPath)
const reviewItems: ReviewItem[] = [{ id: 'review-1', title: 'Review', detail: 'Keep me', prompt: 'Review this', sourcePaths: [], status: 'open' }]
await Promise.all([
  store.saveReviewItems(reviewItems),
  store.saveFocusSession({ id: 'focus-1', context: 'Keep me too', startedAt: '2026-07-21T00:00:00.000Z', checkpoints: [], relatedNotes: [] })
])
assert.equal((await store.getReviewItems())[0]?.id, 'review-1')
assert.equal((await store.getFocusSessions())[0]?.id, 'focus-1')
const persisted = JSON.parse(await readFile(workspacePath, 'utf8')) as { futureField?: { kept?: boolean } }
assert.equal(persisted.futureField?.kept, true)
assert.equal(await store.getLastSeen(), null)
await store.setLastSeen('2026-07-21T01:00:00.000Z')
assert.equal(await store.getLastSeen(), '2026-07-21T01:00:00.000Z')

// Explicit context reads are bounded and exclude likely secrets even when a whole folder
// is selected. Renderer-provided paths never reach this function directly in the app.
const contextFolder = await mkdtemp(join(tmpdir(), 'noema-context-'))
await Promise.all([
  writeFile(join(contextFolder, 'README.md'), '# Sample project\nA carefully selected project summary.\n', 'utf8'),
  writeFile(join(contextFolder, '.env'), 'NVIDIA_API_KEY=must-not-leak\n', 'utf8')
])
const folderContext = await readSelectedContext(contextFolder, 'folder')
assert.match(folderContext.content, /carefully selected project summary/)
assert.doesNotMatch(folderContext.content, /must-not-leak|NVIDIA_API_KEY/)
const fileContext = await readSelectedContext(join(contextFolder, 'README.md'), 'file')
assert.match(fileContext.content, /Sample project/)

console.log('Remediation behavior verified: model JSON recovery, env parsing, serialized workspace mutations, and bounded context reads.')
