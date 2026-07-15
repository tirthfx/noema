import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises'
import { relative, resolve, sep, dirname } from 'node:path'

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

export async function writeVaultNote(vaultPath: string, notePath: string, content: string): Promise<void> {
  const fullPath = resolveVaultPath(vaultPath, notePath)
  if (!fullPath || !fullPath.toLowerCase().endsWith('.md')) throw new Error('The proposed path must stay inside the vault and end in .md.')
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, 'utf8')
}

/**
 * Plain-language fs failure text for the EditablePreview flow (rules.md §5). Always keeps
 * the real OS code and message — the write is never retried silently or swallowed.
 */
export function describeWriteFailure(error: unknown, notePath: string): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
  const detail = error instanceof Error ? error.message : String(error)
  const explanation =
    code === 'EACCES' || code === 'EPERM' ? `Noema does not have permission to write ${notePath}. Check the folder's permissions, then approve again.`
    : code === 'EROFS' ? `${notePath} is on a read-only filesystem, so Noema cannot write it.`
    : code === 'ENOSPC' ? 'The disk is full, so Noema could not write this note.'
    : code === 'EBUSY' || code === 'ETXTBSY' ? `${notePath} is locked by another program. Close it there, then approve again.`
    : code === 'EISDIR' ? `${notePath} is a folder, not a note file.`
    : code === 'ENAMETOOLONG' ? `That note path is too long for this filesystem: ${notePath}`
    : code === 'ENOENT' ? `Noema could not create the folder for ${notePath}. The vault may have moved since you selected it.`
    : `Noema could not write ${notePath}.`
  return code ? `${explanation} (${code}: ${detail})` : `${explanation} (${detail})`
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
