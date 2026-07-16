import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { IndexProgress, IndexStatus, VaultConfig, VaultSelection, WriteResult } from '../shared/types'
import { getVaultIndex } from './index'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'
import { answerQuestion, generateArtifact, proposeCapture, proposeLink, sendAgentMessage } from './agent'
import { describeWriteFailure, readVaultNote, resolveExistingVaultPath, writeVaultNote } from './vault'

const LAST_VAULT_FILE = 'last-vault.json'
const PROPOSAL_TTL_MS = 30 * 60 * 1_000

type PendingProposal = { vaultPath: string; path: string; kind: 'new' | 'edit'; baseContent?: string; expiresAt: number }
const pendingProposals = new Map<string, PendingProposal>()

function rememberProposal(vaultPath: string, proposal: import('../shared/types').NoteProposal): import('../shared/types').NoteProposal {
  const now = Date.now()
  for (const [id, pending] of pendingProposals) if (pending.expiresAt <= now) pendingProposals.delete(id)
  const approvalId = randomUUID()
  pendingProposals.set(approvalId, { vaultPath, path: proposal.path, kind: proposal.kind, baseContent: proposal.baseContent, expiresAt: now + PROPOSAL_TTL_MS })
  return { ...proposal, approvalId }
}

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

async function saveVault(vaultPath: string, onProgress?: (progress: IndexProgress) => void): Promise<VaultSelection> {
  const noemaPath = join(vaultPath, '.noema')
  await mkdir(noemaPath, { recursive: true })
  const config: VaultConfig = { vaultPath }
  await writeFile(join(noemaPath, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  await writeFile(lastVaultPointerPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return { vaultPath, indexStatus: await refreshIndex(vaultPath, onProgress) }
}

async function refreshIndex(vaultPath: string, onProgress?: (progress: IndexProgress) => void): Promise<IndexStatus> {
  try {
    return await getVaultIndex(vaultPath).refresh(onProgress)
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

async function getSavedVault(onProgress?: (progress: IndexProgress) => void): Promise<VaultSelection | null> {
  const vault = await findSavedVault()
  return vault ? { ...vault, indexStatus: await refreshIndex(vault.vaultPath, onProgress) } : null
}

async function findSavedVault(): Promise<VaultSelection | null> {
  const pointer = await readJson<VaultConfig>(lastVaultPointerPath())
  if (!pointer || !(await isReadableDirectory(pointer.vaultPath))) return null
  const config = await readJson<VaultConfig>(join(pointer.vaultPath, '.noema', 'config.json'))
  return config?.vaultPath === pointer.vaultPath ? { vaultPath: pointer.vaultPath } : null
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('vault:get-saved', (event) => getSavedVault((progress) => event.sender.send('index:progress', progress)))
  ipcMain.handle('vault:choose', async (event) => {
    const options: OpenDialogOptions = {
      title: 'Choose an Obsidian vault folder',
      properties: ['openDirectory', 'createDirectory']
    }
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return saveVault(result.filePaths[0], (progress) => event.sender.send('index:progress', progress))
  })
  ipcMain.handle('vault:reveal-note', async (_event, path: unknown) => {
    if (typeof path !== 'string') return
    const vault = await findSavedVault(); const fullPath = vault ? await resolveExistingVaultPath(vault.vaultPath, path) : null
    if (fullPath) shell.showItemInFolder(fullPath)
  })
  // The only path in the app from a proposal to disk. Reached exclusively by an approved
  // EditablePreview commit (rules.md §4); fs failures come back as a specific, visible error.
  ipcMain.handle('vault:approve-write', async (_event, proposal: unknown): Promise<WriteResult> => {
    if (!proposal || typeof proposal !== 'object') return { ok: false, error: 'Invalid note proposal.' }
    const value = proposal as { approvalId?: unknown; path?: unknown; content?: unknown }
    if (typeof value.approvalId !== 'string' || typeof value.path !== 'string' || !value.path.trim() || typeof value.content !== 'string') return { ok: false, error: 'Invalid note proposal.' }
    const vault = await findSavedVault()
    if (!vault) return { ok: false, error: 'Choose a vault before writing.' }
    const pending = pendingProposals.get(value.approvalId)
    if (!pending || pending.expiresAt <= Date.now() || pending.vaultPath !== vault.vaultPath || pending.path !== value.path) return { ok: false, error: 'This draft is no longer valid. Propose it again before writing.' }
    if (pending.kind === 'edit') {
      const current = await readVaultNote(vault.vaultPath, value.path)
      if (current === null || current !== pending.baseContent) return { ok: false, error: 'This note changed after the draft was created. Propose the edit again so you do not overwrite newer work.' }
    }
    try {
      await writeVaultNote(vault.vaultPath, value.path, value.content)
    } catch (error) {
      return { ok: false, error: describeWriteFailure(error, value.path) }
    }
    pendingProposals.delete(value.approvalId)
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
    const result = await proposeCapture(vault.vaultPath, { kind: value.kind, value: value.value }, (activity) => event.sender.send('agent:tool-call-activity', activity))
    return result.proposal ? { ...result, proposal: rememberProposal(vault.vaultPath, result.proposal) } : result
  })
  ipcMain.handle('capture:propose-link', async (event, fromPath: unknown, toPath: unknown, context: unknown) => {
    if (typeof fromPath !== 'string' || typeof toPath !== 'string' || !fromPath.trim() || !toPath.trim()) throw new Error('Choose both notes before proposing a link.')
    if (context !== undefined && typeof context !== 'string') throw new Error('Invalid link context.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Choose a vault before proposing a link.')
    const result = await proposeLink(vault.vaultPath, fromPath, toPath, context ?? '', (activity) => event.sender.send('agent:tool-call-activity', activity))
    return result.proposal ? { ...result, proposal: rememberProposal(vault.vaultPath, result.proposal) } : result
  })
  ipcMain.handle('index:status', async () => {
    const vault = await findSavedVault()
    return vault ? getVaultIndex(vault.vaultPath).getStatus() : null
  })
  ipcMain.handle('index:rebuild', async (event) => {
    const vault = await findSavedVault()
    if (!vault) throw new Error('Choose a vault before building an index.')
    return refreshIndex(vault.vaultPath, (progress) => event.sender.send('index:progress', progress))
  })
  ipcMain.handle('index:get-corpus', async () => {
    const vault = await findSavedVault()
    return vault ? getVaultIndex(vault.vaultPath).getCorpus() : []
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
