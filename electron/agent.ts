import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentResult, Artifact, ArtifactResult, CaptureInput, GroundedAnswerResult, NoteProposal, Persona, ProposalResult, ToolCallActivity } from '../shared/types'
import { resolveCapture } from './capture'
import { validateArtifact } from './citation-validator'
import { CHAT_MODEL } from './index'
import { linkNotes } from './tools/link-notes'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'
import { writeNote } from './tools/write-note'

const NIM_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MAX_TURNS = 8
export const GROUNDING_THRESHOLD = 0.28

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>
}

const readOnlyTools = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: 'Search indexed vault notes for relevant passages before answering questions about the vault.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, topK: { type: 'integer', minimum: 1, maximum: 20 } },
        required: ['query', 'topK'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: 'Read the full contents of an indexed note after locating it.',
      parameters: {
        type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'List indexed Markdown notes, optionally within a vault-relative folder.',
      parameters: {
        type: 'object', properties: { folder: { type: 'string' } }, additionalProperties: false
      }
    }
  }
] as const

/**
 * Gated tools (architecture.md §5). The loop never executes these — it converts the call
 * into a NoteProposal and stops, so no code path exists from the agent loop to an fs write.
 */
const writeNoteTool = {
  type: 'function',
  function: {
    name: 'write_note',
    description: 'Propose a new or rewritten vault note. This does not write to disk; the user reviews and approves the proposal first. Call this once, last, when the draft is ready.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Vault-relative path ending in .md' }, content: { type: 'string', description: 'Full Markdown body of the note' } },
      required: ['path', 'content'],
      additionalProperties: false
    }
  }
} as const

const captureTools = [...readOnlyTools, writeNoteTool] as const
const GATED_TOOLS = new Set(['write_note', 'link_notes'])

function readApiKey(): string {
  try {
    const key = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^NVIDIA_API_KEY=(.+)$/m)?.[1]?.trim()
    if (key) return key
  } catch {
    // Production builds may not ship a local .env file.
  }
  if (process.env.NVIDIA_API_KEY) return process.env.NVIDIA_API_KEY
  throw new Error('NVIDIA_API_KEY is not configured in the main process.')
}

async function requestChat(messages: ChatMessage[], activeTools: readonly unknown[] = readOnlyTools): Promise<{ payload?: ChatResponse; raw?: string; error?: string }> {
  let lastError = 'Unknown NIM error.'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(NIM_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${readApiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: CHAT_MODEL, messages, tools: activeTools, tool_choice: 'auto' }),
        signal: AbortSignal.timeout(45_000)
      })
      const raw = await response.text()
      if (response.status === 403) return { error: 'NIM chat access is forbidden. Enable Public API Endpoints for this personal organization in NVIDIA NIM before continuing.' }
      if (!response.ok) {
        const detail = raw.trim().slice(0, 200)
        lastError = `NIM chat request for ${CHAT_MODEL} failed with HTTP ${response.status}.${detail ? ` Response: ${detail}` : ''}`
        if (response.status === 429) {
          // NIM meters quota per model: a depleted model keeps returning 429 for a long
          // window while other models on the same key still answer, then recovers on its own.
          lastError += ` NIM rate limits each model separately, so this usually means ${CHAT_MODEL}'s quota is spent rather than that the key is wrong. It recovers after a pause.`
        }
        if (response.status >= 500 || response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after'))
          const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1_000, 15_000) : 5_000
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
          continue
        }
        return { error: lastError }
      }
      try {
        return { payload: JSON.parse(raw) as ChatResponse, raw }
      } catch {
        return { raw, error: 'NIM returned a malformed response. Review the raw response and retry.' }
      }
    } catch (error) {
      lastError = error instanceof Error && error.name === 'TimeoutError'
        ? 'NIM chat request timed out.'
        : error instanceof Error ? `NIM chat request failed: ${error.message}` : 'NIM chat request failed.'
    }
  }
  return { error: `${lastError} Retried once without success.` }
}

function malformed(rawResponse: string): AgentResult {
  return { error: 'The model returned a malformed or incomplete tool call. Nothing was executed.', rawResponse, retryable: true }
}

function parseToolCalls(value: unknown): ToolCall[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every((call) => {
    if (!call || typeof call !== 'object') return false
    const candidate = call as Partial<ToolCall>
    return typeof candidate.id === 'string' && candidate.type === 'function' && typeof candidate.function?.name === 'string' && typeof candidate.function?.arguments === 'string'
  })) return null
  return value as ToolCall[]
}

