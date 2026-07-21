/**
 * Tolerant JSON parsing for model output.
 *
 * The parser keeps completed values when the response is cut off later, but never closes a
 * string or invents a scalar value. Object entries remain ordered until materialisation so
 * the one observed duplicate-key failure can be repaired without changing ordinary JSON's
 * last-key-wins behaviour everywhere else.
 */

const INCOMPLETE = Symbol('incomplete-json-value')

type ParsedValue = {
  value: unknown
  /** The value had its own closing delimiter (or was a complete scalar). */
  complete: boolean
  /** The only missing data is structural closing syntax, so an array may retain this value. */
  retain: boolean
}

class ParsedObject {
  constructor(readonly entries: Array<[string, unknown]>) {}
}

const STRING_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t'
}

class ModelJsonReader {
  private position = 0

  constructor(private readonly text: string) {}

  private get atEnd(): boolean {
    return this.position >= this.text.length
  }

  private skipWhitespace(): void {
    while (!this.atEnd && /\s/.test(this.text[this.position])) this.position += 1
  }

  private abandonTail(): void {
    this.position = this.text.length
  }

  readValue(): ParsedValue | typeof INCOMPLETE {
    this.skipWhitespace()
    if (this.atEnd) return INCOMPLETE
    const char = this.text[this.position]
    if (char === '{') return this.readObject()
    if (char === '[') return this.readArray()
    if (char === '"') return this.readString()
    return this.readLiteral()
  }

  private readString(): ParsedValue | typeof INCOMPLETE {
    this.position += 1
    let value = ''
    while (!this.atEnd) {
      const char = this.text[this.position]
      if (char === '"') {
        this.position += 1
        return { value, complete: true, retain: true }
      }
      if (char !== '\\') {
        // Unescaped control characters are not valid JSON strings.
        if (char.charCodeAt(0) < 0x20) return INCOMPLETE
        value += char
        this.position += 1
        continue
      }

      // A lone trailing backslash has no payload. In particular, do not append a quote: that
      // would turn the quote into escaped content and manufacture text the model never sent.
      if (this.position + 1 >= this.text.length) return INCOMPLETE
      const escape = this.text[this.position + 1]
      if (escape === 'u') {
        const hex = this.text.slice(this.position + 2, this.position + 6)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return INCOMPLETE
        value += String.fromCharCode(Number.parseInt(hex, 16))
        this.position += 6
        continue
      }
      if (!(escape in STRING_ESCAPES)) return INCOMPLETE
      value += STRING_ESCAPES[escape]
      this.position += 2
    }
    return INCOMPLETE
  }

  private readLiteral(): ParsedValue | typeof INCOMPLETE {
    const rest = this.text.slice(this.position)
    for (const [token, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (!rest.startsWith(token)) continue
      const next = rest[token.length]
      if (next && !/[\s,\]}]/.test(next)) return INCOMPLETE
      this.position += token.length
      return { value, complete: true, retain: true }
    }

