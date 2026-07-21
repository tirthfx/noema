/**
 * LIVE check (not part of `npm test`; requires NVIDIA_API_KEY). Exercises the real answerQuestion
 * path against NIM to confirm: a relevant selected folder GROUNDS without shortening the answer,
 * an irrelevant folder does not destroy quality, and clearing context still answers fully.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { answerQuestion } from './agent'
import { readSelectedContext } from './context-reader'
import type { ToolCallActivity } from '../shared/types'

const noop = (_activity: ToolCallActivity): void => undefined

function summarize(label: string, answer: Awaited<ReturnType<typeof answerQuestion>>): number {
  const text = answer.answer?.plainText ?? answer.answer?.claims.map((claim) => claim.text).join(' ') ?? answer.error ?? ''
  const mode = answer.answer?.mode ?? 'error'
  const files = answer.answer?.contextFiles?.join(', ') ?? '—'
  console.log(`\n=== ${label} ===`)
  console.log(`mode=${mode}  chars=${text.length}  contextFiles=[${files}]`)
  console.log(text.slice(0, 600))
  return text.length
}

const projectDir = await mkdtemp(join(tmpdir(), 'noema-live-project-'))
await Promise.all([
  writeFile(join(projectDir, 'auth.md'), '# Authentication\n\nThe service authenticates users with OAuth2. Access tokens live 15 minutes; refresh tokens rotate on every use and are stored hashed. Failed logins are rate-limited to 5 attempts per minute per IP. Sessions are revoked server-side on password change.\n', 'utf8'),
  writeFile(join(projectDir, 'billing.md'), '# Billing\n\nInvoices are generated monthly. Tax is applied per region. Refunds go through Stripe.\n', 'utf8')
])
const cookingDir = await mkdtemp(join(tmpdir(), 'noema-live-cooking-'))
await writeFile(join(cookingDir, 'risotto.md'), '# Risotto\n\nToast arborio rice, add warm stock one ladle at a time, stir until creamy, finish with parmesan.\n', 'utf8')

const question = 'How does token authentication and session revocation work in this project, and what are the security tradeoffs? Explain in detail.'
const vault = await mkdtemp(join(tmpdir(), 'noema-live-vault-'))

const projectContext = await readSelectedContext(projectDir, 'folder')
const cookingContext = await readSelectedContext(cookingDir, 'folder')

const noFolder = await answerQuestion(vault, question, noop, [], {})
const relevant = await answerQuestion(vault, question, noop, [], { selectedContext: [projectContext] })
const irrelevant = await answerQuestion(vault, question, noop, [], { selectedContext: [cookingContext] })
const exclusive = await answerQuestion(vault, 'Using only this folder, list the exact token lifetimes and rate limits.', noop, [], { selectedContext: [projectContext] })

const a = summarize('A · no selected folder', noFolder)
const b = summarize('B · RELEVANT folder selected', relevant)
const c = summarize('C · IRRELEVANT folder (cooking) selected', irrelevant)
const e = summarize('E · exclusive "only this folder"', exclusive)

console.log('\n--- verdicts ---')
console.log(`relevant folder grounded (names a project file): ${(relevant.answer?.contextFiles?.length ?? 0) > 0}`)
console.log(`relevant answer not gutted vs no-folder (b >= a*0.5): ${b >= a * 0.5}  (a=${a} b=${b})`)
console.log(`irrelevant folder did not collapse the answer (c >= a*0.4): ${c >= a * 0.4}  (a=${a} c=${c})`)
console.log(`exclusive answer produced: ${e > 0}`)
