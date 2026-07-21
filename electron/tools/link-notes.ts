import type { NoteProposal } from '../../shared/types'
import { readVaultNote } from '../vault'

/** Obsidian resolves a vault-relative target without its extension. */
function wikilinkTarget(toPath: string): string {
  return toPath.replace(/\\/g, '/').replace(/\.md$/i, '')
}

/**
 * Builds a gated wikilink proposal. Like write-note.ts this never writes: it returns the
 * from-note's full proposed text plus the untouched base text, so EditablePreview can show
 * the addition and gate the commit (rules.md §4).
 */
export async function linkNotes(vaultPath: string, fromPath: string, toPath: string, context: string): Promise<NoteProposal | { error: string }> {
  const from = fromPath.trim().replace(/\\/g, '/')
  const to = toPath.trim().replace(/\\/g, '/')
  if (!from || !to) return { error: 'link_notes requires a fromPath and a toPath.' }
  if (from === to) return { error: 'link_notes cannot link a note to itself.' }

  const baseContent = await readVaultNote(vaultPath, from)
  if (baseContent === null) return { error: `Note not found: ${from}` }
  if ((await readVaultNote(vaultPath, to)) === null) return { error: `Note not found: ${to}` }

  const link = `[[${wikilinkTarget(to)}]]`
  const sentence = context.trim()
    ? (context.includes(link) ? context.trim() : `${context.trim().replace(/\s*$/, '')} ${link}`)
    : `Related: ${link}`
  const separator = baseContent.endsWith('\n\n') ? '' : baseContent.endsWith('\n') ? '\n' : '\n\n'

  return {
    path: from,
    content: `${baseContent}${separator}${sentence}\n`,
    kind: 'edit',
    baseContent
  }
}
