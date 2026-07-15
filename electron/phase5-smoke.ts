import { createServer } from 'node:http'
import { chmod, mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { proposeCapture, proposeLink } from './agent'
import { getVaultIndex } from './index'
import { describeWriteFailure, writeVaultNote } from './vault'
import { htmlToText } from './capture'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

const vault = await mkdtemp(join(tmpdir(), 'noema-phase5-'))
await mkdir(join(vault, '.noema'), { recursive: true })
await mkdir(join(vault, 'Research'), { recursive: true })
await writeFile(join(vault, 'Research', 'practice.md'), '# Retrieval practice\nRetrieval practice improves durable learning by requiring recall rather than passive review.\n')
await writeFile(join(vault, 'Research', 'spacing.md'), '# Spacing\nSpaced repetition outperforms massed practice for long-term retention.\n')
await getVaultIndex(vault).refresh()

// Extraction is pure, so assert it drops chrome before any network or model work.
const extracted = htmlToText('<html><head><title>Interleaving</title></head><body><nav>Home About</nav><script>tracker()</script><article><h1>Interleaving</h1><p>Interleaving different problem types improves discrimination between them.</p></article><footer>Copyright</footer></body></html>')
assert(extracted.title === 'Interleaving', `Expected the page title, got: ${extracted.title}`)
assert(extracted.text.includes('Interleaving different problem types'), 'Expected article prose in extracted text.')
assert(!/tracker\(\)|Home About|Copyright/.test(extracted.text), `Chrome/script leaked into extracted text: ${extracted.text}`)
console.log('URL extraction drops nav, script, and footer chrome.')

const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' })
  response.end('<html><head><title>Interleaving practice</title></head><body><nav>Skip to content</nav><article><h1>Interleaving practice</h1><p>Interleaving different problem types during study improves the learner ability to discriminate between problem categories.</p><p>Blocked practice feels easier but produces weaker discrimination than interleaved practice.</p></article></body></html>')
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port

try {
  // 1. URL capture proposes a draft and writes nothing.
  const captured = await proposeCapture(vault, { kind: 'url', value: `http://127.0.0.1:${port}/` }, () => {})
  assert(captured.proposal, `Expected a capture proposal. ${captured.error ?? ''} ${captured.rawResponse ?? ''}`)
  const proposal = captured.proposal
  assert(proposal.path.toLowerCase().endsWith('.md'), `Proposed path must end in .md: ${proposal.path}`)
  assert(proposal.kind === 'new', `Expected a new-note proposal, got: ${proposal.kind}`)
  assert(!(await exists(join(vault, proposal.path))), `A capture proposal wrote to disk before approval: ${proposal.path}`)
  console.log(`Capture proposed ${proposal.path} without touching disk.`)

  // 2. An edit made in the preview is what actually lands on disk.
  const edited = `${proposal.content.trimEnd()}\n\nEdited in the preview before approval.\n`
  await writeVaultNote(vault, proposal.path, edited)
  const onDisk = await readFile(join(vault, proposal.path), 'utf8')
  assert(onDisk === edited, 'The approved write did not match the edited preview content.')
  assert(onDisk.includes('Edited in the preview before approval.'), 'The edited line is missing from the written note.')
  console.log('Approving wrote the edited draft, not the original proposal.')

  // 3. A discarded proposal writes nothing.
  const discarded = await proposeCapture(vault, { kind: 'text', value: 'Cognitive load theory suggests working memory limits how much new material a learner can absorb at once.' }, () => {})
  assert(discarded.proposal, `Expected a text-capture proposal. ${discarded.error ?? ''}`)
  assert(!(await exists(join(vault, discarded.proposal.path))), `A discarded proposal reached disk: ${discarded.proposal.path}`)
  console.log(`Text capture proposed ${discarded.proposal.path}; discarding left it unwritten.`)

  // 4. link_notes stops at a proposal too.
  const before = await readFile(join(vault, 'Research', 'practice.md'), 'utf8')
  const linked = await proposeLink(vault, 'Research/practice.md', 'Research/spacing.md', 'Both describe schedule effects on retention.', () => {})
  assert(linked.proposal, `Expected a link proposal. ${linked.error ?? ''}`)
  assert(linked.proposal.kind === 'edit', 'A link into an existing note must be an edit proposal.')
  assert(linked.proposal.content.includes('[[Research/spacing]]'), `Expected a wikilink in the proposal: ${linked.proposal.content}`)
  assert(linked.proposal.baseContent === before, 'The link proposal must carry the untouched base content for highlighting.')
  assert((await readFile(join(vault, 'Research', 'practice.md'), 'utf8')) === before, 'link_notes modified a note without approval.')
  console.log('link_notes proposed a wikilink without modifying the note.')

  // 5. A hallucinated note path is rejected rather than fabricated.
  const missing = await proposeLink(vault, 'Research/practice.md', 'Research/does-not-exist.md', 'context', () => {})
  assert(!missing.proposal && missing.error?.includes('Note not found'), `Expected a not-found error, got: ${JSON.stringify(missing)}`)
  console.log('link_notes rejects a note path that does not exist.')

  // 6. A read-only folder surfaces a real, specific OS error.
  const locked = join(vault, 'ReadOnly')
  await mkdir(locked, { recursive: true })
  await chmod(locked, 0o555)
  try {
    let surfaced = ''
    try {
      await writeVaultNote(vault, 'ReadOnly/blocked.md', '# Blocked\n')
    } catch (error) {
      surfaced = describeWriteFailure(error, 'ReadOnly/blocked.md')
    }
    assert(surfaced, 'A write into a read-only folder unexpectedly succeeded.')
    assert(/EACCES|EPERM|EROFS/.test(surfaced), `Expected a real OS error code in: ${surfaced}`)
    assert(surfaced.includes('ReadOnly/blocked.md'), `Expected the failing path in: ${surfaced}`)
    console.log(`Read-only write surfaced: ${surfaced}`)
  } finally {
    await chmod(locked, 0o755)
  }

  console.log('Phase 5 verified: proposals gate every write, edits are honoured, fs errors surface.')
} finally {
  server.close()
}
