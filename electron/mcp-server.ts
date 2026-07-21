/**
 * Read-only MCP server exposing Noema's corpus to other agents.
 *
 * Deliberately mirrors the read-only tool surface the in-app agent already uses
 * (search_notes / read_note / list_notes) plus ask_corpus, a grounded+cited answer
 * that reuses the same citation-validator as the app. There is no write_note or
 * link_notes tool here: every write in Noema stays behind the in-app EditablePreview
 * approval gate, and an external agent must not get a shortcut around that gate.
 *
 * Runs standalone over stdio — no Electron runtime required, since vault.ts, index.ts,
 * and the tool modules it reuses have no Electron dependency.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getVaultIndex } from './index'
import { answerQuestion } from './agent'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'
import { defaultUserDataPath, isReadableDirectory, resolveSavedVault } from './vault-pointer'

/**
 * Resolves the vault this MCP server reads from. `NOEMA_VAULT_PATH` lets a caller point at a
 * specific vault explicitly; otherwise this follows the same pointer the desktop app writes,
 * through the shared resolver, so "the vault you have open in Noema" is the default with no
 * extra configuration and no second copy of the lookup rules.
 */
async function resolveVaultPath(): Promise<string> {
  const override = process.env.NOEMA_VAULT_PATH
  if (override) {
    if (!(await isReadableDirectory(override))) throw new Error(`NOEMA_VAULT_PATH does not point to a readable directory: ${override}`)
    return override
  }
  const saved = await resolveSavedVault(defaultUserDataPath())
  if (!saved) throw new Error('No Noema vault is configured. Open a corpus in the Noema app first, or set NOEMA_VAULT_PATH.')
  return saved.vaultPath
}

/**
 * Reload the desktop-owned persisted index, then cheaply compare it with Markdown mtimes.
 * Desktop writes normally persist an updated index, so the common path is one JSON read and
 * one corpus walk. If an earlier desktop refresh failed, only stale files are re-embedded.
 */
async function vaultIndexFor(vaultPath: string) {
  const index = getVaultIndex(vaultPath)
  await index.reload()
  const [status, corpus] = await Promise.all([index.getStatus(), index.getCorpus()])
  if (status.needsRebuild || corpus.some((note) => note.status !== 'indexed')) await index.refresh()
  return index
}

const TOOLS = [
  {
    name: 'search_notes',
    description: "Search the user's Noema corpus for passages relevant to a query. Use this before answering questions about the user's own notes or knowledge.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
        topK: { type: 'integer', minimum: 1, maximum: 20, description: 'Max number of matches to return (default 5).' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_note',
    description: 'Read the full Markdown contents of a specific note in the corpus, by its corpus-relative path.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Corpus-relative note path, e.g. "Notes/example.md".' } },
      required: ['path']
    }
  },
  {
    name: 'list_notes',
    description: 'List indexed Markdown notes in the corpus, optionally scoped to one folder.',
    inputSchema: {
      type: 'object',
      properties: { folder: { type: 'string', description: 'Corpus-relative folder to list, e.g. "Sources". Omit to list everything.' } }
    }
  },
  {
    name: 'ask_corpus',
    description: "Ask a grounded question against the user's Noema corpus and get back a synthesized answer whose every claim is code-validated against the source notes, with citations. Refuses rather than guessing if nothing relevant is indexed.",
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'The question to answer from the corpus.' } },
      required: ['question']
    }
  }
] as const

async function main(): Promise<void> {
  const server = new Server({ name: 'noema', version: '0.1.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const input = (args ?? {}) as Record<string, unknown>
    try {
      const vaultPath = await resolveVaultPath()

      if (name === 'search_notes') {
        if (typeof input.query !== 'string' || !input.query.trim()) throw new Error('search_notes requires a non-empty query string.')
        const topK = typeof input.topK === 'number' ? Math.max(1, Math.min(20, Math.floor(input.topK))) : 5
        await vaultIndexFor(vaultPath)
        const matches = await searchNotes(vaultPath, input.query, topK)
        return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] }
      }

      if (name === 'read_note') {
        if (typeof input.path !== 'string' || !input.path.trim()) throw new Error('read_note requires a note path.')
        const note = await readNote(vaultPath, input.path)
        if (note === null) return { content: [{ type: 'text', text: `Note not found: ${input.path}` }], isError: true }
        return { content: [{ type: 'text', text: note }] }
      }

      if (name === 'list_notes') {
        if (input.folder !== undefined && typeof input.folder !== 'string') throw new Error('list_notes folder must be a string.')
        const notes = await listNotes(vaultPath, input.folder as string | undefined)
        return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] }
      }

      if (name === 'ask_corpus') {
        if (typeof input.question !== 'string' || !input.question.trim()) throw new Error('ask_corpus requires a question string.')
        await vaultIndexFor(vaultPath)
        const result = await answerQuestion(vaultPath, input.question, () => {}, [], { forceCorpus: true })
        if (result.error) return { content: [{ type: 'text', text: result.error }], isError: true }
        return { content: [{ type: 'text', text: JSON.stringify(result.answer, null, 2) }] }
      }

      throw new Error(`Unknown tool: ${name}`)
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Unknown error.' }], isError: true }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error('Noema MCP server failed to start:', error)
  process.exit(1)
})