function displaySummary(name: ToolCallActivity['tool'], result: unknown): string {
  if (name === 'search_notes') return `${Array.isArray(result) ? result.length : 0} matches`
  if (name === 'list_notes') return `${Array.isArray(result) ? result.length : 0} notes`
  return typeof result === 'string' ? 'note loaded' : 'not found'
}

async function executeTool(vaultPath: string, name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === 'search_notes') {
    if (typeof input.query !== 'string' || !input.query.trim() || typeof input.topK !== 'number') return { error: 'search_notes requires a query string and numeric topK.' }
    return searchNotes(vaultPath, input.query, Math.max(1, Math.min(8, Math.floor(input.topK))))
  }
  if (name === 'read_note') {
    if (typeof input.path !== 'string' || !input.path) return { error: 'read_note requires a note path.' }
    const note = await readNote(vaultPath, input.path)
    // Full notes remain available through read_note; bound the model transcript so a
    // batch of large notes cannot starve the following completion.
    return note ? note.slice(0, 12_000) : { error: `Note not found: ${input.path}` }
  }
  if (name === 'list_notes') {
    if (input.folder !== undefined && typeof input.folder !== 'string') return { error: 'list_notes folder must be a string.' }
    return listNotes(vaultPath, input.folder as string | undefined)
  }
  return { error: `Unknown read-only tool: ${name}` }
}

/** Turns a gated tool call into a proposal. Returning a NoteProposal stops the loop. */
type GatedHandler = (name: string, input: Record<string, unknown>) => Promise<NoteProposal | { error: string }>

interface LoopOptions {
  activeTools?: readonly unknown[]
  gatedHandler?: GatedHandler
  limitMessage?: string
}

/**
 * Shared tool-calling loop for every agent flow. Read-only tools execute and feed their
 * results back; gated tools (write_note/link_notes) are handed to `gatedHandler`, which
 * returns a proposal for EditablePreview instead of performing the action.
 */
async function runToolLoop(vaultPath: string, messages: ChatMessage[], onActivity: (activity: ToolCallActivity) => void, options: LoopOptions = {}): Promise<ProposalResult> {
  const activeTools = options.activeTools ?? readOnlyTools
  const allowed = new Set(activeTools.map((tool) => (tool as { function: { name: string } }).function.name))

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const response = await requestChat(messages, activeTools)
    if (response.error) return response.raw ? { error: response.error, rawResponse: response.raw, retryable: true } : { error: response.error, retryable: true }
    const message = response.payload?.choices?.[0]?.message
    if (!message) return malformed(response.raw ?? '')
    const toolCalls = message.tool_calls === undefined ? [] : parseToolCalls(message.tool_calls)
    if (toolCalls === null) return malformed(response.raw ?? JSON.stringify(message))
    const content = typeof message.content === 'string' ? message.content : null
    if (toolCalls.length === 0) {
      if (content === null) return malformed(response.raw ?? JSON.stringify(message))
      return { content }
    }
    messages.push({ role: 'assistant', content, tool_calls: toolCalls })
    for (const call of toolCalls) {
      let input: Record<string, unknown>
      try {
        const parsed = JSON.parse(call.function.arguments) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Tool arguments must be an object.')
        input = parsed as Record<string, unknown>
      } catch {
        return malformed(response.raw ?? JSON.stringify(call))
      }
      if (!allowed.has(call.function.name)) return malformed(response.raw ?? JSON.stringify(call))
      const tool = call.function.name as ToolCallActivity['tool']
      onActivity({ id: call.id, tool, input, status: 'running' })

      if (GATED_TOOLS.has(tool)) {
        if (!options.gatedHandler) return malformed(response.raw ?? JSON.stringify(call))
        const gated = await options.gatedHandler(tool, input)
        if ('error' in gated) {
          // A rejected proposal is a normal tool result: let the model correct its path
          // or content rather than failing the whole capture.
          onActivity({ id: call.id, tool, input, status: 'complete', summary: 'proposal rejected' })
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(gated) })
          continue
        }
        onActivity({ id: call.id, tool, input, status: 'complete', summary: `proposed ${gated.path}` })
        return { proposal: gated }
      }

      let result: unknown
      try {
        result = await executeTool(vaultPath, tool, input)
      } catch (error) {
        result = { error: error instanceof Error ? error.message : `Unable to execute ${tool}.` }
      }
      onActivity({ id: call.id, tool, input, status: 'complete', summary: displaySummary(tool, result) })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  return { error: options.limitMessage ?? 'The agent reached its tool-call limit before producing an answer. Retry your question.', retryable: true }
}

