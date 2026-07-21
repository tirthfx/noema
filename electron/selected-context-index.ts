import type { SelectedContextContent } from './context-reader'

/**
 * Turns explicitly selected files/folders into a small, question-relevant set of snippets
 * instead of a raw wholesale dump. This is the difference between selected context that
 * *grounds* an answer and selected context that *drowns* the model's context window.
 *
 * The ranking is deterministic and purely lexical (no network, no embeddings) so it is cheap,
 * offline-safe, and unit-testable. It is intentionally a lightweight temporary corpus: chunk,
 * score against the question, keep the best snippets within a strict character budget.
 */

export interface SelectedContextSnippet {
  /** Display label — the file/folder name, plus the folder-relative path when known. */
  label: string
  excerpt: string
  score: number
}

export interface PackedSelectedContext {
  snippets: SelectedContextSnippet[]
  /** Distinct human-readable file/section labels that actually contributed snippets. */
  usedLabels: string[]
  totalChars: number
  /** True only when the user explicitly asked to answer from the selected material alone. */
  exclusive: boolean
}

/** Total characters of ranked context handed to the model. Small on purpose. */
const CONTEXT_BUDGET = 9_000
const MAX_SNIPPETS = 8
const CHUNK_CHARS = 1_100

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one',
  'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see',
  'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'that',
  'this', 'with', 'from', 'they', 'have', 'what', 'when', 'your', 'about', 'which', 'their',
  'would', 'there', 'could', 'should', 'into', 'than', 'then', 'them', 'these', 'those', 'will'
])

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length >= 3 && !STOPWORDS.has(word))
}

/**
 * Splits a context blob into labelled chunks. Folder content produced by context-reader is
 * delimited by `--- relative/path ---` file markers, so we split on those first to keep each
 * chunk attributable to a real file; anything else is split on blank lines then hard-wrapped.
 */
function chunkContent(item: SelectedContextContent): Array<{ label: string; text: string }> {
  const chunks: Array<{ label: string; text: string }> = []
  const fileSections = item.content.split(/\n--- (.+?) ---\n/)
  // split() with one capture group yields [preamble, label1, body1, label2, body2, ...].
  const hasFileMarkers = fileSections.length > 1
  const sections = hasFileMarkers
    ? [{ label: item.name, text: fileSections[0] }, ...pairSections(fileSections.slice(1), item.name)]
    : [{ label: item.name, text: item.content }]

  for (const section of sections) {
    for (const paragraph of section.text.split(/\n\s*\n/)) {
      const trimmed = paragraph.trim()
      if (trimmed.length < 24) continue
      for (let start = 0; start < trimmed.length; start += CHUNK_CHARS) {
        chunks.push({ label: section.label, text: trimmed.slice(start, start + CHUNK_CHARS) })
      }
    }
  }
  return chunks
}

function pairSections(parts: string[], folderName: string): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = []
  for (let index = 0; index + 1 < parts.length; index += 2) {
    out.push({ label: `${folderName}/${parts[index]}`, text: parts[index + 1] })
  }
  return out
}

function scoreChunk(chunkTokens: string[], queryTokens: Set<string>, queryBigrams: Set<string>): number {
  if (chunkTokens.length === 0) return 0
  let overlap = 0
  for (const token of chunkTokens) if (queryTokens.has(token)) overlap += 1
  let bigramHits = 0
  for (let index = 0; index + 1 < chunkTokens.length; index += 1) {
    if (queryBigrams.has(`${chunkTokens[index]} ${chunkTokens[index + 1]}`)) bigramHits += 1
  }
  // Normalise by length so a long file section cannot outrank a tight relevant paragraph.
  return (overlap + bigramHits * 2) / Math.sqrt(chunkTokens.length)
}

const EXCLUSIVE_PATTERNS = [
  /\bonly\b[^.?!]*\b(this|that|the|these|selected|attached|chosen)\b[^.?!]*\b(file|folder|files|folders|context|document|documents|directory|note|notes)\b/i,
  /\b(using|from|based on|within|inside)\b[^.?!]*\bonly\b[^.?!]*\b(file|folder|context|document|directory|note)\b/i,
  /\bjust\b[^.?!]*\b(this|that|these)\b[^.?!]*\b(file|folder|context|document|directory|note)\b/i,
  /\bdon'?t\b[^.?!]*\b(use|go|look)\b[^.?!]*\b(outside|beyond|other)\b/i
]

export function isExclusiveContextRequest(question: string): boolean {
  return EXCLUSIVE_PATTERNS.some((pattern) => pattern.test(question))
}

/**
 * Ranks the selected context against the current question and returns only the most relevant
 * snippets within a fixed budget. When the question shares no vocabulary with the material
 * (an irrelevant folder), the top snippets are returned but their scores are ~0, so callers
 * can tell the model this context is likely unrelated rather than forcing an answer from it.
 */
export function packSelectedContext(context: SelectedContextContent[], question: string): PackedSelectedContext {
  const queryTokenList = tokenize(question)
  const queryTokens = new Set(queryTokenList)
  const queryBigrams = new Set<string>()
  for (let index = 0; index + 1 < queryTokenList.length; index += 1) {
    queryBigrams.add(`${queryTokenList[index]} ${queryTokenList[index + 1]}`)
  }

  const scored = context
    .flatMap((item) => chunkContent(item))
    .map((chunk, order) => ({ ...chunk, order, score: scoreChunk(tokenize(chunk.text), queryTokens, queryBigrams) }))
    // Stable: higher score first, original order breaks ties so output is deterministic.
    .sort((left, right) => right.score - left.score || left.order - right.order)

  const snippets: SelectedContextSnippet[] = []
  const usedLabels: string[] = []
  let totalChars = 0
  for (const chunk of scored) {
    if (snippets.length >= MAX_SNIPPETS || totalChars + chunk.text.length > CONTEXT_BUDGET) continue
    snippets.push({ label: chunk.label, excerpt: chunk.text, score: Number(chunk.score.toFixed(4)) })
    totalChars += chunk.text.length
    if (!usedLabels.includes(chunk.label)) usedLabels.push(chunk.label)
  }

  return { snippets, usedLabels, totalChars, exclusive: isExclusiveContextRequest(question) }
}
