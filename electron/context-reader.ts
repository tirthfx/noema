import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'

export interface SelectedContextContent {
  name: string
  kind: 'file' | 'folder'
  content: string
}

const MAX_FILE_CHARS = 24_000
const MAX_FOLDER_CHARS = 48_000
const MAX_TREE_ENTRIES = 300
const MAX_CONTENT_FILES = 14
const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.json', '.jsonl', '.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css', '.scss', '.yml', '.yaml', '.toml', '.csv', '.xml', '.sh'])
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'out', 'release', 'dist', 'build', 'coverage', '.next', '.cache'])

function looksSensitive(path: string): boolean {
  const name = basename(path).toLowerCase()
  return name === '.env' || name.startsWith('.env.') || /(?:credentials?|secrets?|private[-_.]?key|id_rsa|\.pem$|\.p12$|\.pfx$)/i.test(name)
}

function textFrom(buffer: Buffer, limit: number): string | null {
  if (buffer.subarray(0, Math.min(buffer.length, 4_096)).includes(0)) return null
  return buffer.toString('utf8', 0, Math.min(buffer.length, limit)).replace(/\u0000/g, '')
}

async function readSelectedFile(path: string): Promise<string> {
  if (looksSensitive(path)) throw new Error('Noema will not attach a file that appears to contain credentials or private keys.')
  const info = await stat(path)
  if (!info.isFile()) throw new Error('The selected context is no longer a readable file.')
  const text = textFrom(await readFile(path), MAX_FILE_CHARS)
  return text === null
    ? `[Binary or unsupported file: ${basename(path)} · ${info.size} bytes]`
    : `${text}${info.size > Buffer.byteLength(text) ? '\n\n[File truncated for context size.]' : ''}`
}

type ContextFile = { fullPath: string; relativePath: string; size: number }

async function collectFolder(root: string): Promise<{ tree: string[]; files: ContextFile[] }> {
  const tree: string[] = []
  const files: ContextFile[] = []

  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > 6 || tree.length >= MAX_TREE_ENTRIES) return
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (tree.length >= MAX_TREE_ENTRIES) break
      if (entry.name.startsWith('.') || looksSensitive(entry.name)) continue
      const fullPath = join(directory, entry.name)
      const relativePath = relative(root, fullPath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue
        tree.push(`${relativePath}/`)
        await visit(fullPath, depth + 1)
      } else if (entry.isFile()) {
        tree.push(relativePath)
        const extension = extname(entry.name).toLowerCase()
        if (!TEXT_EXTENSIONS.has(extension) && !['readme', 'license', 'agents'].includes(entry.name.toLowerCase())) continue
        try {
          const info = await stat(fullPath)
          if (info.size <= 2_000_000) files.push({ fullPath, relativePath, size: info.size })
        } catch { /* File changed while the picker was reading it. */ }
      }
    }
  }

  await visit(root, 0)
  return { tree, files }
}

function contextPriority(file: ContextFile): number {
  const name = basename(file.relativePath).toLowerCase()
  if (name.startsWith('readme')) return 0
  if (name === 'vision.md' || name === 'agents.md') return 1
  if (name === 'package.json' || name === 'pyproject.toml') return 2
  if (extname(name) === '.md') return 3
  return 4
}

async function readSelectedFolder(path: string): Promise<string> {
  const info = await stat(path)
  if (!info.isDirectory()) throw new Error('The selected context is no longer a readable folder.')
  const { tree, files } = await collectFolder(path)
  const sections = [`Folder: ${basename(path)}\n\nFile tree (${tree.length}${tree.length >= MAX_TREE_ENTRIES ? '+' : ''} entries):\n${tree.join('\n')}`]
  let used = sections[0].length
  const ranked = files.sort((left, right) => contextPriority(left) - contextPriority(right) || left.relativePath.localeCompare(right.relativePath))
  for (const file of ranked.slice(0, MAX_CONTENT_FILES)) {
    const remaining = MAX_FOLDER_CHARS - used
    if (remaining < 500) break
    const text = textFrom(await readFile(file.fullPath), Math.min(10_000, remaining - 100))
    if (text === null) continue
    const section = `\n\n--- ${file.relativePath} ---\n${text}${file.size > Buffer.byteLength(text) ? '\n[Truncated]' : ''}`
    sections.push(section)
    used += section.length
  }
  if (tree.length >= MAX_TREE_ENTRIES || ranked.length > MAX_CONTENT_FILES) sections.push('\n\n[Folder context is bounded. Choose a specific file for deeper inspection.]')
  return sections.join('').slice(0, MAX_FOLDER_CHARS)
}

export async function readSelectedContext(path: string, kind: 'file' | 'folder'): Promise<SelectedContextContent> {
  return {
    name: basename(path),
    kind,
    content: kind === 'file' ? await readSelectedFile(path) : await readSelectedFolder(path)
  }
}