    const numeric = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!numeric) return INCOMPLETE
    const next = rest[numeric[0].length]
    if (next && !/[\s,\]}]/.test(next)) return INCOMPLETE
    this.position += numeric[0].length
    return { value: Number(numeric[0]), complete: true, retain: true }
  }

  private readObject(): ParsedValue {
    this.position += 1
    const entries: Array<[string, unknown]> = []

    while (true) {
      this.skipWhitespace()
      if (this.atEnd) return { value: new ParsedObject(entries), complete: false, retain: entries.length > 0 }
      if (this.text[this.position] === '}') {
        this.position += 1
        return { value: new ParsedObject(entries), complete: true, retain: true }
      }
      if (this.text[this.position] !== '"') {
        this.abandonTail()
        return { value: new ParsedObject(entries), complete: false, retain: false }
      }

      const key = this.readString()
      if (key === INCOMPLETE || typeof key.value !== 'string') {
        this.abandonTail()
        return { value: new ParsedObject(entries), complete: false, retain: false }
      }
      this.skipWhitespace()
      if (this.atEnd || this.text[this.position] !== ':') {
        this.abandonTail()
        return { value: new ParsedObject(entries), complete: false, retain: false }
      }
      this.position += 1

      const parsed = this.readValue()
      if (parsed === INCOMPLETE) {
        this.abandonTail()
        return { value: new ParsedObject(entries), complete: false, retain: false }
      }
      if (parsed.complete || parsed.retain) entries.push([key.value, parsed.value])
      if (!parsed.complete) {
        return { value: new ParsedObject(entries), complete: false, retain: parsed.retain && entries.length > 0 }
      }

      this.skipWhitespace()
      if (this.atEnd) return { value: new ParsedObject(entries), complete: false, retain: true }
      if (this.text[this.position] === '}') {
        this.position += 1
        return { value: new ParsedObject(entries), complete: true, retain: true }
      }
      if (this.text[this.position] !== ',') {
        this.abandonTail()
        return { value: new ParsedObject(entries), complete: false, retain: false }
      }
      this.position += 1
    }
  }

  private readArray(): ParsedValue {
    this.position += 1
    const items: unknown[] = []

    while (true) {
      this.skipWhitespace()
      if (this.atEnd) return { value: items, complete: false, retain: items.length > 0 }
      if (this.text[this.position] === ']') {
        this.position += 1
        return { value: items, complete: true, retain: true }
      }

      const parsed = this.readValue()
      if (parsed === INCOMPLETE) {
        this.abandonTail()
        return { value: items, complete: false, retain: items.length > 0 }
      }
      if (parsed.complete || parsed.retain) items.push(parsed.value)
      if (!parsed.complete) return { value: items, complete: false, retain: items.length > 0 }

      this.skipWhitespace()
      if (this.atEnd) return { value: items, complete: false, retain: items.length > 0 }
      if (this.text[this.position] === ']') {
        this.position += 1
        return { value: items, complete: true, retain: true }
      }
      if (this.text[this.position] !== ',') {
        this.abandonTail()
        return { value: items, complete: false, retain: items.length > 0 }
      }
      this.position += 1
    }
  }
}

function groupedEntries(entries: Array<[string, unknown]>): Array<Array<[string, unknown]>> {
  const groups: Array<Array<[string, unknown]>> = []
  let group: Array<[string, unknown]> = []
  const keys = new Set<string>()
  for (const entry of entries) {
    if (keys.has(entry[0])) {
      groups.push(group)
      group = []
      keys.clear()
    }
    group.push(entry)
    keys.add(entry[0])
  }
  if (group.length) groups.push(group)
  return groups
}

function isTensionSidesPath(path: string[]): boolean {
  return path.length === 3 && path[0] === 'tensions' && /^\d+$/.test(path[1]) && path[2] === 'sides'
}

/**
 * Only repair the observed `tensions[n].sides` shape. Duplicate keys in every other object
 * retain normal JSON last-key-wins semantics, so unrelated model output cannot unexpectedly
 * turn into extra array elements.
 */
function splitMergedSides(object: ParsedObject): ParsedObject[] | null {
  const groups = groupedEntries(object.entries)
  if (groups.length < 2) return null
  const validSide = (entries: Array<[string, unknown]>): boolean => {
    const keys = entries.map(([key]) => key)
    return keys.length === 2 && keys.includes('text') && keys.includes('citations')
  }
  return groups.every(validSide) ? groups.map((entries) => new ParsedObject(entries)) : null
}

function materialize(value: unknown, path: string[] = []): unknown {
  if (value instanceof ParsedObject) {
    const result: Record<string, unknown> = {}
    for (const [key, entryValue] of value.entries) result[key] = materialize(entryValue, [...path, key])
    return result
  }
  if (Array.isArray(value)) {
    const result: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index]
      const split = item instanceof ParsedObject && isTensionSidesPath(path) ? splitMergedSides(item) : null
      if (split) {
        for (const side of split) result.push(materialize(side, [...path, String(result.length)]))
      } else {
        result.push(materialize(item, [...path, String(index)]))
      }
    }
    return result
  }
  return value
}

/** Extracts the first JSON object from fenced, reasoned, or plain model output. */
export function parseModelJson(content: string): unknown {
  let text = content.trim()
  const reasoningEnd = text.lastIndexOf('</think>')
  if (reasoningEnd !== -1) text = text.slice(reasoningEnd + '</think>'.length).trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:\s*```|$)/i)
  if (fenced) text = fenced[1].trim()
  const start = text.indexOf('{')
  if (start === -1) throw new SyntaxError('The model response contained no JSON object.')

  const parsed = new ModelJsonReader(text.slice(start)).readValue()
  if (parsed === INCOMPLETE || !(parsed.value instanceof ParsedObject)) {
    throw new SyntaxError('The model response contained no recoverable JSON object.')
  }
  return materialize(parsed.value)
}
