import { readdir, readFile, stat, lstat, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { relative, resolve, sep, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface VaultNote {
  path: string
  mtime: number
}

export interface NoteChunk {
  id: string
  text: string
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'out', 'build', 'release', 'coverage'])

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith('.') || SKIPPED_DIRECTORIES.has(name.toLowerCase())
}

export async function walkMarkdownFiles(vaultPath: string): Promise<VaultNote[]> {
  const notes: VaultNote[] = []

  async function walk(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = resolve(folder, entry.name)
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) await walk(fullPath)
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
  const fullPath = await resolveExistingVaultPath(vaultPath, notePath)
  if (!fullPath || !fullPath.toLowerCase().endsWith('.md')) return null
  try {
    return await readFile(fullPath, 'utf8')
  } catch {
    return null
  }
}

/** Resolves an existing path and verifies its real location is inside the vault. */
export async function resolveExistingVaultPath(vaultPath: string, notePath: string): Promise<string | null> {
  const candidate = resolveVaultPath(vaultPath, notePath)
  if (!candidate) return null
  try {
    const [root, target] = await Promise.all([realpath(vaultPath), realpath(candidate)])
    return target === root || target.startsWith(`${root}${sep}`) ? target : null
  } catch {
    return null
  }
}

export async function writeVaultNote(vaultPath: string, notePath: string, content: string): Promise<void> {
  const fullPath = resolveVaultPath(vaultPath, notePath)
  if (!fullPath || !fullPath.toLowerCase().endsWith('.md')) throw new Error('The proposed path must stay inside the vault and end in .md.')
  await assertNoSymlinkInWritePath(vaultPath, fullPath)
  await mkdir(dirname(fullPath), { recursive: true })
  await assertNoSymlinkInWritePath(vaultPath, fullPath)
  const temporaryPath = resolve(dirname(fullPath), `.${basename(fullPath)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, fullPath)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

/** Refuse writes through symlinks, which could otherwise escape the chosen vault. */
async function assertNoSymlinkInWritePath(vaultPath: string, fullPath: string): Promise<void> {
  const selectedRoot = resolve(vaultPath)
  const root = await realpath(selectedRoot)
  const relativePath = relative(selectedRoot, fullPath)
  let current = root
  for (const segment of relativePath.split(sep).filter(Boolean)) {
    current = resolve(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        const error = Object.assign(new Error(`Refusing to write through symbolic link: ${current}`), { code: 'ELOOP' })
        throw error
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT') continue
      throw error
    }
  }
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
    : code === 'ELOOP' ? `Noema refused to write ${notePath} through a symbolic link outside the vault.`
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
