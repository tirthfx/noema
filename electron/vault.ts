import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export interface VaultNote {
  path: string
  mtime: number
}

export interface NoteChunk {
  id: string
  text: string
}

const SKIPPED_DIRECTORIES = new Set(['.noema', '.obsidian'])

export async function walkMarkdownFiles(vaultPath: string): Promise<VaultNote[]> {
  const notes: VaultNote[] = []

  async function walk(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = resolve(folder, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(fullPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const details = await stat(fullPath)
        notes.push({ path: relative(vaultPath, fullPath), mtime: details.mtimeMs })
      }
    }
  }

  await walk(vaultPath)
  return notes.sort((a, b) => a.path.localeCompare(b.path))
}

export function resolveVaultPath(vaultPath: string, notePath: string): string | null {
  const resolved = resolve(vaultPath, notePath)
  const root = resolve(vaultPath)
  return resolved === root || resolved.startsWith(`${root}${sep}`) ? resolved : null
}

export async function readVaultNote(vaultPath: string, notePath: string): Promise<string | null> {
  const fullPath = resolveVaultPath(vaultPath, notePath)
  if (!fullPath || !fullPath.toLowerCase().endsWith('.md')) return null
  try {
    return await readFile(fullPath, 'utf8')
  } catch {
    return null
  }
}

/** Heading-based chunks keep a note's local argument and its heading together. */
export function chunkMarkdown(markdown: string): NoteChunk[] {
  const sections = markdown.replace(/\r\n/g, '\n').split(/(?=^#{1,6}\s+)/m)
  const chunks = sections
    .map((section) => section.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `heading-${index + 1}`, text }))
  return chunks.length > 0 ? chunks : []
}
