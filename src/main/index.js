import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { join, basename, dirname, resolve, relative, isAbsolute } from 'path'
import { homedir } from 'os'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs/promises'
import pty from 'node-pty'
import icon from '../../resources/1.png?asset'
import { registerMarketplaceHandlers, activateInstalledPackages } from './marketplace.js'
import { inferProviderFromConnection, normalizeEndpointOrigin, isUrl, normalizeUrl, urlHasPath, getKnownAnthropicModels, getKnownOpenCodeModels } from '../shared/providerUtils.js'

const terminalSessions = new Map()
const notebookSessions = new Map()
const appWindows = new Set()
const PYTHON_EXECUTABLE_NAMES =
  process.platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python', 'python3', 'pypy3']

const NOTEBOOK_WORKER_SCRIPT = String.raw`
import ast
import contextlib
import base64
import io
import json
import os
import sys
import traceback
import webbrowser

globals_ns = {'__name__': '__main__'}
try:
  sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
  sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')
  sys.stdin.reconfigure(encoding='utf-8', errors='replace')
except Exception:
  pass
os.environ.setdefault('MPLBACKEND', 'Agg')
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
webbrowser.open = lambda *args, **kwargs: False
webbrowser.open_new = lambda *args, **kwargs: False
webbrowser.open_new_tab = lambda *args, **kwargs: False

def sanitize_source(text):
  return ''.join(
    ch if ord(ch) < 0xD800 or ord(ch) > 0xDFFF else '\ufffd'
    for ch in str(text or '')
  )

try:
  import matplotlib
  matplotlib.use('Agg', force=True)
  import matplotlib.pyplot as plt
  import matplotlib.figure as _matplotlib_figure
  import matplotlib.backend_bases as _matplotlib_backend_bases
except Exception:
  matplotlib = None
  plt = None
  _matplotlib_figure = None
  _matplotlib_backend_bases = None

try:
  import plotly.io as _plotly_io
  import plotly.basedatatypes as _plotly_basedatatypes
except Exception:
  _plotly_io = None
  _plotly_basedatatypes = None

try:
  from PIL import Image as _PIL_Image
except Exception:
  _PIL_Image = None

try:
  import numpy as _np
except Exception:
  _np = None

try:
  import pandas as _pd
except Exception:
  _pd = None

try:
  import seaborn as _sns
except Exception:
  _sns = None

try:
  import plotly.express as _plotly_express
except Exception:
  _plotly_express = None

try:
  import cv2 as _cv2
except Exception:
  _cv2 = None

try:
  import bokeh.io as _bokeh_io
except Exception:
  _bokeh_io = None

captured_visual_ids = globals_ns.setdefault('__nb_captured_visual_ids__', set())

if _np is not None:
  globals_ns['np'] = _np
if _pd is not None:
  globals_ns['pd'] = _pd
if _sns is not None:
  globals_ns['sns'] = _sns
if plt is not None:
  globals_ns['plt'] = plt
if _plotly_express is not None:
  globals_ns['px'] = _plotly_express

def capture_pending_visuals():
  pending_outputs = globals_ns.setdefault('__nb_pending_outputs__', [])
  capture_matplotlib_figures(pending_outputs)
  if _plotly_basedatatypes is not None:
    for global_value in list(globals_ns.values()):
      capture_plotly_figure(global_value, pending_outputs)


def capture_object(obj, outputs):
  try:
    # Plotly objects
    if _plotly_basedatatypes is not None and isinstance(obj, _plotly_basedatatypes.BaseFigure):
      return capture_plotly_figure(obj, outputs)

    # Matplotlib Figure
    if _matplotlib_figure is not None and isinstance(obj, _matplotlib_figure.Figure):
      if id(obj) in captured_visual_ids:
        return True
      buffer = io.BytesIO()
      obj.savefig(buffer, format='png', bbox_inches='tight', facecolor=obj.get_facecolor())
      outputs.append({
        'output_type': 'display_data',
        'data': {'image/png': base64.b64encode(buffer.getvalue()).decode('ascii'), 'text/plain': ['<matplotlib figure>']},
        'metadata': {}
      })
      captured_visual_ids.add(id(obj))
      return True

    # PIL Image
    if _PIL_Image is not None:
      try:
        if isinstance(obj, _PIL_Image.Image):
          buffer = io.BytesIO()
          obj.save(buffer, format='PNG')
          outputs.append({
            'output_type': 'display_data',
            'data': {'image/png': base64.b64encode(buffer.getvalue()).decode('ascii'), 'text/plain': ['<PIL image>']},
            'metadata': {}
          })
          return True
      except Exception:
        pass

    # numpy arrays as images
    if _np is not None and isinstance(obj, _np.ndarray):
      if _PIL_Image is not None:
        try:
          pil = _PIL_Image.fromarray(obj)
          buffer = io.BytesIO()
          pil.save(buffer, format='PNG')
          outputs.append({
            'output_type': 'display_data',
            'data': {'image/png': base64.b64encode(buffer.getvalue()).decode('ascii'), 'text/plain': ['<ndarray image>']},
            'metadata': {}
          })
          return True
        except Exception:
          pass

    # OpenCV images
    if _cv2 is not None:
      try:
        import numpy as _maybe_np
        if _maybe_np is not None and isinstance(obj, _maybe_np.ndarray):
          if _PIL_Image is not None:
            try:
              pil = _PIL_Image.fromarray(obj[:, :, ::-1]) if obj.ndim == 3 else _PIL_Image.fromarray(obj)
              buffer = io.BytesIO()
              pil.save(buffer, format='PNG')
              outputs.append({
                'output_type': 'display_data',
                'data': {'image/png': base64.b64encode(buffer.getvalue()).decode('ascii'), 'text/plain': ['<cv2 image>']},
                'metadata': {}
              })
              return True
            except Exception:
              pass
      except Exception:
        pass

    # Rich repr HTML/Png/SVG
    if hasattr(obj, '_repr_html_'):
      try:
        html = obj._repr_html_()
        if html:
          outputs.append({'output_type': 'display_data', 'data': {'text/html': [html], 'text/plain': [repr(obj)]}, 'metadata': {}})
          return True
      except Exception:
        pass

    if hasattr(obj, '_repr_png_'):
      try:
        png = obj._repr_png_()
        if png:
          if isinstance(png, bytes):
            png = base64.b64encode(png).decode('ascii')
          outputs.append({'output_type': 'display_data', 'data': {'image/png': png, 'text/plain': [repr(obj)]}, 'metadata': {}})
          return True
      except Exception:
        pass

    if hasattr(obj, '_repr_svg_'):
      try:
        svg = obj._repr_svg_()
        if svg:
          outputs.append({'output_type': 'display_data', 'data': {'image/svg+xml': [svg], 'text/plain': [repr(obj)]}, 'metadata': {}})
          return True
      except Exception:
        pass

    return False
  except Exception:
    return False


def display(obj):
  pending = globals_ns.setdefault('__nb_pending_outputs__', [])
  captured = capture_object(obj, pending)
  if not captured:
    try:
      pending.append({'output_type': 'execute_result', 'data': {'text/plain': [repr(obj)]}, 'metadata': {}})
    except Exception:
      pass

globals_ns['display'] = display

# Monkeypatch common libraries' show functions to route into notebook outputs
try:
  if _PIL_Image is not None:
    def _pil_show(self, *a, **k):
      return capture_object(self, globals_ns.setdefault('__nb_pending_outputs__', []))

    _PIL_Image.Image.show = _pil_show
except Exception:
  pass

try:
  if _cv2 is not None:
    def _cv2_imshow(winname, mat, *a, **k):
      return capture_object(mat, globals_ns.setdefault('__nb_pending_outputs__', []))

    _cv2.imshow = _cv2_imshow
except Exception:
  pass

try:
  if _bokeh_io is not None:
    def _bokeh_show(obj, *a, **k):
      pending = globals_ns.setdefault('__nb_pending_outputs__', [])
      capture_object(obj, pending)
      return True

    _bokeh_io.show = _bokeh_show
except Exception:
  pass

if plt is not None:
  def _nb_show(*args, **kwargs):
    capture_pending_visuals()

  plt.show = _nb_show

  try:
    plt.ioff()
  except Exception:
    pass

if _matplotlib_figure is not None:
  def _nb_figure_show(self, *args, **kwargs):
    capture_pending_visuals()

  _matplotlib_figure.Figure.show = _nb_figure_show

if _matplotlib_backend_bases is not None:
  def _nb_manager_show(self, *args, **kwargs):
    capture_pending_visuals()

  _matplotlib_backend_bases.FigureManagerBase.show = _nb_manager_show

if _plotly_basedatatypes is not None:
  def _plotly_show(self, *args, **kwargs):
    pending = globals_ns.setdefault('__nb_pending_outputs__', [])
    capture_object(self, pending)

  _plotly_basedatatypes.BaseFigure.show = _plotly_show

if _plotly_io is not None:
  _plotly_io.renderers.default = 'json'
  _plotly_io.show = _plotly_show

def capture_matplotlib_figures(outputs):
  if plt is None:
    return

  for figure_number in list(plt.get_fignums()):
    figure = plt.figure(figure_number)
    if id(figure) in captured_visual_ids:
      continue

    buffer = io.BytesIO()
    figure.savefig(buffer, format='png', bbox_inches='tight', facecolor=figure.get_facecolor())
    outputs.append({
      'output_type': 'display_data',
      'data': {
        'image/png': base64.b64encode(buffer.getvalue()).decode('ascii'),
        'text/plain': ['<matplotlib figure>']
      },
      'metadata': {}
    })
    captured_visual_ids.add(id(figure))

  plt.close('all')

def capture_plotly_figure(figure, outputs):
  if _plotly_basedatatypes is None:
    return False

  if not isinstance(figure, _plotly_basedatatypes.BaseFigure):
    return False

  if id(figure) in captured_visual_ids:
    return True

  try:
    html = figure.to_html(full_html=False, include_plotlyjs='cdn')
  except Exception:
    html = '<div>Plotly figure could not be rendered.</div>'

  outputs.append({
    'output_type': 'display_data',
    'data': {
      'text/html': [html],
      'text/plain': ['<plotly figure>']
    },
    'metadata': {}
  })
  captured_visual_ids.add(id(figure))
  return True

def execute_cell(code):
  global captured_visual_ids
  stdout_buffer = io.StringIO()
  stderr_buffer = io.StringIO()
  payload = {'stdout': '', 'stderr': '', 'error': '', 'outputs': []}
  globals_ns['__nb_pending_outputs__'] = payload['outputs']
  captured_visual_ids = globals_ns['__nb_captured_visual_ids__'] = set()
  code = sanitize_source(code)

  try:
    module = ast.parse(code, filename='<notebook-cell>', mode='exec')
    body = module.body
    last_expr = None

    if body and isinstance(body[-1], ast.Expr):
      last_expr = ast.Expression(body[-1].value)
      body = body[:-1]

    with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
      if body:
        exec(
          compile(ast.Module(body=body, type_ignores=[]), '<notebook-cell>', 'exec'),
          globals_ns,
          globals_ns
        )

      if last_expr is not None:
        value = eval(compile(last_expr, '<notebook-cell>', 'eval'), globals_ns, globals_ns)
        if value is not None:
          if capture_plotly_figure(value, payload['outputs']):
            value = None
          elif plt is not None and hasattr(value, 'savefig') and hasattr(value, 'axes'):
            figure = getattr(value, 'figure', value)
            if id(figure) not in captured_visual_ids:
              buffer = io.BytesIO()
              figure.savefig(buffer, format='png', bbox_inches='tight', facecolor=figure.get_facecolor())
              payload['outputs'].append({
                'output_type': 'display_data',
                'data': {
                  'image/png': base64.b64encode(buffer.getvalue()).decode('ascii'),
                  'text/plain': ['<matplotlib figure>']
                },
                'metadata': {}
              })
              captured_visual_ids.add(id(figure))
              value = None

          if value is not None:
            if hasattr(value, '_repr_png_'):
              try:
                png_data = value._repr_png_()
              except Exception:
                png_data = None

              if png_data:
                if isinstance(png_data, bytes):
                  png_data = base64.b64encode(png_data).decode('ascii')
                payload['outputs'].append({
                  'output_type': 'display_data',
                  'data': {
                    'image/png': png_data,
                    'text/plain': ['<image>']
                  },
                  'metadata': {}
                })
                value = None

          if value is not None:
            print(repr(value))

      capture_pending_visuals()
  except Exception:
    payload['error'] = traceback.format_exc()

  payload['stdout'] = stdout_buffer.getvalue()
  payload['stderr'] = stderr_buffer.getvalue()
  globals_ns['__nb_pending_outputs__'] = []
  return payload

for raw_line in sys.stdin:
  raw_line = raw_line.strip()
  if not raw_line:
    continue

  try:
    message = json.loads(raw_line)
  except Exception:
    continue

  request_id = message.get('requestId')
  command = message.get('command')

  if command == 'execute':
    result = execute_cell(message.get('code', ''))
    sys.stdout.write(json.dumps({'requestId': request_id, 'ok': True, **result}, ensure_ascii=False) + '\n')
    sys.stdout.flush()
  elif command == 'shutdown':
    sys.stdout.write(json.dumps({'requestId': request_id, 'ok': True}, ensure_ascii=False) + '\n')
    sys.stdout.flush()
    break
`

