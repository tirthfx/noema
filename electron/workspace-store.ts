import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ActivityEvent, FocusSession, ReviewItem, WorkspaceSessionState } from '../shared/types'

interface WorkspaceData extends Record<string, unknown> {
  reviewItems: ReviewItem[]
  focusSessions: FocusSession[]
  session?: WorkspaceSessionState
  lastSeenAt?: string
}
const EMPTY: WorkspaceData = { reviewItems: [], focusSessions: [] }

const MAX_CONVERSATION_TURNS = 40
const MAX_ACTIVITY_EVENTS = 30

/**
 * Session state crosses the process boundary from the renderer, so it is re-validated here
 * rather than trusted. Anything malformed is dropped; a capability token accidentally attached
 * to selected context is stripped — only display metadata is ever persisted.
 */
function sanitizeSession(value: unknown): WorkspaceSessionState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<WorkspaceSessionState>
  const conversation = Array.isArray(raw.conversation)
    ? raw.conversation
        .filter((turn): turn is WorkspaceSessionState['conversation'][number] =>
          Boolean(turn && typeof turn === 'object' && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string'))
        .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 8_000), mode: turn.mode }))
        .slice(-MAX_CONVERSATION_TURNS)
    : []
  const selectedContext = Array.isArray(raw.selectedContext)
    ? raw.selectedContext
        .filter((item): item is WorkspaceSessionState['selectedContext'][number] =>
          Boolean(item && typeof item === 'object' && typeof item.name === 'string' && (item.kind === 'file' || item.kind === 'folder') && typeof item.displayPath === 'string'))
        .map((item) => ({ name: item.name.slice(0, 300), kind: item.kind, displayPath: item.displayPath.slice(0, 1_000) }))
        .slice(0, 4)
    : []
  const recentActivity = Array.isArray(raw.recentActivity)
    ? raw.recentActivity
        .filter((event): event is ActivityEvent => Boolean(event && typeof event === 'object' && typeof event.id === 'string' && typeof event.title === 'string' && typeof event.at === 'string'))
        .map((event) => ({ id: event.id, at: event.at, kind: event.kind, title: event.title.slice(0, 300), detail: event.detail?.slice(0, 500), path: event.path?.slice(0, 1_000) }))
        .slice(0, MAX_ACTIVITY_EVENTS)
    : []
  return {
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    activeMode: typeof raw.activeMode === 'string' ? raw.activeMode.slice(0, 40) : 'today',
    conversation,
    selectedContext,
    recentActivity
  }
}

export function createWorkspaceStore(dataPath: string) {
  const filePath = join(dataPath, 'workspace-memory.json')
  // Every read-modify-write mutation joins this queue. Atomic rename protects readers from
  // partial JSON; the queue protects mutations from both reading the same old snapshot and
  // then clobbering one another's unrelated fields.
  let mutationQueue: Promise<void> = Promise.resolve()

  async function read(): Promise<WorkspaceData> {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<WorkspaceData>
      return {
        ...parsed,
        reviewItems: Array.isArray(parsed.reviewItems) ? parsed.reviewItems : [],
        focusSessions: Array.isArray(parsed.focusSessions) ? parsed.focusSessions : [],
        session: sanitizeSession(parsed.session),
        lastSeenAt: typeof parsed.lastSeenAt === 'string' ? parsed.lastSeenAt : undefined
      }
    } catch { return { ...EMPTY } }
  }

  async function write(data: WorkspaceData): Promise<void> {
    await mkdir(dataPath, { recursive: true })
    const temporary = `${filePath}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    await rename(temporary, filePath)
  }

  function mutate<T>(operation: (data: WorkspaceData) => { data: WorkspaceData; result: T }): Promise<T> {
    const run = mutationQueue.then(async () => {
      const outcome = operation(await read())
      await write(outcome.data)
      return outcome.result
    })
    mutationQueue = run.then(() => undefined, () => undefined)
    return run
  }

  return {
    getReviewItems: async () => (await read()).reviewItems,
    saveReviewItems: (reviewItems: ReviewItem[]) => mutate((data) => ({ data: { ...data, reviewItems }, result: undefined })),
    getFocusSessions: async () => (await read()).focusSessions,
    saveFocusSession: (session: FocusSession) => mutate((data) => {
      const focusSessions = [session, ...data.focusSessions.filter((item) => item.id !== session.id)].slice(0, 50)
      return { data: { ...data, focusSessions }, result: session }
    }),
    deleteFocusSession: (id: string) => mutate((data) => ({
      data: { ...data, focusSessions: data.focusSessions.filter((item) => item.id !== id) },
      result: undefined
    })),
    /**
     * Continuity deliberately separates observation from commit: the caller first obtains
     * corpus data, then records a successful visit. A failed corpus read must not consume the
     * timestamp that the next successful launch needs.
     */
    getLastSeen: async (): Promise<string | null> => (await read()).lastSeenAt ?? null,
    setLastSeen: (lastSeenAt: string): Promise<void> => mutate((data) => ({ data: { ...data, lastSeenAt }, result: undefined })),
    /**
     * The durable working session: the last conversation, active section, selected-context
     * metadata, and recent meaningful actions. Persisting this is what makes a relaunch feel
     * like resuming rather than a fresh chat. Capability tokens are deliberately excluded.
     */
    getSession: async (): Promise<WorkspaceSessionState | null> => (await read()).session ?? null,
    saveSession: (session: WorkspaceSessionState): Promise<void> => mutate((data) => ({
      data: { ...data, session: sanitizeSession({ ...session, updatedAt: new Date().toISOString() }) },
      result: undefined
    })),
    appendActivity: (event: ActivityEvent): Promise<void> => mutate((data) => {
      const previous = data.session ?? { updatedAt: new Date().toISOString(), activeMode: 'today', conversation: [], selectedContext: [], recentActivity: [] }
      const recentActivity = [event, ...previous.recentActivity.filter((item) => item.id !== event.id)].slice(0, MAX_ACTIVITY_EVENTS)
      return { data: { ...data, session: { ...previous, recentActivity, updatedAt: new Date().toISOString() } }, result: undefined }
    })
  }
}
