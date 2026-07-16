import type { CaptureInput } from '../shared/types'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

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
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => decodeCodePoint(match, Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, code: string) => decodeCodePoint(match, Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
}

function decodeCodePoint(original: string, codePoint: number): string {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : original
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

function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const [first, second] = address.split('.').map(Number)
    return first === 10 || first === 127 || first === 0 || first >= 224 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
  }
  if (version === 6) {
    const normalized = address.toLowerCase()
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
  }
  return false
}

async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Noema can only capture http and https URLs.')
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) throw new Error('Noema cannot capture URLs hosted on this device or a private network.')
  if (isPrivateAddress(host)) throw new Error('Noema cannot capture URLs hosted on this device or a private network.')
  try {
    const addresses = await lookup(host, { all: true, verbatim: true })
    if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Noema cannot capture URLs hosted on this device or a private network.')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Noema cannot capture')) throw error
    throw new Error(`Noema could not resolve ${host}.`)
  }
}

const MAX_CAPTURE_BYTES = 2_000_000

async function readCaptureBody(response: Response): Promise<string> {
  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_CAPTURE_BYTES) throw new Error('Noema could not capture that page because it is larger than 2 MB.')
  if (!response.body) return response.text()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_CAPTURE_BYTES) throw new Error('Noema could not capture that page because it is larger than 2 MB.')
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}

/** Fetches a public URL in the main process and reduces it to readable text. */
export async function fetchReadable(url: string): Promise<ExtractedCapture> {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error(`That does not look like a valid URL: ${url}`) }

  let response: Response | null = null
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await assertPublicHttpUrl(parsed)
    try {
      response = await fetch(parsed.toString(), {
        headers: { Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5', 'User-Agent': 'Noema/0.1 (research capture)' },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000)
      })
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'the request timed out' : error instanceof Error ? error.message : 'the request failed'
      throw new Error(`Noema could not fetch ${parsed.hostname}: ${reason}.`)
    }
    if (response.status < 300 || response.status >= 400) break
    const location = response.headers.get('location')
    if (!location) break
    try { parsed = new URL(location, parsed) } catch { throw new Error(`Noema received an invalid redirect from ${parsed.hostname}.`) }
    if (redirects === 5) throw new Error('Noema stopped following this URL after too many redirects.')
  }
  if (!response || !response.ok) throw new Error(`Noema could not fetch ${parsed.hostname}: the server returned HTTP ${response?.status ?? 'an unknown'}.`)

  const contentType = response.headers.get('content-type') ?? ''
  const raw = await readCaptureBody(response)
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