function normalizePathKey(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

async function pathExists(targetPath) {
  try {
    const stats = await fs.stat(targetPath)
    return stats.isFile() || stats.isSymbolicLink()
  } catch {
    return false
  }
}

function buildPythonEnvironmentLabel(executablePath) {
  const parts = String(executablePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)

  const executableName = parts.at(-1) || basename(executablePath)
  const parentName = parts.at(-2) || ''
  const grandparentName = parts.at(-3) || ''

  if (/^(bin|scripts)$/i.test(parentName)) {
    return grandparentName || parentName || executableName
  }

  return parentName || executableName
}

async function addPythonCandidate(candidatePath, discovered, seen, source) {
  const resolvedPath = resolve(String(candidatePath || ''))
  const key = normalizePathKey(resolvedPath)

  if (!resolvedPath || seen.has(key)) {
    return
  }

  try {
    const stats = await fs.stat(resolvedPath)
    if (!stats.isFile() && !stats.isSymbolicLink()) {
      return
    }
  } catch {
    return
  }

  seen.add(key)
  discovered.push({
    label: buildPythonEnvironmentLabel(resolvedPath),
    path: resolvedPath,
    source
  })
}

async function inspectPythonLocation(rootPath, discovered, seen, source) {
  const normalizedRoot = resolve(String(rootPath || ''))
  if (!normalizedRoot) return

  try {
    const stats = await fs.stat(normalizedRoot)
    if (!stats.isDirectory()) {
      await addPythonCandidate(normalizedRoot, discovered, seen, source)
      return
    }
  } catch {
    return
  }

  const candidateRoots = [
    normalizedRoot,
    join(normalizedRoot, 'bin'),
    join(normalizedRoot, 'Scripts')
  ]
  for (const candidateRoot of candidateRoots) {
    for (const executableName of PYTHON_EXECUTABLE_NAMES) {
      await addPythonCandidate(join(candidateRoot, executableName), discovered, seen, source)
    }
  }

  let entries = []
  try {
    entries = await fs.readdir(normalizedRoot, { withFileTypes: true })
  } catch {
    entries = []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const childRoot = join(normalizedRoot, entry.name)
    for (const candidateRoot of [childRoot, join(childRoot, 'bin'), join(childRoot, 'Scripts')]) {
      for (const executableName of PYTHON_EXECUTABLE_NAMES) {
        await addPythonCandidate(join(candidateRoot, executableName), discovered, seen, source)
      }
    }
  }
}

async function collectPythonEnvironments(cwd) {
  const discovered = []
  const seen = new Set()
  const home = homedir()
  const roots = new Set()

  const addRoot = (rootPath) => {
    const value = String(rootPath || '').trim()
    if (!value) return
    roots.add(value)
  }

  String(process.env.PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach(addRoot)

  addRoot(cwd)
  addRoot(join(cwd, '.venv'))
  addRoot(join(cwd, 'venv'))
  addRoot(join(cwd, 'env'))

  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) addRoot(join(process.env.LOCALAPPDATA, 'Programs', 'Python'))
    if (process.env.PROGRAMFILES) addRoot(join(process.env.PROGRAMFILES, 'Python'))
    if (process.env['ProgramFiles(x86)']) addRoot(join(process.env['ProgramFiles(x86)'], 'Python'))
    addRoot(join(home, 'AppData', 'Local', 'Programs', 'Python'))
    addRoot(join(home, 'AppData', 'Roaming', 'Python'))
    addRoot(join(home, 'anaconda3'))
    addRoot(join(home, 'miniconda3'))
    addRoot(join(home, '.conda', 'envs'))
    addRoot(join(home, 'AppData', 'Local', 'conda', 'conda', 'envs'))
  } else {
    addRoot('/usr/bin')
    addRoot('/usr/local/bin')
    addRoot('/opt/homebrew/bin')
    addRoot(join(home, '.pyenv', 'versions'))
    addRoot(join(home, '.local', 'share', 'virtualenvs'))
    addRoot(join(home, 'miniconda3'))
    addRoot(join(home, 'anaconda3'))
    addRoot(join(home, 'miniforge3'))
    addRoot(join(home, 'mambaforge'))
  }

  for (const rootPath of roots) {
    await inspectPythonLocation(rootPath, discovered, seen, 'system')
  }

  return discovered.sort(
    (left, right) => left.label.localeCompare(right.label) || left.path.localeCompare(right.path)
  )
}

