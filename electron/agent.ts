import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentResult, Artifact, ArtifactResult, GroundedAnswerResult, Persona, ToolCallActivity } from '../shared/types'
import { validateArtifact } from './citation-validator'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'

const NIM_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MODEL = 'z-ai/glm-5.2'
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

const tools = [
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

function readApiKey(): string {
  if (process.env.NVIDIA_API_KEY) return process.env.NVIDIA_API_KEY
  try {
    const key = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^NVIDIA_API_KEY=(.+)$/m)?.[1]?.trim()
    if (key) return key
  } catch {
    // Production builds receive the key through their environment.
  }
  throw new Error('NVIDIA_API_KEY is not configured in the main process.')
}

async function requestChat(messages: ChatMessage[]): Promise<{ payload?: ChatResponse; raw?: string; error?: string }> {
  let lastError = 'Unknown NIM error.'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(NIM_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${readApiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: 'auto' }),
        signal: AbortSignal.timeout(45_000)
      })
      const raw = await response.text()
      if (response.status === 403) return { error: 'NIM chat access is forbidden. Enable Public API Endpoints for this personal organization in NVIDIA NIM before continuing.' }
      if (!response.ok) {
        lastError = `NIM chat request failed with HTTP ${response.status}.`
        if (response.status >= 500 || response.status === 429) continue
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
    return searchNotes(vaultPath, input.query, Math.max(1, Math.min(20, Math.floor(input.topK))))
  }
  if (name === 'read_note') {
    if (typeof input.path !== 'string' || !input.path) return { error: 'read_note requires a note path.' }
    const note = await readNote(vaultPath, input.path)
    return note ?? { error: `Note not found: ${input.path}` }
  }
  if (name === 'list_notes') {
    if (input.folder !== undefined && typeof input.folder !== 'string') return { error: 'list_notes folder must be a string.' }
    return listNotes(vaultPath, input.folder as string | undefined)
  }
  return { error: `Unknown read-only tool: ${name}` }
}

export async function sendAgentMessage(vaultPath: string, userMessage: string, onActivity: (activity: ToolCallActivity) => void): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are Noema, a research companion. Use the supplied read-only vault tools when a question concerns the user\'s notes. Answer conversationally from the returned material. Do not claim to have read a note unless a tool result supports it.' },
    { role: 'user', content: userMessage }
  ]
  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const response = await requestChat(messages)
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
      if (!['search_notes', 'read_note', 'list_notes'].includes(call.function.name)) return malformed(response.raw ?? JSON.stringify(call))
      const tool = call.function.name as ToolCallActivity['tool']
      onActivity({ id: call.id, tool, input, status: 'running' })
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
  return { error: 'The agent reached its tool-call limit before producing an answer. Retry your question.', retryable: true }
}

function artifactFrom(value: unknown): Artifact | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as Partial<Artifact>
  if (typeof draft.title !== 'string' || !Array.isArray(draft.claims) || !Array.isArray(draft.tensions)) return null
  return draft as Artifact
}

function parseModelJson(content: string): unknown {
  return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
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
