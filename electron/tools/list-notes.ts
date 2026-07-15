import { basename, normalize } from 'node:path'
import type { NoteSummary } from '../../shared/types'
import { walkMarkdownFiles } from '../vault'

export async function listNotes(vaultPath: string, folder?: string): Promise<NoteSummary[]> {
  const prefix = folder ? `${normalize(folder).replace(/\\/g, '/')}/` : ''
  const notes = await walkMarkdownFiles(vaultPath)
  return notes
    .filter((note) => !prefix || note.path.startsWith(prefix))
    .map((note) => ({ path: note.path, title: basename(note.path, '.md') }))
}