export async function sendAgentMessage(vaultPath: string, userMessage: string, onActivity: (activity: ToolCallActivity) => void): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are Noema, a research companion. Use the supplied read-only vault tools when a question concerns the user\'s notes. Answer conversationally from the returned material. Do not claim to have read a note unless a tool result supports it.' },
    { role: 'user', content: userMessage }
  ]
  return runToolLoop(vaultPath, messages, onActivity)
}

function artifactFrom(value: unknown): Artifact | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as Partial<Artifact>
  if (typeof draft.title !== 'string' || !Array.isArray(draft.claims) || !Array.isArray(draft.tensions)) return null
  return draft as Artifact
}

function parseModelJson(content: string): unknown {
  // Reasoning models emit chain-of-thought ahead of the answer and may fence the JSON
  // anywhere in the message, so isolate the payload instead of parsing the whole reply.
  let text = content.trim()
  const reasoningEnd = text.lastIndexOf('</think>')
  if (reasoningEnd !== -1) text = text.slice(reasoningEnd + '</think>'.length).trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) {
    text = fenced[1].trim()
  } else {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) text = text.slice(start, end + 1)
  }
  return JSON.parse(text)
}

export async function generateArtifact(vaultPath: string, topic: string, persona: Persona, onActivity: (activity: ToolCallActivity) => void): Promise<ArtifactResult> {
  const tone = persona === 'Academic' ? 'formal and analytical' : persona === 'Socratic Critic' ? 'probing, careful, and explicit about uncertainty' : 'clear, direct, and accessible'
  const prompt = `Create a genuine literature review about "${topic}" from this vault only. Use search_notes and read_note before writing. Your tone is ${tone}. Return ONLY valid JSON: {"title":string,"claims":[{"text":string,"citations":[{"path":string,"quote":string}]}],"tensions":[{"question":string,"sides":[{"text":string,"citations":[{"path":string,"quote":string}]}]}]}. Every claim and every tension side needs a citation whose quote is a verbatim passage from the named note. Do not add uncited claims. Identify genuine contradictions only when both sides are supported.`
  const result = await sendAgentMessage(vaultPath, prompt, onActivity)
  if (!result.content) return result
  try {
    const draft = artifactFrom(parseModelJson(result.content))
    if (!draft) throw new Error('shape')
    return { artifact: await validateArtifact(vaultPath, draft) }
  } catch {
    return { error: 'The model did not return a valid literature-review structure. Nothing was rendered as an artifact.', rawResponse: result.content, retryable: true }
  }
}

export async function answerQuestion(vaultPath: string, question: string, onActivity: (activity: ToolCallActivity) => void): Promise<GroundedAnswerResult> {
  const activityId = `grounding-${Date.now()}`
  onActivity({ id: activityId, tool: 'search_notes', input: { query: question, topK: 5 }, status: 'running' })
  let matches
  try { matches = await searchNotes(vaultPath, question, 5) } catch (error) {
    onActivity({ id: activityId, tool: 'search_notes', input: { query: question, topK: 5 }, status: 'complete', summary: 'search failed' })
    return { error: error instanceof Error ? error.message : 'Noema could not search this vault.', retryable: true }
  }
  onActivity({ id: activityId, tool: 'search_notes', input: { query: question, topK: 5 }, status: 'complete', summary: `${matches.length} matches` })
  if (!matches[0] || matches[0].score < GROUNDING_THRESHOLD) return { answer: { claims: [], refusal: true } }
  const prompt = `Answer this vault question: "${question}". Use search_notes and read_note as needed. Return ONLY valid JSON: {"claims":[{"text":string,"citations":[{"path":string,"quote":string}]}]}. Every claim needs at least one verbatim quote from its named vault note. Do not use general knowledge or include an unsupported claim.`
  const result = await sendAgentMessage(vaultPath, prompt, onActivity)
  if (!result.content) return result
  try {
    const parsed = parseModelJson(result.content) as { claims?: unknown }
    if (!Array.isArray(parsed.claims)) throw new Error('shape')
    const validated = await validateArtifact(vaultPath, { title: '', claims: parsed.claims as Artifact['claims'], tensions: [] })
    return validated.claims.length ? { answer: { claims: validated.claims } } : { answer: { claims: [], refusal: true } }
  } catch { return { error: 'The model did not return a valid grounded-answer structure.', rawResponse: result.content, retryable: true } }
}

