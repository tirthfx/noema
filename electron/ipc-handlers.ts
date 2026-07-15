import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { VaultConfig, VaultSelection } from '../shared/types'

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
    await access(path)
    return true
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
  return { vaultPath }
}

async function getSavedVault(): Promise<VaultSelection | null> {
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
  ipcMain.handle('window:minimize', () => getWindow()?.minimize())
  ipcMain.handle('window:toggle-maximize', () => {
    const window = getWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.handle('window:close', () => getWindow()?.close())
}
