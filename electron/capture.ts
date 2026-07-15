import type { CaptureInput } from '../shared/types'

/**
 * Readable-content extraction for URL capture. Deliberately hand-rolled: a scraping
 * or DOM library would fail rules.md §2's scope-creep test when a few regexes over
 * fetched HTML are enough to hand the model clean text.
 */
export interface ExtractedCapture {
  title: string
  text: string
  source?: string
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”'
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
}

/** Strips chrome and markup, leaving readable prose with paragraph breaks intact. */
export function htmlToText(html: string): ExtractedCapture {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)

  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')

  // Prefer the main article region when the page marks one, so navigation chrome
  // outside it never reaches the model as if it were content.
  const region = body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ?? body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  if (region) body = region[1]

  const text = decodeEntities(
    body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|h[1-6]|li|tr|blockquote)>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const title = decodeEntities(titleMatch?.[1] ?? h1Match?.[1] ?? '').replace(/\s+/g, ' ').trim()
  return { title, text }
}

/** Fetches a URL in the main process and reduces it to readable text. */
export async function fetchReadable(url: string): Promise<ExtractedCapture> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`That does not look like a valid URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Noema can only capture http and https URLs.')
  }

  let response: Response
  try {
    response = await fetch(parsed.toString(), {
      headers: { Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5', 'User-Agent': 'Noema/0.1 (research capture)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000)
    })
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'the request timed out' : error instanceof Error ? error.message : 'the request failed'
    throw new Error(`Noema could not fetch ${parsed.hostname}: ${reason}.`)
  }
  if (!response.ok) throw new Error(`Noema could not fetch ${parsed.hostname}: the server returned HTTP ${response.status}.`)

  const contentType = response.headers.get('content-type') ?? ''
  const raw = await response.text()
  const extracted = contentType.includes('text/html') || /^\s*</.test(raw)
    ? htmlToText(raw)
    : { title: '', text: raw.trim() }
  if (!extracted.text) throw new Error(`Noema fetched ${parsed.hostname} but found no readable text on the page.`)

  return {
    title: extracted.title || parsed.hostname,
    text: extracted.text,
    source: parsed.toString()
  }
}

/** Normalises either capture kind into the material the agent drafts a note from. */
export async function resolveCapture(input: CaptureInput): Promise<ExtractedCapture> {
  if (input.kind === 'url') return fetchReadable(input.value.trim())
  const text = input.value.trim()
  if (!text) throw new Error('Paste some text before capturing it.')
  return { title: '', text }
}
