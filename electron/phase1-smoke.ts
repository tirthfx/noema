import { getVaultIndex } from './index'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'

const [vaultPath, query] = process.argv.slice(2)
if (!vaultPath || !query) {
  throw new Error('Usage: node out/main/phase1-smoke.js <vault-path> <query>')
}

const index = getVaultIndex(vaultPath)
const status = await index.refresh()
const notes = await listNotes(vaultPath)
const matches = await searchNotes(vaultPath, query, 3)
const firstNote = notes[0] ? await readNote(vaultPath, notes[0].path) : null
console.log(JSON.stringify({ status, noteCount: notes.length, firstNoteReadable: firstNote !== null, matches }, null, 2))
