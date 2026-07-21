import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importCorpusFiles, initializeCorpus } from './corpus'
import { buildMeetingReviewItems, buildTimelineEvents } from '../shared/workspace'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

const parent = await mkdtemp(join(tmpdir(), 'noema-corpus-parent-'))
const corpusPath = join(parent, 'Noema Library')
const config = await initializeCorpus(corpusPath, 'Noema Library')

assert(config.kind === 'noema' && config.name === 'Noema Library', 'A new library must identify itself as a Noema-owned corpus.')
for (const folder of ['Sources', 'Notes', 'Artifacts', 'Focus', 'Meetings', '.noema']) {
  assert(await exists(join(corpusPath, folder)), `Expected corpus folder ${folder}.`)
}

const sourcePath = await mkdtemp(join(tmpdir(), 'noema-corpus-import-'))
const markdownPath = join(sourcePath, 'research.md')
const textPath = join(sourcePath, 'interview.txt')
const unsupportedPath = join(sourcePath, 'binary.pdf')
await Promise.all([
  writeFile(markdownPath, '# Research\n\nEvidence survives import.\n'),
  writeFile(textPath, 'An interview excerpt worth remembering.\n'),
  writeFile(unsupportedPath, 'not a real pdf')
])

const first = await importCorpusFiles(corpusPath, [markdownPath, textPath, unsupportedPath])
assert(first.imported.length === 2 && first.skipped.length === 1, 'Markdown and text should import while unsupported files are reported honestly.')
assert((await readFile(join(corpusPath, 'Sources', 'research.md'), 'utf8')).includes('Evidence survives import'), 'Markdown source content must be preserved.')
assert((await readFile(join(corpusPath, 'Sources', 'interview.md'), 'utf8')).startsWith('# interview'), 'Plain text should become searchable Markdown.')

const second = await importCorpusFiles(corpusPath, [markdownPath])
assert(second.imported[0] === 'Sources/research-2.md', 'Repeated imports must not overwrite an existing corpus source.')

const modifiedAt = '2026-07-18T09:45:00.000Z'
const timeline = buildTimelineEvents({
  notes: [{ path: 'Sources/research.md', title: 'Research', status: 'indexed', modifiedAt } as import('../shared/types').CorpusNote],
  focusSessions: []
})
assert(timeline[0]?.timestamp === modifiedAt, 'Timeline note events must preserve the indexed file timestamp instead of pretending every note was created now.')

const meetingTasks = buildMeetingReviewItems(['Send the prototype', 'Verify citations'], 'Meetings/recap.md')
assert(meetingTasks.length === 2 && meetingTasks[0].sourcePaths[0] === 'Meetings/recap.md', 'Approved meeting tasks must enter Review with provenance back to the recap.')

console.log('Standalone corpus verified: owned structure, safe imports, conversion, and collision handling.')
