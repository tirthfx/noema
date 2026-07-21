/**
 * Shared resolution for "which corpus is currently open".
 *
 * The desktop app and the standalone MCP server are separate processes that must agree on
 * this, and the MCP server cannot import `electron` — so the pointer's location and shape
 * live here rather than being re-derived on each side. They diverged once already: the MCP
 * server hardcoded a capitalised product name while Electron derives its userData directory
 * from `package.json`'s lowercase `name`, which only worked because macOS's default
 * filesystem is case-insensitive.
 */
import { access, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Matches `package.json`'s `name`, which is what Electron uses for `app.getPath('userData')`. */
const APP_DIRECTORY_NAME = 'noema'

export const LAST_VAULT_FILE = 'last-vault.json'

export interface VaultPointer {
  vaultPath: string
  name?: string
  kind?: 'noema' | 'folder'
}

/**
 * Electron's default `app.getPath('userData')` per platform. Inside Electron, prefer passing
 * the real `app.getPath('userData')` — this exists for the MCP server, which has no `app`.
 */
export function defaultUserDataPath(): string {
  const home = homedir()
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', APP_DIRECTORY_NAME)
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), APP_DIRECTORY_NAME)
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), APP_DIRECTORY_NAME)
}

export function lastVaultPointerPath(userDataPath: string): string {
  return join(userDataPath, LAST_VAULT_FILE)
}

export async function isReadableDirectory(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isDirectory()) return false
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

/**
 * Reads the pointer and confirms the vault it names is still there and still claims to be
 * the same vault (`.noema/config.json` agreeing on its own path). The config check is what
 * stops a stale pointer from resolving to an unrelated directory that happens to exist.
 */
export async function resolveSavedVault(userDataPath: string): Promise<VaultPointer | null> {
  const pointer = await readJsonFile<VaultPointer>(lastVaultPointerPath(userDataPath))
  if (!pointer?.vaultPath || !(await isReadableDirectory(pointer.vaultPath))) return null
  const config = await readJsonFile<VaultPointer>(join(pointer.vaultPath, '.noema', 'config.json'))
  if (config?.vaultPath !== pointer.vaultPath) return null
  return { vaultPath: pointer.vaultPath, name: config.name, kind: config.kind }
}
