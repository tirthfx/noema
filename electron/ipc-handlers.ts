import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ContextSelection, ConversationTurn, FocusSession, IndexProgress, IndexStatus, ReviewItem, VaultConfig, VaultSelection, WriteResult } from '../shared/types'
import { getVaultIndex } from './index'
import { listNotes } from './tools/list-notes'
import { readNote } from './tools/read-note'
import { searchNotes } from './tools/search-notes'
import { answerQuestion, generateArtifact, proposeCapture, proposeLink, proposeMeeting, sendAgentMessage } from './agent'
import { describeWriteFailure, readVaultNote, resolveExistingVaultPath, writeVaultNote } from './vault'
import { createWorkspaceStore } from './workspace-store'
import { buildFocusRecap, buildTimelineEvents } from '../shared/workspace'
import { importCorpusFiles, initializeCorpus } from './corpus'
import { lastVaultPointerPath, resolveSavedVault } from './vault-pointer'
import { readSelectedContext, type SelectedContextContent } from './context-reader'

const PROPOSAL_TTL_MS = 30 * 60 * 1_000
const CONTEXT_TTL_MS = 4 * 60 * 60 * 1_000

type PendingProposal = { vaultPath: string; path: string; kind: 'new' | 'edit'; baseContent?: string; expiresAt: number }
const pendingProposals = new Map<string, PendingProposal>()
const selectedContexts = new Map<string, { path: string; kind: 'file' | 'folder'; expiresAt: number }>()

function rememberProposal(vaultPath: string, proposal: import('../shared/types').NoteProposal): import('../shared/types').NoteProposal {
  const now = Date.now()
  for (const [id, pending] of pendingProposals) if (pending.expiresAt <= now) pendingProposals.delete(id)
  const approvalId = randomUUID()
  pendingProposals.set(approvalId, { vaultPath, path: proposal.path, kind: proposal.kind, baseContent: proposal.baseContent, expiresAt: now + PROPOSAL_TTL_MS })
  return { ...proposal, approvalId }
}