/** Distinct folders already in use, so a proposal can follow the user's filing conventions. */
async function folderConventions(vaultPath: string): Promise<string> {
  const notes = await listNotes(vaultPath)
  const folders = new Set<string>()
  for (const note of notes) {
    const folder = note.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    if (folder) folders.add(folder)
  }
  if (folders.size === 0) return 'This vault keeps every note in its root folder, so propose a root-level path.'
  return `Existing folders in this vault: ${[...folders].sort().slice(0, 40).map((folder) => `${folder}/`).join(', ')}. File the note in the folder that fits best; only propose a new folder if none of these fit.`
}

const CAPTURE_TEXT_LIMIT = 12_000

/**
 * F3 capture: turn pasted text or a fetched URL into a filed note proposal.
 * Returns a NoteProposal for EditablePreview — nothing reaches disk here.
 */
export async function proposeCapture(vaultPath: string, input: CaptureInput, onActivity: (activity: ToolCallActivity) => void): Promise<ProposalResult> {
  let captured
  try {
    captured = await resolveCapture(input)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Noema could not read that captured content.', retryable: true }
  }

  const body = captured.text.slice(0, CAPTURE_TEXT_LIMIT)
  const truncated = captured.text.length > CAPTURE_TEXT_LIMIT ? '\n\n[Content truncated for length.]' : ''
  const origin = captured.source ? `Source URL: ${captured.source}\nPage title: ${captured.title}` : 'Captured from pasted text.'
  const conventions = await folderConventions(vaultPath)

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are Noema, filing captured material into a researcher\'s Markdown vault. Turn the captured content into one clean, well-structured note: a descriptive title, tidied prose that preserves the substance, and a sensible vault-relative path. You may call search_notes or list_notes to check the vault\'s conventions. When the draft is ready, call write_note exactly once. Never invent facts that are absent from the captured content.'
    },
    {
      role: 'user',
      content: `${origin}\n\n${conventions}\n\nWrite the note as Markdown beginning with a single \`# Title\` heading. If a source URL is present, include it in the note. Preserve the captured meaning; clean up navigation text, boilerplate, and broken spacing.\n\nCaptured content:\n"""\n${body}${truncated}\n"""`
    }
  ]

  const result = await runToolLoop(vaultPath, messages, onActivity, {
    activeTools: captureTools,
    gatedHandler: async (_name, toolInput) => {
      if (typeof toolInput.path !== 'string' || typeof toolInput.content !== 'string') return { error: 'write_note requires a path string and a content string.' }
      return writeNote(vaultPath, toolInput.path, toolInput.content, captured.source)
    },
    limitMessage: 'Noema could not settle on a note draft for this capture. Try again.'
  })

  if (result.proposal || result.error) return result
  // The model answered in prose instead of proposing a note; treat that as a failed capture
  // rather than silently discarding what the user captured.
  return { error: 'Noema did not produce a note draft for this capture. Try again.', rawResponse: result.content, retryable: true }
}

/**
 * F3 link proposal: a wikilink insertion routed through the same approval gate.
 * Deterministic by design — the caller names both notes and the context.
 */
export async function proposeLink(vaultPath: string, fromPath: string, toPath: string, context: string, onActivity: (activity: ToolCallActivity) => void): Promise<ProposalResult> {
  const activityId = `link-${Date.now()}`
  const input = { fromPath, toPath, context }
  onActivity({ id: activityId, tool: 'link_notes', input, status: 'running' })
  const proposal = await linkNotes(vaultPath, fromPath, toPath, context)
  if ('error' in proposal) {
    onActivity({ id: activityId, tool: 'link_notes', input, status: 'complete', summary: 'proposal rejected' })
    return { error: proposal.error, retryable: true }
  }
  onActivity({ id: activityId, tool: 'link_notes', input, status: 'complete', summary: `proposed ${proposal.path}` })
  return { proposal }
}
