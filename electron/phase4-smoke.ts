import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { answerQuestion } from './agent'
import { getVaultIndex } from './index'

const vault = await mkdtemp(join(tmpdir(), 'noema-phase4-'))
await mkdir(join(vault, '.noema'), { recursive: true })
await writeFile(join(vault, 'practice.md'), '# Retrieval practice\nRetrieval practice improves durable learning by requiring recall rather than passive review.\n')
await getVaultIndex(vault).refresh()
const greetingActivity: unknown[] = []
const greeting = await answerQuestion(vault, 'Hi', (activity) => greetingActivity.push(activity))
if (greeting.answer?.mode !== 'conversation' || !greeting.answer.plainText || greetingActivity.length !== 0) throw new Error(`A greeting should receive a direct conversational reply without corpus search. Result: ${JSON.stringify(greeting)} Activities: ${JSON.stringify(greetingActivity)}`)

const grounded = await answerQuestion(vault, 'What do my notes say improves durable learning?', () => {})
if (!grounded.answer || grounded.answer.refusal || grounded.answer.claims.length === 0) throw new Error(`${grounded.error ?? 'Expected a cited grounded answer.'}\n${grounded.rawResponse ?? ''}`)
if (grounded.answer.claims.some((claim) => claim.citations.length === 0)) throw new Error('An uncited answer claim reached the renderer.')

const generalActivity: unknown[] = []
const general = await answerQuestion(vault, 'How do black holes evaporate?', (activity) => generalActivity.push(activity))
if (general.answer?.mode !== 'conversation' || !general.answer.plainText || generalActivity.length !== 0) throw new Error(general.error ?? 'Expected a direct general-knowledge answer without corpus search.')

const followUpActivity: unknown[] = []
const followUp = await answerQuestion(vault, "I don't understand", (activity) => followUpActivity.push(activity), [
  { role: 'user', content: 'What is Electron?' },
  { role: 'assistant', content: 'Electron is a framework for building desktop apps with web technologies.' }
])
if (followUp.answer?.mode !== 'conversation' || !followUp.answer.plainText || followUpActivity.length !== 0) throw new Error(followUp.error ?? 'Expected a context-aware conversational follow-up without corpus search.')

const refusal = await answerQuestion(vault, 'What do my notes say about black hole evaporation?', () => {})
if (!refusal.answer?.refusal || refusal.answer.mode !== 'corpus') throw new Error('Expected an honest no-match response for a personal-corpus question.')

const contextRequestActivity: unknown[] = []
const contextRequest = await answerQuestion(vault, 'Inspect the local project folder at /Users/example/Desktop/project and explain its architecture.', (activity) => contextRequestActivity.push(activity))
if (contextRequest.answer?.mode !== 'context' || !contextRequest.answer.contextRequest || contextRequestActivity.length !== 0) throw new Error(`Expected an explicit local-context handoff instead of invented filesystem access. Result: ${JSON.stringify(contextRequest)}`)

const selectedContextActivity: unknown[] = []
const selectedContext = await answerQuestion(vault, 'Explain the architecture of the selected project.', (activity) => selectedContextActivity.push(activity), [], {
  selectedContext: [{ name: 'project', kind: 'folder', content: 'README.md\n\nThe app uses Electron with a sandboxed React renderer and a narrow preload bridge.' }]
})
if (selectedContext.answer?.mode !== 'context' || !selectedContext.answer.plainText || selectedContextActivity.length !== 0) throw new Error(`Expected a direct answer from explicitly selected context. Result: ${JSON.stringify(selectedContext)}`)

const webActivity: unknown[] = []
const web = await answerQuestion(vault, 'Read https://example.com and tell me what that live page is for.', (activity) => webActivity.push(activity))
if (web.answer?.mode !== 'web' || web.answer.claims.length === 0 || webActivity.length === 0) throw new Error(`Expected a source-grounded live web answer. Result: ${JSON.stringify(web)} Activities: ${JSON.stringify(webActivity)}`)
if (!web.answer.approach?.length || web.answer.claims.some((claim) => claim.citations.some((citation) => !citation.url))) throw new Error('Expected a visible approach summary and clickable web citations.')

console.log('Validated semantic routing for conversation, general knowledge, corpus recall, local context, source-grounded web research, and honest no-match answers.')