function buildNotebookSessionKey(notebookPath, interpreterPath) {
  return `${normalizePathKey(notebookPath)}::${normalizePathKey(interpreterPath || 'python')}`
}

function resolveNotebookInterpreter(interpreterPath) {
  const candidate = String(interpreterPath || '').trim()
  return candidate || 'python'
}

function disposeNotebookSession(sessionKey) {
  const session = notebookSessions.get(sessionKey)
  if (!session) return

  notebookSessions.delete(sessionKey)
  session.pending.forEach(({ reject }) => {
    reject(new Error('Notebook session stopped.'))
  })
  session.pending.clear()

  try {
    if (session.child && !session.child.killed) {
      session.child.kill()
    }
  } catch {
    // Ignore shutdown errors.
  }
}

function createNotebookSession(interpreterPath, sessionKey) {
  const executable = resolveNotebookInterpreter(interpreterPath)
  const child = spawn(executable, ['-u', '-c', NOTEBOOK_WORKER_SCRIPT], {
    env: {
      ...process.env,
      MPLBACKEND: 'Agg',
      PLOTLY_RENDERER: 'json',
      PYTHONUNBUFFERED: '1'
    },
    windowsHide: true,
    shell: false
  })

  const session = {
    child,
    buffer: '',
    pending: new Map()
  }
  // record which interpreter binary this session uses so we can clean it up
  session.interpreter = executable

  const flushPendingWithError = (error) => {
    session.pending.forEach(({ reject }) => reject(error))
    session.pending.clear()
  }

  child.stdout.on('data', (chunk) => {
    session.buffer += chunk.toString()

    let newlineIndex = session.buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const rawLine = session.buffer.slice(0, newlineIndex).trim()
      session.buffer = session.buffer.slice(newlineIndex + 1)
      newlineIndex = session.buffer.indexOf('\n')

      if (!rawLine) continue

      let message = null
      try {
        message = JSON.parse(rawLine)
      } catch (error) {
        console.error('Failed to parse notebook worker output', error, rawLine)
        continue
      }

      const pending = session.pending.get(String(message.requestId || ''))
      if (!pending) continue

      session.pending.delete(String(message.requestId || ''))
      pending.resolve(message)
    }
  })

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim()
    if (text) {
      console.error('Notebook worker stderr:', text)
    }
  })

  child.on('error', (error) => {
    console.error('Notebook worker process error', error)
    flushPendingWithError(error)
    notebookSessions.delete(sessionKey)
  })

  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`Notebook worker exited with code ${code}`)
    }
    if (signal) {
      console.error(`Notebook worker exited with signal ${signal}`)
    }
    flushPendingWithError(new Error('Notebook session ended.'))
    notebookSessions.delete(sessionKey)
  })

  notebookSessions.set(sessionKey, session)
  return session
}

