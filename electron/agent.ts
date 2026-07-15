import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentResult, ToolCallActivity } from '../shared/types'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'

const NIM_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MODEL = 'z-ai/glm-5.2'
const MAX_TURNS = 8

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
      const result = await executeTool(vaultPath, tool, input)
      onActivity({ id: call.id, tool, input, status: 'complete', summary: displaySummary(tool, result) })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  return { error: 'The agent reached its tool-call limit before producing an answer. Retry your question.', retryable: true }
}
