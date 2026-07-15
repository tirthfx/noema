import { basename, normalize } from 'node:path'
import type { NoteSummary } from '../../shared/types'
import { walkMarkdownFiles } from '../vault'

export async function listNotes(vaultPath: string, folder?: string): Promise<NoteSummary[]> {
  // Trim any trailing slash before re-adding one: the model naturally writes "Learning/",
  // and normalize() keeps that slash, which would build a "Learning//" prefix matching nothing
  // and report a populated folder as empty.
  const cleaned = folder ? normalize(folder).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '') : ''
  const prefix = cleaned && cleaned !== '.' ? `${cleaned}/` : ''
  const notes = await walkMarkdownFiles(vaultPath)
  return notes
    .filter((note) => !prefix || note.path.startsWith(prefix))
    .map((note) => ({ path: note.path, title: basename(note.path, '.md') }))
}