async function executeNotebookCellWithSession(payload) {
  const notebookPath = String(payload?.notebookPath || '').trim()
  const code = String(payload?.code || '')
  const cwd = String(payload?.cwd || '').trim() || undefined
  const interpreterPath = String(payload?.interpreterPath || '').trim()

  if (!notebookPath) {
    throw new Error('Notebook path is required')
  }

  const resolvedInterpreter = (await pathExists(interpreterPath)) ? interpreterPath : 'python'
  const sessionKey = buildNotebookSessionKey(notebookPath, resolvedInterpreter)
  let session = notebookSessions.get(sessionKey)

  if (!session || session.child.killed) {
    session = createNotebookSession(resolvedInterpreter, sessionKey)
  }

  const requestId = randomUUID()
  const request = {
    requestId,
    command: 'execute',
    code,
    cwd
  }

  const result = await new Promise((resolve, reject) => {
    session.pending.set(requestId, { resolve, reject })

    const writeSucceeded = session.child.stdin.write(`${JSON.stringify(request)}\n`)
    if (!writeSucceeded) {
      session.child.stdin.once('drain', () => {})
    }
  })

  return {
    stdout: String(result?.stdout || ''),
    stderr: String(result?.stderr || ''),
    error: String(result?.error || ''),
    outputs: Array.isArray(result?.outputs) ? result.outputs : []
  }
}

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
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    appWindows.delete(mainWindow)
  })

  appWindows.add(mainWindow)

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

