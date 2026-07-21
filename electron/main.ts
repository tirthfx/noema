import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
let pendingDisplaySourceId: string | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    backgroundColor: '#F7F6F2',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: process.platform === 'win32' ? false : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('focus:list-sources', async () => (await desktopCapturer.getSources({ types: ['window', 'screen'], fetchWindowIcons: false, thumbnailSize: { width: 0, height: 0 } })).map((source) => ({ id: source.id, name: source.name })))
  ipcMain.handle('focus:select-source', (_event, id: unknown) => { pendingDisplaySourceId = typeof id === 'string' ? id : null })
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const selectedId = pendingDisplaySourceId
    pendingDisplaySourceId = null
    if (!selectedId) return callback({})
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } })
    const selected = sources.find((source) => source.id === selectedId)
    callback(selected ? { video: selected } : {})
  })
  registerIpcHandlers(() => mainWindow)
  createWindow()
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('app:quick-ask')
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
