import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { join, basename, dirname, resolve, relative, isAbsolute } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs/promises'
import pty from 'node-pty'
import icon from '../../resources/icon.png?asset'
import { registerMarketplaceHandlers, activateInstalledPackages } from './marketplace.js'

const terminalSessions = new Map()

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: 'Sam Code',
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.samcode')
  app.setName('Sam Code')

  registerMarketplaceHandlers()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers for file system
  ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  ipcMain.handle('fs:readDir', async (_, dirPath) => {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true })
      return items.map((item) => ({
        name: item.name,
        path: join(dirPath, item.name),
        isDirectory: item.isDirectory()
      }))
    } catch (e) {
      console.error('Failed to read dir', e)
      return []
    }
  })

  ipcMain.handle('fs:readFile', async (_, filePath) => {
    try {
      const stats = await fs.stat(filePath)
      const maxPreviewBytes = 2 * 1024 * 1024

      if (stats.size > maxPreviewBytes) {
        const handle = await fs.open(filePath, 'r')
        try {
          const buffer = Buffer.alloc(maxPreviewBytes)
          const { bytesRead } = await handle.read(buffer, 0, maxPreviewBytes, 0)
          return {
            path: filePath,
            name: basename(filePath),
            content: buffer.toString('utf-8', 0, bytesRead),
            size: stats.size,
            truncated: true
          }
        } finally {
          await handle.close()
        }
      }

      const content = await fs.readFile(filePath, 'utf-8')
      return {
        path: filePath,
        name: basename(filePath),
        content,
        size: stats.size,
        truncated: false
      }
    } catch (e) {
      console.error('Failed to read file', e)
      return null
    }
  })

  ipcMain.handle('fs:saveFile', async (_, filePath, content) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return true
    } catch (e) {
      console.error('Failed to save file', e)
      return false
    }
  })

  ipcMain.handle('fs:saveAs', async (_, content) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: 'untitled.txt'
      })
      if (canceled || !filePath) return null
      await fs.writeFile(filePath, String(content ?? ''), 'utf-8')
      return filePath
    } catch (e) {
      console.error('Failed to save as', e)
      return null
    }
  })

  ipcMain.handle('fs:makeDir', async (_, dirPath) => {
    try {
      await fs.mkdir(String(dirPath || ''), { recursive: true })
      return true
    } catch (e) {
      console.error('Failed to create directory', e)
      return false
    }
  })

  ipcMain.handle('fs:delete', async (_, targetPath) => {
    try {
      await fs.rm(String(targetPath || ''), { recursive: true, force: true })
      return true
    } catch (e) {
      console.error('Failed to delete path', e)
      return false
    }
  })

  ipcMain.handle('fs:rename', async (_, oldPath, newPath) => {
    try {
      const destDir = dirname(String(newPath || ''))
      if (destDir) await fs.mkdir(destDir, { recursive: true })
      await fs.rename(String(oldPath || ''), String(newPath || ''))
      return true
    } catch (e) {
      console.error('Failed to rename', e)
      return false
    }
  })

  ipcMain.handle('fs:copy', async (_, src, dest) => {
    try {
      const destDir = dirname(String(dest || ''))
      if (destDir) await fs.mkdir(destDir, { recursive: true })
      if (typeof fs.cp === 'function') {
        await fs.cp(String(src || ''), String(dest || ''), { recursive: true })
      } else {
        // fallback: copy file only
        await fs.copyFile(String(src || ''), String(dest || ''))
      }
      return true
    } catch (e) {
      console.error('Failed to copy', e)
      return false
    }
  })

  ipcMain.handle('agent:applyOperations', async (_, payload) => {
    const rootFolder = String(payload?.rootFolder || '').trim()
    const operations = Array.isArray(payload?.operations) ? payload.operations : []

    if (!rootFolder) {
      return { applied: [], failed: [{ reason: 'Workspace folder is not selected.' }] }
    }

    const resolvedRoot = resolve(rootFolder)
    const applied = []
    const failed = []

    for (const operation of operations) {
      const action = String(operation?.action || '').toLowerCase()
      const rawPath = String(operation?.path || '').trim()
      const command = String(operation?.command || '').trim()

      if (!action) {
        failed.push({ action, path: rawPath, reason: 'Operation must include action.' })
        continue
      }

      if (action === 'execute') {
        if (!command) {
          failed.push({ action, path: rawPath, reason: 'Execute action requires a command.' })
          continue
        }

        try {
          // Execute the command using the existing shell:runCommand mechanism
          const result = await new Promise((resolve, reject) => {
            const isWindows = process.platform === 'win32'
            const child = isWindows
              ? spawn(
                  'powershell.exe',
                  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
                  {
                    cwd: String(operation?.cwd || resolvedRoot).trim() || undefined,
                    windowsHide: true,
                    shell: false
                  }
                )
              : spawn('sh', ['-lc', command], {
                  cwd: String(operation?.cwd || resolvedRoot).trim() || undefined,
                  windowsHide: true,
                  shell: false
                })

            let stdout = ''
            let stderr = ''

            child.stdout.on('data', (chunk) => {
              stdout += chunk.toString()
            })

            child.stderr.on('data', (chunk) => {
              stderr += chunk.toString()
            })

            child.on('error', (error) => {
              reject(error)
            })

            child.on('close', (code) => {
              resolve({ code, stdout, stderr })
            })
          })

          applied.push({
            action: 'execute',
            path: command.length > 50 ? `${command.substring(0, 50)}...` : command,
            command,
            result: { code: result.code, stdout: result.stdout, stderr: result.stderr }
          })
        } catch (error) {
          failed.push({
            action,
            path: rawPath || '',
            reason: `Failed to execute command: ${error.message}`
          })
        }

        continue
      }

      if (!rawPath) {
        failed.push({ action, path: rawPath, reason: 'Operation must include a path.' })
        continue
      }

      const targetPath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(resolvedRoot, rawPath)
      const relPath = relative(resolvedRoot, targetPath)
      const isOutsideWorkspace = !relPath || relPath.startsWith('..') || isAbsolute(relPath)

      if (isOutsideWorkspace) {
        failed.push({
          action,
          path: rawPath,
          reason: 'Path must stay inside the selected workspace folder.'
        })
        continue
      }

      try {
        if (
          action === 'create' ||
          action === 'update' ||
          action === 'upsert' ||
          action === 'write'
        ) {
          await fs.mkdir(dirname(targetPath), { recursive: true })
          await fs.writeFile(targetPath, String(operation?.content ?? ''), 'utf-8')
          applied.push({ action: 'write', path: targetPath })
          continue
        }

        if (action === 'delete') {
          await fs.rm(targetPath, { recursive: true, force: true })
          applied.push({ action: 'delete', path: targetPath })
          continue
        }

        if (action === 'mkdir') {
          await fs.mkdir(targetPath, { recursive: true })
          applied.push({ action: 'mkdir', path: targetPath })
          continue
        }

        failed.push({ action, path: rawPath, reason: `Unsupported action: ${action}` })
      } catch (error) {
        failed.push({ action, path: rawPath, reason: error.message })
      }
    }

    return { applied, failed }
  })

  const getShellConfig = (shellName) => {
    const normalizedShell = String(shellName || 'powershell').toLowerCase()

    if (process.platform === 'win32') {
      if (normalizedShell === 'cmd') {
        return { command: 'cmd.exe', args: ['/d', '/s', '/k'] }
      }

      return {
        command: 'powershell.exe',
        args: ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass']
      }
    }

    if (normalizedShell === 'cmd') {
      return { command: 'sh', args: ['-l'] }
    }

    return { command: process.env.SHELL || 'bash', args: ['-l'] }
  }

  const disposeTerminalSession = (sessionId) => {
    const session = terminalSessions.get(sessionId)
    if (!session) return false

    try {
      session.terminal.kill()
    } catch (error) {
      console.error('Failed to dispose terminal session', error)
    }

    terminalSessions.delete(sessionId)
    return true
  }

  ipcMain.handle('terminal:create', async (event, payload) => {
    const sessionId = String(payload?.sessionId || randomUUID())
    const cwd = String(payload?.cwd || '').trim()
    const shellName = String(payload?.shell || 'powershell')
    const cols = Number(payload?.cols || 120)
    const rows = Number(payload?.rows || 30)
    const shellConfig = getShellConfig(shellName)

    disposeTerminalSession(sessionId)

    const terminal = pty.spawn(shellConfig.command, shellConfig.args, {
      name: 'xterm-256color',
      cols: Number.isFinite(cols) ? cols : 120,
      rows: Number.isFinite(rows) ? rows : 30,
      cwd: cwd || app.getPath('home'),
      env: {
        ...process.env,
        TERM: 'xterm-256color'
      }
    })

    terminal.onData((data) => {
      event.sender.send('terminal:data', { sessionId, data })
    })

    terminal.onExit(({ exitCode, signal }) => {
      event.sender.send('terminal:exit', { sessionId, exitCode, signal })
      terminalSessions.delete(sessionId)
    })

    terminalSessions.set(sessionId, { terminal })
    return { sessionId }
  })

  ipcMain.handle('terminal:write', async (_, sessionId, data) => {
    const session = terminalSessions.get(String(sessionId))
    if (!session) return false
    session.terminal.write(String(data ?? ''))
    return true
  })

  ipcMain.handle('terminal:resize', async (_, sessionId, cols, rows) => {
    const session = terminalSessions.get(String(sessionId))
    if (!session) return false
    session.terminal.resize(Number(cols) || 120, Number(rows) || 30)
    return true
  })

  ipcMain.handle('terminal:dispose', async (_, sessionId) => {
    return disposeTerminalSession(String(sessionId))
  })

  ipcMain.handle('shell:runCommand', async (_, payload) => {
    const command = String(payload?.command || '').trim()
    const cwd = String(payload?.cwd || '').trim()
    const shellName = String(payload?.shell || 'powershell').toLowerCase()

    if (!command) {
      throw new Error('Command is required')
    }

    return await new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32'
      const child = isWindows
        ? spawn(
            shellName === 'cmd' ? 'cmd.exe' : 'powershell.exe',
            shellName === 'cmd'
              ? ['/d', '/s', '/c', command]
              : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
            {
              cwd: cwd || undefined,
              windowsHide: true,
              shell: false
            }
          )
        : spawn('sh', ['-lc', command], {
            cwd: cwd || undefined,
            windowsHide: true,
            shell: false
          })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        reject(error)
      })

      child.on('close', (code) => {
        resolve({ code, stdout, stderr })
      })
    })
  })

  ipcMain.handle('shell:openExternal', async (_, targetPath) => {
    try {
      const url = pathToFileURL(String(targetPath || '')).toString()
      await shell.openExternal(url)
      return true
    } catch (error) {
      console.error('Failed to open external URL', error)
      return false
    }
  })

  ipcMain.handle('openrouter:listModels', async (_, apiKey) => {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${String(apiKey || '').trim()}`,
          Accept: 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'SamCode'
        }
      })

      if (!response.ok) {
        throw new Error(`OpenRouter returned ${response.status}`)
      }

      const payload = await response.json()
      const models = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : []

      return models
        .map((model) => ({
          id: model.id,
          name: model.name || model.id
        }))
        .filter((model) => Boolean(model.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error('Failed to load OpenRouter models', error)
      throw error
    }
  })

  ipcMain.handle('provider:listModels', async (_, connection, provider) => {
    const value = String(connection || '').trim()
    const selectedProvider = String(provider || 'auto')
      .trim()
      .toLowerCase()
    const inferProvider = (input) => {
      const lowerValue = String(input || '')
        .trim()
        .toLowerCase()
      if (!lowerValue) return 'openrouter'
      if (/^https?:\/\//.test(lowerValue)) {
        if (
          lowerValue.includes('localhost') ||
          lowerValue.includes('127.0.0.1') ||
          lowerValue.includes('/models')
        ) {
          return 'ollama'
        }
        if (lowerValue.includes('openrouter.ai') || lowerValue.includes('/openrouter')) {
          return 'openrouter'
        }
        if (lowerValue.includes('api.openai.com')) {
          return 'openai'
        }
        if (lowerValue.includes('googleapis.com') || lowerValue.includes('generativelanguage')) {
          return 'google'
        }
        return 'ollama'
      }
      if (/^sk-or-v1-|^or-/.test(value) || lowerValue.includes('openrouter')) return 'openrouter'
      if (/^sk-|^pk-|^openai|^azure/.test(lowerValue)) return 'openai'
      if (/^AIza[A-Za-z0-9_-]{35}$/.test(value)) return 'google'
      return 'openai'
    }

    const providerToUse = selectedProvider === 'auto' ? inferProvider(value) : selectedProvider
    const isUrl = (input) => {
      try {
        new URL(input)
        return true
      } catch {
        return false
      }
    }
    const normalizeUrl = (url) =>
      String(url || '')
        .trim()
        .replace(/\/+$/, '')
    const hasPath = (url, path) => normalizeUrl(url).toLowerCase().includes(path)
    const normalizeOrigin = (input, fallbackProtocol = 'http:') => {
      const raw = String(input || '')
        .trim()
        .replace(/\/+$/, '')
      if (!raw) return ''
      if (/^https?:\/\//i.test(raw)) {
        try {
          return new URL(raw).origin
        } catch {
          return raw.replace(/\/(api\/(chat|tags)|v1\/models|models).*$/i, '')
        }
      }
      const stripped = raw.replace(/\/(api\/(chat|tags)|v1\/models|models).*$/i, '')
      return `${fallbackProtocol}//${stripped}`
    }

    const listOpenAIModels = async (key) => {
      const endpoint = isUrl(key) ? normalizeUrl(key) : 'https://api.openai.com'
      let url = 'https://api.openai.com/v1/models'
      if (isUrl(key)) {
        if (endpoint.endsWith('/models')) {
          url = endpoint
        } else if (hasPath(endpoint, '/v1')) {
          url = `${endpoint}/models`
        } else {
          url = `${endpoint}/v1/models`
        }
      }
      const response = await fetch(url, {
        headers: {
          ...(isUrl(key) ? {} : { Authorization: `Bearer ${String(key).trim()}` }),
          Accept: 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`OpenAI returned ${response.status}`)
      }

      const payload = await response.json()
      const models = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : []

      return models
        .map((model) => ({
          id: model.id || model.name,
          name: model.id || model.name
        }))
        .filter((model) => Boolean(model.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    const listGoogleModels = async (key) => {
      const endpoint = isUrl(key) ? normalizeUrl(key) : ''
      let url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(String(key || '').trim())}`
      if (isUrl(key)) {
        if (endpoint.endsWith('/models')) {
          url = endpoint
        } else if (hasPath(endpoint, '/v1')) {
          url = `${endpoint}/models`
        } else {
          url = `${endpoint}/v1/models`
        }
      }
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Google returned ${response.status}`)
      }

      const payload = await response.json()
      const models = Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload)
          ? payload
          : []

      return models
        .map((model) => ({
          id: model.name || model.model || model.id,
          name: model.name || model.model || model.id
        }))
        .filter((model) => Boolean(model.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    const listOpenRouterModels = async (key) => {
      const endpoint = isUrl(key) ? normalizeUrl(key) : 'https://openrouter.ai'
      let modelsUrl = 'https://openrouter.ai/api/v1/models'
      if (isUrl(key)) {
        if (endpoint.endsWith('/models')) {
          modelsUrl = endpoint
        } else if (endpoint.includes('/chat/completions')) {
          modelsUrl = endpoint.replace(/\/chat\/completions.*$/i, '/models')
        } else if (hasPath(endpoint, '/api/v1')) {
          modelsUrl = `${endpoint}/models`
        } else {
          modelsUrl = `${endpoint}/api/v1/models`
        }
      }
      const response = await fetch(modelsUrl, {
        headers: {
          ...(isUrl(key) ? {} : { Authorization: `Bearer ${String(key).trim()}` }),
          Accept: 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'SamCode'
        }
      })

      if (!response.ok) {
        throw new Error(`OpenRouter returned ${response.status}`)
      }

      const payload = await response.json()
      const models = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : []

      return models
        .map((model) => ({
          id: model.id,
          name: model.name || model.id
        }))
        .filter((model) => Boolean(model.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    const listOllamaModels = async (endpoint) => {
      const base = normalizeOrigin(endpoint, 'http:')
      const candidates = [`${base}/api/tags`, `${base}/v1/models`, `${base}/models`]

      let lastError = null
      for (const url of candidates) {
        try {
          const response = await fetch(url, {
            headers: {
              Accept: 'application/json'
            }
          })

          if (!response.ok) {
            lastError = new Error(`Ollama returned ${response.status}`)
            continue
          }

          const payload = await response.json()
          const models = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.models)
              ? payload.models
              : Array.isArray(payload?.data)
                ? payload.data
                : []

          return models
            .map((model) => ({
              id: typeof model === 'string' ? model : model.name || model.model || model.id,
              name: typeof model === 'string' ? model : model.name || model.model || model.id
            }))
            .filter((model) => Boolean(model.id))
            .sort((a, b) => a.name.localeCompare(b.name))
        } catch (error) {
          lastError = error
        }
      }

      throw lastError || new Error('Failed to load Ollama models')
    }

    if (!value) {
      return []
    }

    try {
      switch (providerToUse) {
        case 'openai':
          return await listOpenAIModels(value)
        case 'google':
          return await listGoogleModels(value)
        case 'ollama':
          return await listOllamaModels(value)
        case 'openrouter':
          return await listOpenRouterModels(value)
        default:
          return await listOllamaModels(value)
      }
    } catch (error) {
      console.error(`Failed to load ${providerToUse} models`, error)
      throw error
    }
  })

  activateInstalledPackages().catch((error) => {
    console.error('Failed to activate installed marketplace packages', error)
  })

  ipcMain.handle('dialog:openFolderNewWindow', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return null
    const folderPath = filePaths[0]

    // Create a new BrowserWindow for the new workspace
    const newWin = new BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    newWin.on('ready-to-show', () => newWin.show())

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await newWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      await newWin.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // send workspace path when ready
    newWin.webContents.once('did-finish-load', () => {
      newWin.webContents.send('workspace:open', folderPath)
    })

    return folderPath
  })

  ipcMain.handle('window:new', async () => {
    createWindow()
    return true
  })

  ipcMain.handle('zoom:in', (event) => {
    try {
      const wc = event.sender
      const win = BrowserWindow.fromWebContents(wc)
      if (!win) return false
      const cur = win.webContents.getZoomLevel()
      win.webContents.setZoomLevel(cur + 1)
      return true
    } catch (e) {
      console.error('zoom in failed', e)
      return false
    }
  })

  ipcMain.handle('zoom:out', (event) => {
    try {
      const wc = event.sender
      const win = BrowserWindow.fromWebContents(wc)
      if (!win) return false
      const cur = win.webContents.getZoomLevel()
      win.webContents.setZoomLevel(cur - 1)
      return true
    } catch (e) {
      console.error('zoom out failed', e)
      return false
    }
  })

  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  terminalSessions.forEach((_, sessionId) => {
    const session = terminalSessions.get(sessionId)
    if (!session) return

    try {
      session.terminal.kill()
    } catch (error) {
      console.error('Failed to dispose terminal session', error)
    }

    terminalSessions.delete(sessionId)
  })

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