function buildWorkspaceUrl(folderPath) {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && rendererUrl) {
    const url = new URL(rendererUrl)
    url.searchParams.set('workspace', folderPath)
    return { type: 'url', value: url.toString() }
  }

  return { type: 'file', value: join(__dirname, '../renderer/index.html') }
}

async function loadWindowWithWorkspace(win, folderPath) {
  const target = buildWorkspaceUrl(folderPath)
  if (target.type === 'url') {
    await win.loadURL(target.value)
    return
  }

  await win.loadFile(target.value, { query: { workspace: folderPath } })
}

function createWorkspaceWindow(folderPath) {
  const win = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      additionalArguments: [`--workspacePath=${encodeURIComponent(folderPath)}`]
    }
  })

  win.on('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.on('closed', () => {
    appWindows.delete(win)
  })

  appWindows.add(win)
  return win
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

  ipcMain.handle('python:listEnvironments', async (_, cwd) => {
    try {
      const discovered = await collectPythonEnvironments(String(cwd || ''))
      return discovered
    } catch (error) {
      console.error('Failed to discover Python environments', error)
      return []
    }
  })

  ipcMain.handle('fs:readDir', async (_, dirPath) => {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true })
      return items
        .filter((item) => item.name !== '.sam') // Hide .sam/ directory from tree
        .map((item) => ({
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
      const resolvedTarget = resolve(String(targetPath || ''))

      // Dispose any notebook sessions using an interpreter inside the target path
      for (const sessionKey of Array.from(notebookSessions.keys())) {
        const session = notebookSessions.get(sessionKey)
        try {
          const interp = String(session?.interpreter || '')
          if (interp) {
            const rel = relative(resolvedTarget, resolve(interp))
            if (rel && !rel.startsWith('..')) {
              disposeNotebookSession(sessionKey)
            }
          }
        } catch (e) {
          // ignore
        }
      }

      // Dispose any terminal sessions whose cwd is inside the target path
      for (const sessionId of Array.from(terminalSessions.keys())) {
        const session = terminalSessions.get(sessionId)
        try {
          const sessionCwd = String(session?.cwd || '')
          if (sessionCwd) {
            const rel = relative(resolvedTarget, resolve(sessionCwd))
            if (rel && !rel.startsWith('..')) {
              try {
                disposeTerminalSession(sessionId)
              } catch (e) {
                // ignore
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }

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
          let contentToWrite = String(operation?.content ?? '')

          // For .ipynb files, wrap raw code in proper notebook JSON if needed
          if (targetPath.toLowerCase().endsWith('.ipynb')) {
            // Check if content is already valid notebook JSON
            let isAlreadyNotebook = false
            try {
              const parsed = JSON.parse(contentToWrite)
              if (parsed.cells && Array.isArray(parsed.cells) && parsed.nbformat) {
                isAlreadyNotebook = true
              }
            } catch { /* not JSON */ }

            if (!isAlreadyNotebook) {
              // Wrap the raw code as a single code cell in a notebook
              const notebook = {
                cells: [{
                  cell_type: 'code',
                  metadata: {},
                  execution_count: null,
                  source: contentToWrite,
                  outputs: []
                }],
                metadata: {
                  kernelspec: {
                    display_name: 'Python 3',
                    language: 'python',
                    name: 'python3'
                  },
                  language_info: { name: 'python' }
                },
                nbformat: 4,
                nbformat_minor: 5
              }
              contentToWrite = JSON.stringify(notebook, null, 2)
            }
          }

          await fs.writeFile(targetPath, contentToWrite, 'utf-8')
          // Verify the file was actually written
          const written = await fs.readFile(targetPath, 'utf-8')
          if (written !== contentToWrite) {
            failed.push({ action, path: rawPath, reason: 'File verification failed — written content does not match.' })
            continue
          }
          applied.push({ action: 'write', path: targetPath, size: Buffer.byteLength(contentToWrite, 'utf-8') })
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

        if (action === 'read') {
          try {
            const stats = await fs.stat(targetPath)
            if (stats.isDirectory()) {
              const entries = await fs.readdir(targetPath, { withFileTypes: true })
              const items = entries.map((entry) => ({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                path: join(targetPath, entry.name)
              }))
              applied.push({ action: 'read', path: targetPath, content: null, directory: items })
              continue
            }
            const maxBytes = 200 * 1024 // 200KB max
            if (stats.size > maxBytes) {
              const handle = await fs.open(targetPath, 'r')
              try {
                const buffer = Buffer.alloc(maxBytes)
                const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
                applied.push({
                  action: 'read',
                  path: targetPath,
                  content: buffer.toString('utf-8', 0, bytesRead),
                  truncated: true,
                  size: stats.size
                })
              } finally {
                await handle.close()
              }
              continue
            }
            const content = await fs.readFile(targetPath, 'utf-8')
            applied.push({ action: 'read', path: targetPath, content, truncated: false, size: stats.size })
            continue
          } catch (readErr) {
            failed.push({ action, path: rawPath, reason: `Failed to read: ${readErr.message}` })
            continue
          }
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

    // keep cwd for potential cleanup when deleting folders
    terminalSessions.set(sessionId, { terminal, cwd })
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

  ipcMain.handle('notebook:executeCell', async (_, payload) => {
    return await executeNotebookCellWithSession(payload)
  })

  ipcMain.handle('shell:openExternal', async (_, targetPath) => {
    try {
      const target = String(targetPath || '').trim()
      const url = /^https?:\/\//i.test(target) ? target : pathToFileURL(target).toString()
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
    const providerToUse = selectedProvider === 'auto' ? inferProviderFromConnection(value) : selectedProvider

    const listOpenAIModels = async (key) => {
      const endpoint = isUrl(key) ? normalizeUrl(key) : 'https://api.openai.com'
      let url = 'https://api.openai.com/v1/models'
      if (isUrl(key)) {
        if (endpoint.endsWith('/models')) {
          url = endpoint
        } else if (urlHasPath(endpoint, '/v1')) {
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
        } else if (urlHasPath(endpoint, '/v1')) {
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
        } else if (urlHasPath(endpoint, '/api/v1')) {
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
      const base = normalizeEndpointOrigin(endpoint, 'http:')
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

    const listAnthropicModels = async (key) => {
      // Anthropic doesn't expose a models listing API
      return getKnownAnthropicModels()
    }

    const listOpenCodeModels = async (endpoint) => {
      const base = normalizeEndpointOrigin(endpoint || 'https://api.opencode.ai', 'https:')
      // Try fetching known models endpoint
      const candidates = [`${base}/v1/models`, `${base}/models`]
      let lastError = null
      for (const url of candidates) {
        try {
          const response = await fetch(url, {
            headers: { Accept: 'application/json' }
          })
          if (!response.ok) {
            lastError = new Error(`OpenCode returned ${response.status}`)
            continue
          }
          const payload = await response.json()
          const models = Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.models)
              ? payload.models
              : Array.isArray(payload)
                ? payload
                : []
          return models
            .map((model) => ({
              id: typeof model === 'string' ? model : model.id || model.name,
              name: typeof model === 'string' ? model : model.name || model.id
            }))
            .filter((model) => Boolean(model.id))
            .sort((a, b) => a.name.localeCompare(b.name))
        } catch (error) {
          lastError = error
        }
      }
      // Fallback to known models
      return getKnownOpenCodeModels()
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
        case 'anthropic':
          return await listAnthropicModels(value)
        case 'opencode':
          return await listOpenCodeModels(value)
        default:
          return await listOllamaModels(value)
      }
    } catch (error) {
      const msg = String(error?.message || error)
      const friendly = `Could not load ${providerToUse} models from '${value}': ${msg}`
      console.error(friendly, error)
      // Throw a new Error with a friendly, contextual message so renderer receives clearer diagnostics
      throw new Error(friendly)
    }
  })

  activateInstalledPackages().catch((error) => {
    console.error('Failed to activate installed marketplace packages', error)
  })

  ipcMain.handle('dialog:openFolderNewWindow', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return null
    const folderPath = filePaths[0]

    const newWin = createWorkspaceWindow(folderPath)

    newWin.on('ready-to-show', () => newWin.show())

    await loadWindowWithWorkspace(newWin, folderPath)

    return folderPath
  })

  ipcMain.handle('window:newWithFolder', async (_, folderPath) => {
    try {
      if (!folderPath) return null

      const newWin = createWorkspaceWindow(folderPath)

      newWin.on('ready-to-show', () => newWin.show())

      await loadWindowWithWorkspace(newWin, folderPath)

      return folderPath
    } catch (e) {
      console.error('window:newWithFolder failed', e)
      return null
    }
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

  // === .sam/ directory: per-folder agent history and configuration ===
  const SAM_DIR_NAME = '.sam'

  ipcMain.handle('sam:ensureDir', async (_, folderPath) => {
    const base = String(folderPath || '').trim()
    if (!base) return null
    const samPath = join(resolve(base), SAM_DIR_NAME)
    try {
      await fs.mkdir(samPath, { recursive: true })
      console.log('[.sam MAIN] ensured dir:', samPath)
      return samPath
    } catch (e) {
      console.error('[.sam MAIN] ensureDir error:', e.message)
      return null
    }
  })

  ipcMain.handle('sam:loadConversations', async (_, folderPath) => {
    const base = String(folderPath || '').trim()
    if (!base) return null
    const filePath = join(resolve(base), SAM_DIR_NAME, 'conversations.json')
    console.log('[.sam MAIN] loading from:', filePath)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      console.log('[.sam MAIN] loaded OK')
      return JSON.parse(raw)
    } catch {
      console.log('[.sam MAIN] no saved conversations')
      return null
    }
  })

  ipcMain.handle('sam:saveConversations', async (_, folderPath, data) => {
    const base = String(folderPath || '').trim()
    if (!base) return false
    const samPath = join(resolve(base), SAM_DIR_NAME)
    const filePath = join(samPath, 'conversations.json')
    console.log('[.sam MAIN] saving to:', filePath, 'messages:', data?.length)
    try {
      await fs.mkdir(samPath, { recursive: true })
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
      console.log('[.sam MAIN] saved OK')
      return true
    } catch (e) {
      console.error('[.sam MAIN] save error:', e.message)
      return false
    }
  })

  ipcMain.handle('sam:loadSettings', async (_, folderPath) => {
    const base = String(folderPath || '').trim()
    if (!base) return null
    const filePath = join(resolve(base), SAM_DIR_NAME, 'settings.json')
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('sam:saveSettings', async (_, folderPath, data) => {
    const base = String(folderPath || '').trim()
    if (!base) return false
    const samPath = join(resolve(base), SAM_DIR_NAME)
    const filePath = join(samPath, 'settings.json')
    try {
      await fs.mkdir(samPath, { recursive: true })
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
      return true
    } catch {
      return false
    }
  })

  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('before-quit', () => {
    for (const sessionKey of notebookSessions.keys()) {
      disposeNotebookSession(sessionKey)
    }
  })

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
