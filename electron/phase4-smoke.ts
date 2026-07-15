import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { answerQuestion } from './agent'
import { getVaultIndex } from './index'

const vault = await mkdtemp(join(tmpdir(), 'noema-phase4-'))
await mkdir(join(vault, '.noema'), { recursive: true })
await writeFile(join(vault, 'practice.md'), '# Retrieval practice\nRetrieval practice improves durable learning by requiring recall rather than passive review.\n')
await getVaultIndex(vault).refresh()
const grounded = await answerQuestion(vault, 'What improves durable learning?', () => {})
if (!grounded.answer || grounded.answer.refusal || grounded.answer.claims.length === 0) throw new Error(`${grounded.error ?? 'Expected a cited grounded answer.'}\n${grounded.rawResponse ?? ''}`)
if (grounded.answer.claims.some((claim) => claim.citations.length === 0)) throw new Error('An uncited answer claim reached the renderer.')
const refusal = await answerQuestion(vault, 'How do black holes evaporate?', () => {})
if (!refusal.answer?.refusal) throw new Error('Expected an out-of-scope refusal.')
console.log('Validated a cited answer and a no-match refusal.')
