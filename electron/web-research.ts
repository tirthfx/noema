import { fetchReadable, htmlToText } from './capture'

export interface WebSource {
  title: string
  url: string
  text: string
}

const MAX_SEARCH_RESULTS = 5
const MAX_SOURCE_CHARS = 12_000

function decodeXml(value: string): string {
  const codePoint = (original: string, parsed: number): string => Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
    ? String.fromCodePoint(parsed)
    : original
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (original, hex: string) => codePoint(original, Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (original, value: string) => codePoint(original, Number.parseInt(value, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

function tag(item: string, name: string): string {
  return decodeXml(item.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '')
}

function isPublicWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function searchBing(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const endpoint = new URL('https://www.bing.com/search')
  endpoint.searchParams.set('format', 'rss')
  endpoint.searchParams.set('q', query)
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/rss+xml,application/xml;q=0.9', 'User-Agent': 'Noema/0.1 (personal research assistant)' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`Web search returned HTTP ${response.status}.`)
  const xml = (await response.text()).slice(0, 1_000_000)
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const url = tag(match[1], 'link')
      return {
        title: htmlToText(tag(match[1], 'title')).text || 'Untitled source',
        url,
        snippet: htmlToText(tag(match[1], 'description')).text
      }
    })
    .filter((item) => isPublicWebUrl(item.url))
    .slice(0, MAX_SEARCH_RESULTS)
}

/** Bounded, read-only web research. Pages reuse Capture's SSRF and redirect checks. */
export async function researchWeb(query: string): Promise<WebSource[]> {
  const trimmed = query.trim()
  const directUrls = trimmed.split(/\s+/).filter(isPublicWebUrl)
  if (directUrls.length === 1 && directUrls[0] === trimmed) {
    const page = await fetchReadable(directUrls[0])
    return [{ title: page.title, url: page.source ?? directUrls[0], text: page.text.slice(0, MAX_SOURCE_CHARS) }]
  }

  const results = await searchBing(trimmed)
  const fetched = await Promise.allSettled(results.map(async (result): Promise<WebSource> => {
    const page = await fetchReadable(result.url)
    return { title: page.title || result.title, url: page.source ?? result.url, text: page.text.slice(0, MAX_SOURCE_CHARS) }
  }))
  const readable = fetched.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
  if (readable.length > 0) return readable
  // Search snippets remain attributable and are preferable to fabricating an answer when
  // every destination rejects automated reading.
  return results.filter((result) => result.snippet).map((result) => ({ title: result.title, url: result.url, text: result.snippet.slice(0, 1_500) }))
}
