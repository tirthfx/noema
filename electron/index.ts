import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IndexRecord, IndexStatus, RecallItem, SearchMatch } from '../shared/types'
import { basename } from 'node:path'
import { chunkMarkdown, readVaultNote, walkMarkdownFiles } from './vault'

export const EMBEDDING_MODEL = 'nvidia/llama-nemotron-embed-1b-v2'
export const EMBEDDING_DIMENSION = 2048
export const CHAT_MODEL = 'z-ai/glm-5.2'
const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'
const INDEX_VERSION = 1

interface StoredIndex {
  version: number
  model: string
  dimension: number
  records: IndexRecord[]
}

export class NimApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'NimApiError'
  }
}

function readApiKey(): string {
  const key = process.env.NVIDIA_API_KEY
  if (key) return key
  try {
    const localKey = readFileSync(join(process.cwd(), '.env'), 'utf8')
      .match(/^NVIDIA_API_KEY=(.+)$/m)?.[1]?.trim()
    if (localKey) return localKey
  } catch {
    // Production deployments should provide NVIDIA_API_KEY through the environment.
  }
  throw new NimApiError('NVIDIA_API_KEY is not configured in the main process.')
}

async function nimFetch(path: string, body: Record<string, unknown>): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${NIM_BASE_URL}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${readApiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000)
      })
      if (response.ok || (response.status < 500 && response.status !== 429)) return response
      lastError = new NimApiError(`NIM request failed with HTTP ${response.status}.`, response.status)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('NIM request failed.')
    }
  }
  throw new NimApiError(`NIM request failed after one retry: ${lastError?.message ?? 'unknown error'}`)
}

async function embed(text: string, inputType: 'passage' | 'query'): Promise<number[]> {
  const response = await nimFetch('/embeddings', {
    model: EMBEDDING_MODEL,
    input: text,
    input_type: inputType,
    encoding_format: 'float',
    truncate: 'NONE'
  })
  if (response.status === 403) {
    throw new NimApiError('NIM denied the embedding request. Check this API key has access to NVIDIA Public API Endpoints.', 403)
  }
  if (!response.ok) throw new NimApiError(`NIM embedding request failed with HTTP ${response.status}.`, response.status)
  const payload = await response.json() as { data?: Array<{ embedding?: unknown }> }
  const vector = payload.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION || !vector.every((value) => typeof value === 'number')) {
    throw new NimApiError('NIM returned an invalid embedding vector.')
  }
  return vector
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] * left[index]
    rightMagnitude += right[index] * right[index]
  }
  return leftMagnitude === 0 || rightMagnitude === 0 ? 0 : dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

export class VaultIndex {
  private records: IndexRecord[] = []
  private loading: Promise<void> | null = null
  private needsRebuild = false
  /** Serialises refresh(); concurrent refreshes would race on the same temp file. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(readonly vaultPath: string) {}

  private get indexPath(): string {
    return join(this.vaultPath, '.noema', 'index.json')
  }

  /**
   * Memoised so concurrent callers await the same read. Flipping a `loaded` flag before
   * awaiting would let a second caller treat a still-empty index as fully loaded.
   */
  async load(): Promise<void> {
    this.loading ??= this.performLoad()
    return this.loading
  }

  private async performLoad(): Promise<void> {
    try {
      const raw = await readFile(this.indexPath, 'utf8')
      const parsed = JSON.parse(raw) as StoredIndex
      if (parsed.version !== INDEX_VERSION || parsed.model !== EMBEDDING_MODEL || parsed.dimension !== EMBEDDING_DIMENSION || !Array.isArray(parsed.records)) {
        this.needsRebuild = true
        this.records = []
        return
      }
      this.records = parsed.records.filter(isIndexRecord)
      this.needsRebuild = this.records.length !== parsed.records.length
    } catch (error) {
      this.needsRebuild = true
      this.records = []
    }
  }

  /**
   * Queued rather than coalesced: a refresh requested after an approved write must observe
   * that new note, so it waits for any in-flight refresh instead of joining it.
   */
  async refresh(): Promise<IndexStatus> {
    const run = this.queue.then(() => this.performRefresh(), () => this.performRefresh())
    this.queue = run.catch(() => undefined)
    return run
  }

