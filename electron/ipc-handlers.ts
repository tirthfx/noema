import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IndexStatus, VaultConfig, VaultSelection, WriteResult } from '../shared/types'
import { getVaultIndex } from './index'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'
import { answerQuestion, generateArtifact, proposeCapture, proposeLink, sendAgentMessage } from './agent'
import { describeWriteFailure, resolveVaultPath, writeVaultNote } from './vault'

const LAST_VAULT_FILE = 'last-vault.json'

function lastVaultPointerPath(): string {
  return join(app.getPath('userData'), LAST_VAULT_FILE)
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function isReadableDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function saveVault(vaultPath: string): Promise<VaultSelection> {
  const noemaPath = join(vaultPath, '.noema')
  await mkdir(noemaPath, { recursive: true })
  const config: VaultConfig = { vaultPath }
  await writeFile(join(noemaPath, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  await writeFile(lastVaultPointerPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return { vaultPath, indexStatus: await refreshIndex(vaultPath) }
}

async function refreshIndex(vaultPath: string): Promise<IndexStatus> {
  try {
    return await getVaultIndex(vaultPath).refresh()
  } catch (error) {
    const existing = await getVaultIndex(vaultPath).getStatus()
    return {
      ...existing,
      embeddedChunks: 0,
      removedChunks: 0,
      needsRebuild: true,
      error: error instanceof Error ? error.message : 'Noema could not build the vault index.'
    }
  }
}

async function getSavedVault(): Promise<VaultSelection | null> {
  const vault = await findSavedVault()
  return vault ? { ...vault, indexStatus: await refreshIndex(vault.vaultPath) } : null
}

async function findSavedVault(): Promise<VaultSelection | null> {
  const pointer = await readJson<VaultConfig>(lastVaultPointerPath())
  if (!pointer || !(await isReadableDirectory(pointer.vaultPath))) return null
  const config = await readJson<VaultConfig>(join(pointer.vaultPath, '.noema', 'config.json'))
  return config?.vaultPath === pointer.vaultPath ? { vaultPath: pointer.vaultPath } : null
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('vault:get-saved', getSavedVault)
  ipcMain.handle('vault:choose', async () => {
    const options: OpenDialogOptions = {
      title: 'Choose an Obsidian vault folder',
      properties: ['openDirectory', 'createDirectory']
    }
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return saveVault(result.filePaths[0])
  })
  ipcMain.handle('vault:reveal-note', async (_event, path: unknown) => {
    if (typeof path !== 'string') return
    const vault = await findSavedVault(); const fullPath = vault ? resolveVaultPath(vault.vaultPath, path) : null
    if (fullPath) shell.showItemInFolder(fullPath)
  })
  // The only path in the app from a proposal to disk. Reached exclusively by an approved
  // EditablePreview commit (rules.md §4); fs failures come back as a specific, visible error.
  ipcMain.handle('vault:approve-write', async (_event, proposal: unknown): Promise<WriteResult> => {
    if (!proposal || typeof proposal !== 'object') return { ok: false, error: 'Invalid note proposal.' }
    const value = proposal as { path?: unknown; content?: unknown }
    if (typeof value.path !== 'string' || !value.path.trim() || typeof value.content !== 'string') return { ok: false, error: 'Invalid note proposal.' }
    const vault = await findSavedVault()
    if (!vault) return { ok: false, error: 'Choose a vault before writing.' }
    try {
      await writeVaultNote(vault.vaultPath, value.path, value.content)
    } catch (error) {
      return { ok: false, error: describeWriteFailure(error, value.path) }
    }
    // Fold the approved note into the index so it is searchable without a manual rebuild.
    try {
      await getVaultIndex(vault.vaultPath).refresh()
    } catch {
      // An index refresh failure must not imply the write failed — the note is on disk.
    }
    return { ok: true, path: value.path }
  })
  ipcMain.handle('capture:propose', async (event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid capture input.')
    const value = input as { kind?: unknown; value?: unknown }
    if ((value.kind !== 'text' && value.kind !== 'url') || typeof value.value !== 'string' || !value.value.trim()) throw new Error('Paste text or a URL before capturing it.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Choose and index a vault before capturing into it.')
    return proposeCapture(vault.vaultPath, { kind: value.kind, value: value.value }, (activity) => event.sender.send('agent:tool-call-activity', activity))
  })
  ipcMain.handle('capture:propose-link', async (event, fromPath: unknown, toPath: unknown, context: unknown) => {
    if (typeof fromPath !== 'string' || typeof toPath !== 'string' || !fromPath.trim() || !toPath.trim()) throw new Error('Choose both notes before proposing a link.')
    if (context !== undefined && typeof context !== 'string') throw new Error('Invalid link context.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Choose a vault before proposing a link.')
    return proposeLink(vault.vaultPath, fromPath, toPath, context ?? '', (activity) => event.sender.send('agent:tool-call-activity', activity))
  })
  ipcMain.handle('index:status', async () => {
    const vault = await findSavedVault()
    return vault ? getVaultIndex(vault.vaultPath).getStatus() : null
  })
  ipcMain.handle('index:rebuild', async () => {
    const vault = await findSavedVault()
    if (!vault) throw new Error('Choose a vault before building an index.')
    return refreshIndex(vault.vaultPath)
  })
  ipcMain.handle('recall:get', async () => {
    const vault = await findSavedVault()
    return vault ? getVaultIndex(vault.vaultPath).recall() : []
  })
  ipcMain.handle('tools:search-notes', async (_event, query: unknown, topK?: unknown) => {
    if (typeof query !== 'string' || !query.trim()) return []
    const vault = await findSavedVault()
    const safeTopK = typeof topK === 'number' && Number.isFinite(topK) ? topK : 5
    return vault ? searchNotes(vault.vaultPath, query, safeTopK) : []
  })
  ipcMain.handle('tools:read-note', async (_event, path: unknown) => {
    if (typeof path !== 'string') return null
    const vault = await findSavedVault()
    return vault ? readNote(vault.vaultPath, path) : null
  })
  ipcMain.handle('tools:list-notes', async (_event, folder?: unknown) => {
    if (folder !== undefined && typeof folder !== 'string') return []
    const vault = await findSavedVault()
    return vault ? listNotes(vault.vaultPath, folder) : []
  })
  ipcMain.handle('agent:send-message', async (event, message: unknown) => {
    if (typeof message !== 'string' || !message.trim()) throw new Error('Enter a message before sending it.')
    const vault = await findSavedVault()
    if (!vault) throw new Error('Choose and index a vault before asking Noema.')
    return sendAgentMessage(vault.vaultPath, message.trim(), (activity) => {
      event.sender.send('agent:tool-call-activity', activity)
    })
  })
  ipcMain.handle('agent:generate-artifact', async (event, topic: unknown, persona: unknown) => {
    if (typeof topic !== 'string' || !topic.trim() || !['Academic', 'Socratic Critic', 'Plain-Language'].includes(persona as string)) throw new Error('Choose a topic and persona before generating a review.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Choose and index a vault before generating a review.')
    return generateArtifact(vault.vaultPath, topic.trim(), persona as import('../shared/types').Persona, (activity) => event.sender.send('agent:tool-call-activity', activity))
  })
  ipcMain.handle('agent:answer-question', async (event, question: unknown) => {
    if (typeof question !== 'string' || !question.trim()) throw new Error('Enter a question before sending it.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Choose and index a vault before asking Noema.')
    return answerQuestion(vault.vaultPath, question.trim(), (activity) => event.sender.send('agent:tool-call-activity', activity))
  })
  ipcMain.handle('window:minimize', () => getWindow()?.minimize())
  ipcMain.handle('window:toggle-maximize', () => {
    const window = getWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.handle('window:close', () => getWindow()?.close())
}
