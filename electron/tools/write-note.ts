import type { NoteProposal } from '../../shared/types'
import { readVaultNote, resolveVaultPath } from '../vault'

/**
 * Builds a gated note proposal. Per rules.md §4 ("no silent writes") this module never
 * imports vault.ts's write function — it only reads, to tell a new note from an edit and
 * to capture the base text EditablePreview highlights additions against. The real fs
 * write happens only after an approved commit.
 */
export async function writeNote(vaultPath: string, notePath: string, content: string, source?: string): Promise<NoteProposal | { error: string }> {
  const cleanedPath = notePath.trim().replace(/^\.?[/\\]+/, '').replace(/\\/g, '/')
  if (!cleanedPath) return { error: 'write_note requires a vault-relative note path.' }
  if (!cleanedPath.toLowerCase().endsWith('.md')) return { error: `The proposed path must end in .md: ${cleanedPath}` }
  if (!resolveVaultPath(vaultPath, cleanedPath)) return { error: `The proposed path must stay inside the vault: ${cleanedPath}` }
  if (!content.trim()) return { error: 'write_note requires note content.' }

  const existing = await readVaultNote(vaultPath, cleanedPath)
  return {
    path: cleanedPath,
    content: content.endsWith('\n') ? content : `${content}\n`,
    kind: existing === null ? 'new' : 'edit',
    ...(existing === null ? {} : { baseContent: existing }),
    ...(source ? { source } : {})
  }
}