  private async performRefresh(): Promise<IndexStatus> {
    await this.load()
    const originalRecords = this.records
    const rebuildAll = this.needsRebuild
    try {
      const notes = await walkMarkdownFiles(this.vaultPath)
      const noteMtimes = new Map(notes.map((note) => [note.path, note.mtime]))
      const unchanged = new Set<string>()
      if (!rebuildAll) {
        for (const record of originalRecords) {
          if (noteMtimes.get(record.notePath) === record.mtime) unchanged.add(record.notePath)
        }
      }
      const stalePaths = new Set(notes.filter((note) => rebuildAll || !unchanged.has(note.path)).map((note) => note.path))
      const nextRecords = originalRecords.filter((record) => !stalePaths.has(record.notePath) && noteMtimes.has(record.notePath))
      const removedChunks = originalRecords.length - nextRecords.length
      let embeddedChunks = 0

      for (const note of notes.filter((candidate) => stalePaths.has(candidate.path))) {
        const content = await readVaultNote(this.vaultPath, note.path)
        if (content === null) continue
        for (const chunk of chunkMarkdown(content)) {
          nextRecords.push({
            notePath: note.path,
            chunkId: chunk.id,
            text: chunk.text,
            embedding: await embed(chunk.text, 'passage'),
            mtime: note.mtime
          })
          embeddedChunks += 1
        }
      }

      await mkdir(join(this.vaultPath, '.noema'), { recursive: true })
      const serialized: StoredIndex = { version: INDEX_VERSION, model: EMBEDDING_MODEL, dimension: EMBEDDING_DIMENSION, records: nextRecords }
      // Unique per write so a second app instance on this vault cannot rename our temp file
      // out from under us; the rename itself stays atomic.
      const temporaryIndexPath = `${this.indexPath}.${process.pid}-${Date.now()}.tmp`
      try {
        await writeFile(temporaryIndexPath, `${JSON.stringify(serialized, null, 2)}\n`, 'utf8')
        await rename(temporaryIndexPath, this.indexPath)
      } catch (error) {
        await rm(temporaryIndexPath, { force: true }).catch(() => undefined)
        throw error
      }
      this.records = nextRecords
      this.needsRebuild = false
      return this.status(embeddedChunks, removedChunks)
    } catch (error) {
      this.records = originalRecords
      this.needsRebuild = true
      throw error
    }
  }

  async search(query: string, topK = 5): Promise<SearchMatch[]> {
    await this.load()
    if (this.records.length === 0) return []
    const queryEmbedding = await embed(query, 'query')
    return this.records
      .map((record) => ({ notePath: record.notePath, chunkId: record.chunkId, text: record.text, score: cosineSimilarity(queryEmbedding, record.embedding) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Math.min(topK, 20)))
  }

  async getStatus(): Promise<IndexStatus> {
    await this.load()
    return this.status(0, 0)
  }

  async recall(): Promise<RecallItem[]> {
    await this.load()
    const seen = new Set<string>()
    return this.records.filter((record) => !seen.has(record.notePath) && Boolean(seen.add(record.notePath))).slice(0, 3)
      .map((record) => ({ path: record.notePath, title: basename(record.notePath, '.md'), excerpt: record.text.replace(/^#.+\n?/, '').slice(0, 180) }))
  }

  private status(embeddedChunks: number, removedChunks: number): IndexStatus {
    return {
      indexedNotes: new Set(this.records.map((record) => record.notePath)).size,
      indexedChunks: this.records.length,
      embeddedChunks,
      removedChunks,
      needsRebuild: this.needsRebuild
    }
  }
}

function isIndexRecord(value: unknown): value is IndexRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<IndexRecord>
  return typeof record.notePath === 'string' && typeof record.chunkId === 'string' && typeof record.text === 'string' && typeof record.mtime === 'number' && Array.isArray(record.embedding) && record.embedding.length === EMBEDDING_DIMENSION && record.embedding.every((item) => typeof item === 'number')
}

const indexes = new Map<string, VaultIndex>()

export function getVaultIndex(vaultPath: string): VaultIndex {
  const existing = indexes.get(vaultPath)
  if (existing) return existing
  const index = new VaultIndex(vaultPath)
  indexes.set(vaultPath, index)
  return index
}

export async function verifyChatAccess(): Promise<void> {
  const response = await nimFetch('/chat/completions', { model: CHAT_MODEL, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 1 })
  if (response.status === 403) {
    throw new NimApiError('NIM chat access is forbidden. Enable Public API Endpoints for this personal organization in NVIDIA NIM before continuing.', 403)
  }
  if (!response.ok) throw new NimApiError(`NIM chat request failed with HTTP ${response.status}.`, response.status)
}