async function saveVault(
  vaultPath: string,
  metadata: Pick<VaultConfig, 'name' | 'kind'> = {},
  onProgress?: (progress: IndexProgress) => void
): Promise<VaultSelection> {
  const noemaPath = join(vaultPath, '.noema')
  await mkdir(noemaPath, { recursive: true })
  const config: VaultConfig = {
    vaultPath,
    name: metadata.name?.trim() || basename(vaultPath),
    kind: metadata.kind ?? 'folder'
  }
  await writeFile(join(noemaPath, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  await writeFile(lastVaultPointerPath(app.getPath('userData')), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return { ...config, indexStatus: await refreshIndex(vaultPath, onProgress) }
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
      error: error instanceof Error ? error.message : 'Noema could not build the corpus index.'
    }
  }
}

async function getSavedVault(onProgress?: (progress: IndexProgress) => void): Promise<VaultSelection | null> {
  const vault = await findSavedVault()
  return vault ? { ...vault, indexStatus: await refreshIndex(vault.vaultPath, onProgress) } : null
}

async function findSavedVault(): Promise<VaultSelection | null> {
  const saved = await resolveSavedVault(app.getPath('userData'))
  return saved ? { ...saved, name: saved.name ?? basename(saved.vaultPath), kind: saved.kind ?? 'folder' } : null
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  const workspace = createWorkspaceStore(app.getPath('userData'))
  ipcMain.handle('vault:get-saved', (event) => getSavedVault((progress) => event.sender.send('index:progress', progress)))
  ipcMain.handle('vault:create-corpus', async (event) => {
    const corpusPath = join(app.getPath('documents'), 'Noema Library')
    const config = await initializeCorpus(corpusPath, 'Noema Library')
    return saveVault(corpusPath, config, (progress) => event.sender.send('index:progress', progress))
  })
  ipcMain.handle('vault:choose', async (event) => {
    const options: OpenDialogOptions = {
      title: 'Connect a Markdown folder or Obsidian vault',
      properties: ['openDirectory', 'createDirectory']
    }
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return saveVault(result.filePaths[0], { name: basename(result.filePaths[0]), kind: 'folder' }, (progress) => event.sender.send('index:progress', progress))
  })
  ipcMain.handle('vault:import-files', async (event) => {
    const corpus = await findSavedVault()
    if (!corpus) throw new Error('Open a corpus before importing sources.')
    const options: OpenDialogOptions = {
      title: 'Add sources to Noema',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Knowledge sources', extensions: ['md', 'txt'] }]
    }
    const window = getWindow()
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { imported: [], skipped: [] }
    const imported = await importCorpusFiles(corpus.vaultPath, result.filePaths)
    return {
      ...imported,
      indexStatus: await refreshIndex(corpus.vaultPath, (progress) => event.sender.send('index:progress', progress))
    }
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
    if (!vault) return { ok: false, error: 'Open a corpus before writing.' }
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
    const vault = await findSavedVault(); if (!vault) throw new Error('Open and index a corpus before capturing into it.')
    const result = await proposeCapture(vault.vaultPath, { kind: value.kind, value: value.value }, (activity) => event.sender.send('agent:tool-call-activity', activity))
    return result.proposal ? { ...result, proposal: rememberProposal(vault.vaultPath, result.proposal) } : result
  })
  ipcMain.handle('capture:propose-link', async (event, fromPath: unknown, toPath: unknown, context: unknown) => {
    if (typeof fromPath !== 'string' || typeof toPath !== 'string' || !fromPath.trim() || !toPath.trim()) throw new Error('Choose both notes before proposing a link.')
    if (context !== undefined && typeof context !== 'string') throw new Error('Invalid link context.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Open a corpus before proposing a link.')
    const result = await proposeLink(vault.vaultPath, fromPath, toPath, context ?? '', (activity) => event.sender.send('agent:tool-call-activity', activity))
    return result.proposal ? { ...result, proposal: rememberProposal(vault.vaultPath, result.proposal) } : result
  })
  ipcMain.handle('capture:propose-meeting', async (event, transcript: unknown) => {
    if (typeof transcript !== 'string' || !transcript.trim()) throw new Error('Paste a transcript before capturing it.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Open and index a corpus before capturing into it.')
    const result = await proposeMeeting(vault.vaultPath, transcript.trim(), (activity) => event.sender.send('agent:tool-call-activity', activity))
    return result.proposal ? { ...result, proposal: rememberProposal(vault.vaultPath, result.proposal) } : result
  })
  ipcMain.handle('context:pick', async (_event, kind: unknown): Promise<ContextSelection | null> => {
    if (kind !== 'file' && kind !== 'folder') throw new Error('Choose whether to attach a file or folder.')
    const options: OpenDialogOptions = {
      title: kind === 'file' ? 'Choose a file for Noema to understand' : 'Choose a folder for Noema to understand',
      properties: kind === 'file' ? ['openFile'] : ['openDirectory']
    }
    const window = getWindow()
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const id = randomUUID()
    const path = result.filePaths[0]
    const now = Date.now()
    for (const [token, selected] of selectedContexts) if (selected.expiresAt <= now) selectedContexts.delete(token)
    selectedContexts.set(id, { path, kind, expiresAt: now + CONTEXT_TTL_MS })
    return { id, name: basename(path), kind, displayPath: path }
  })
  ipcMain.handle('index:status', async () => {
    const vault = await findSavedVault()
    return vault ? getVaultIndex(vault.vaultPath).getStatus() : null
  })
  ipcMain.handle('index:rebuild', async (event) => {
    const vault = await findSavedVault()
    if (!vault) throw new Error('Open a corpus before building an index.')
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
  ipcMain.handle('recall:get-continuity', async () => {
    const vault = await findSavedVault()
    if (!vault) return null
    const previousVisitAt = await workspace.getLastSeen()
    try {
      const index = getVaultIndex(vault.vaultPath)
      // Startup refresh already walked the corpus. Reuse that exact current snapshot; direct
      // callers still fall back to a fresh walk if no successful refresh has happened yet.
      const notes = index.getCorpusSnapshot() ?? await index.getCorpus()
      const changedNotes = previousVisitAt
        ? notes.filter((note) => new Date(note.modifiedAt).getTime() > new Date(previousVisitAt).getTime()).length
        : 0
      await workspace.setLastSeen(new Date().toISOString())
      if (!previousVisitAt) return null
      return { previousVisitAt, changedNotes }
    } catch {
      return null
    }
  })
  ipcMain.handle('recall:get-timeline', async () => {
    const vault = await findSavedVault()
    if (!vault) return []
    try {
      const index = getVaultIndex(vault.vaultPath)
      const notes = index.getCorpusSnapshot() ?? await index.getCorpus()
      const focusSessions = await workspace.getFocusSessions()
      return buildTimelineEvents({ notes, focusSessions })
    } catch {
      return []
    }
  })
  ipcMain.handle('session:get', () => workspace.getSession())
  ipcMain.handle('session:save', async (_event, session: unknown) => {
    if (!session || typeof session !== 'object') throw new Error('Invalid session state.')
    // The store re-validates and strips anything unsafe (including capability tokens).
    await workspace.saveSession(session as import('../shared/types').WorkspaceSessionState)
  })
  ipcMain.handle('session:log-activity', async (_event, event: unknown) => {
    if (!event || typeof event !== 'object') throw new Error('Invalid activity event.')
    const value = event as import('../shared/types').ActivityEvent
    if (typeof value.id !== 'string' || typeof value.title !== 'string') throw new Error('Invalid activity event.')
    await workspace.appendActivity({ ...value, at: typeof value.at === 'string' ? value.at : new Date().toISOString() })
  })
  ipcMain.handle('review:get', () => workspace.getReviewItems())
  ipcMain.handle('review:save', async (_event, items: unknown) => {
    if (!Array.isArray(items)) throw new Error('Invalid review items.')
    const safe = items.filter((item): item is ReviewItem => Boolean(item && typeof item === 'object' && typeof (item as ReviewItem).id === 'string' && ((item as ReviewItem).status === 'open' || (item as ReviewItem).status === 'done'))).slice(0, 100)
    await workspace.saveReviewItems(safe)
  })
  ipcMain.handle('focus:get', () => workspace.getFocusSessions())
  ipcMain.handle('focus:save', async (_event, session: unknown) => {
    if (!session || typeof session !== 'object') throw new Error('Invalid focus session.')
    const value = session as FocusSession
    if (typeof value.id !== 'string' || typeof value.context !== 'string' || typeof value.startedAt !== 'string' || !Array.isArray(value.checkpoints) || !Array.isArray(value.relatedNotes)) throw new Error('Invalid focus session.')
    return workspace.saveFocusSession({ ...value, context: value.context.slice(0, 300), checkpoints: value.checkpoints.filter((item) => typeof item === 'string').slice(0, 30) })
  })
  ipcMain.handle('focus:delete', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid focus session.')
    await workspace.deleteFocusSession(id)
  })
  ipcMain.handle('focus:propose-recap', async (_event, session: unknown) => {
    if (!session || typeof session !== 'object') throw new Error('Invalid focus session.')
    const value = session as FocusSession
    if (typeof value.id !== 'string' || typeof value.context !== 'string' || typeof value.startedAt !== 'string' || !Array.isArray(value.checkpoints) || !Array.isArray(value.relatedNotes)) throw new Error('Invalid focus session.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Open a corpus before saving a recap.')
    const day = (value.endedAt ?? value.startedAt).slice(0, 10)
    const safeTitle = value.context.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'focus-session'
    const proposal = { path: `Focus/${day}-${safeTitle}.md`, content: buildFocusRecap(value), kind: 'new' as const, source: 'Local Focus Memory' }
    return { proposal: rememberProposal(vault.vaultPath, proposal) }
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
    if (!vault) throw new Error('Open and index a corpus before asking Noema.')
    return sendAgentMessage(vault.vaultPath, message.trim(), (activity) => {
      event.sender.send('agent:tool-call-activity', activity)
    })
  })
  ipcMain.handle('agent:generate-artifact', async (event, topic: unknown, persona: unknown) => {
    if (typeof topic !== 'string' || !topic.trim() || !['Academic', 'Socratic Critic', 'Plain-Language'].includes(persona as string)) throw new Error('Choose a topic and persona before generating a review.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Open and index a corpus before generating a review.')
    return generateArtifact(vault.vaultPath, topic.trim(), persona as import('../shared/types').Persona, (activity) => event.sender.send('agent:tool-call-activity', activity))
  })
  ipcMain.handle('agent:answer-question', async (event, question: unknown, history: unknown, context: unknown) => {
    if (typeof question !== 'string' || !question.trim()) throw new Error('Enter a question before sending it.')
    const vault = await findSavedVault(); if (!vault) throw new Error('Open and index a corpus before asking Noema.')
    const safeHistory: ConversationTurn[] = Array.isArray(history)
      ? history.filter((turn): turn is ConversationTurn => Boolean(turn && typeof turn === 'object' && ((turn as ConversationTurn).role === 'user' || (turn as ConversationTurn).role === 'assistant') && typeof (turn as ConversationTurn).content === 'string'))
        .slice(-8)
        .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2_000) }))
      : []
    const requestedContext = Array.isArray(context)
      ? context.filter((item): item is ContextSelection => Boolean(item && typeof item === 'object' && typeof (item as ContextSelection).id === 'string')).slice(-4)
      : []
    const resolvedContext: SelectedContextContent[] = []
    for (const item of requestedContext) {
      const selected = selectedContexts.get(item.id)
      if (!selected || selected.expiresAt <= Date.now()) continue
      resolvedContext.push(await readSelectedContext(selected.path, selected.kind))
    }
    return answerQuestion(
      vault.vaultPath,
      question.trim(),
      (activity) => event.sender.send('agent:tool-call-activity', activity),
      safeHistory,
      { selectedContext: resolvedContext }
    )
  })
  ipcMain.handle('app:open-external', async (_event, value: unknown) => {
    if (typeof value !== 'string') throw new Error('Invalid web source URL.')
    let url: URL
    try { url = new URL(value) } catch { throw new Error('Invalid web source URL.') }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Noema only opens http and https sources.')
    await shell.openExternal(url.toString())
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
