import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IndexStatus, VaultConfig, VaultSelection } from '../shared/types'
import { getVaultIndex } from './index'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'
import { answerQuestion, generateArtifact, sendAgentMessage } from './agent'
import { resolveVaultPath } from './vault'

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
  ipcMain.handle('index:status', async () => {
    const vault = await findSavedVault()
    return vault ? getVaultIndex(vault.vaultPath).getStatus() : null
  })
  ipcMain.handle('index:rebuild', async () => {
    const vault = await findSavedVault()
    if (!vault) throw new Error('Choose a vault before building an index.')
    return refreshIndex(vault.vaultPath)
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
