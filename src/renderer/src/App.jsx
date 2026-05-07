/* eslint-disable */
import { useEffect, useRef, useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import {
  Bot,
  Binary,
  ChevronUp,
  ChevronRight,
  FileArchive,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileSymlink,
  FileTerminal,
  FileText,
  FileVideoCamera,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  Store,
  PanelLeft,
  PanelLeftClose,
  X
} from 'lucide-react'
import TerminalDock from './TerminalDock'

const STORAGE_KEYS = {
  apiKey: 'samcode:apiKey',
  apiProvider: 'samcode:apiProvider',
  selectedModel: 'samcode:selectedModel',
  appearanceMode: 'samcode:appearanceMode',
  autoSaveEnabled: 'samcode:autoSaveEnabled',
  recentFolders: 'samcode:recentFolders',
  preferredModels: 'samcode:preferredModels',
  installedPackages: 'samcode:installedPackages',
  mode: 'samcode:mode'
}

const DEFAULT_PREFERRED_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']

function App() {
  const [settingsSection, setSettingsSection] = useState('preferences')
  const [showFileMenu, setShowFileMenu] = useState(false)
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [showAgentModelMenu, setShowAgentModelMenu] = useState(false)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showHelpMenu, setShowHelpMenu] = useState(false)
  const [marketplaceOpen, setMarketplaceOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [appearanceMode, setAppearanceMode] = useState(
    () => localStorage.getItem(STORAGE_KEYS.appearanceMode) || 'dark'
  )
  const [preferredModels, setPreferredModels] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.preferredModels)
      const parsed = raw ? JSON.parse(raw) : DEFAULT_PREFERRED_MODELS
      return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_PREFERRED_MODELS
    } catch {
      return DEFAULT_PREFERRED_MODELS
    }
  })
  const [installedPackages, setInstalledPackages] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.installedPackages)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? Array.from(new Set(parsed.filter(Boolean))) : []
    } catch {
      return []
    }
  })

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rootFolder, setRootFolder] = useState('')
  const [tree, setTree] = useState({})
  const [expanded, setExpanded] = useState({})
  const [activePath, setActivePath] = useState('')
  const [tabs, setTabs] = useState([])
  const [saving, setSaving] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.autoSaveEnabled) === 'true'
  )
  const [recentFolders, setRecentFolders] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.recentFolders)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [showMoreRecent, setShowMoreRecent] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const generationAbortRef = useRef(null)
  const editorMainRef = useRef(null)
  const [code, setCode] = useState('')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.apiKey) || '')
  const [apiProvider, setApiProvider] = useState(
    () => localStorage.getItem(STORAGE_KEYS.apiProvider) || 'auto'
  )
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(STORAGE_KEYS.selectedModel) || ''
  )
  const [mode, setModeState] = useState(() => localStorage.getItem(STORAGE_KEYS.mode) || 'chat')
  const setMode = (nextMode) => {
    setModeState(nextMode)
    localStorage.setItem(STORAGE_KEYS.mode, nextMode)
  }
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [availableModels, setAvailableModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingAgentProposal, setPendingAgentProposal] = useState(null)
  const [pendingAgentStepIndex, setPendingAgentStepIndex] = useState(0)
  const [approvalBusy, setApprovalBusy] = useState(false)
  useEffect(() => {
    // Register/unregister Java helpers only when the 'java-language' extension is installed
    const isInstalled = Array.isArray(installedPackages)
      ? installedPackages.includes('java-language')
      : false

    try {
      if (!monaco) return

      // dispose previously registered helpers if extension was removed
      if (!isInstalled && globalThis.__samcode_java_monaco_disposables) {
        try {
          for (const d of globalThis.__samcode_java_monaco_disposables) {
            try {
              d.dispose()
            } catch {}
          }
        } finally {
          globalThis.__samcode_java_monaco_disposables = undefined
          globalThis.__samcode_java_monaco_registered = false
        }
      }

      if (isInstalled && !globalThis.__samcode_java_monaco_registered) {
        const disposables = []

        const completion = monaco.languages.registerCompletionItemProvider('java', {
          provideCompletionItems: async (model, position) => {
            const lineContent = model
              .getLineContent(position.lineNumber)
              .substring(0, position.column)
            const snippets = [
              {
                label: 'main',
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: ['public static void main(String[] args) {', '\t$0', '}'].join('\n'),
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Main method'
              },
              {
                label: 'sysout',
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: 'System.out.println($1);',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'System.out.println()'
              },
              {
                label: 'fori',
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: ['for (int i = 0; i < ${1:count}; i++) {', '\t$0', '}'].join('\n'),
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Classic for-loop'
              }
            ]

            // Add AI-powered suggestions if API is configured
            const suggestions = [...snippets]
            if (selectedModel && apiKey && lineContent.trim().length > 0) {
              try {
                // Get context: current file and surrounding lines
                const currentCode = model.getValue()
                const contextStart = Math.max(0, position.lineNumber - 5)
                const contextEnd = Math.min(model.getLineCount(), position.lineNumber + 3)
                const contextLines = []
                for (let i = contextStart; i <= contextEnd; i++) {
                  contextLines.push(model.getLineContent(i))
                }
                const context = contextLines.join('\n')

                // Call AI API for code completion
                const effectiveProvider = String(apiProvider || 'auto').trim()
                const key = String(apiKey || '').trim()

                if (effectiveProvider === 'auto' || effectiveProvider === 'openrouter') {
                  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${key}`
                    },
                    body: JSON.stringify({
                      model: selectedModel,
                      messages: [
                        {
                          role: 'system',
                          content:
                            'You are a Java code completion assistant. Provide only code suggestions, no explanations.'
                        },
                        {
                          role: 'user',
                          content: `Complete this Java code:\n\n${context}\n\nProvide only the next line(s) of code to complete the current line.`
                        }
                      ],
                      max_tokens: 100,
                      temperature: 0.3
                    })
                  })

                  if (response.ok) {
                    const data = await response.json()
                    const aiSuggestion = data.choices?.[0]?.message?.content?.trim()
                    if (aiSuggestion && aiSuggestion.length < 150) {
                      suggestions.push({
                        label: 'AI Suggest',
                        kind: monaco.languages.CompletionItemKind.Text,
                        insertText: aiSuggestion,
                        documentation: 'AI-powered suggestion'
                      })
                    }
                  }
                }
              } catch (e) {
                console.log('AI completion error:', e.message)
              }
            }

            return { suggestions }
          }
        })
        disposables.push(completion)

        const formatter = monaco.languages.registerDocumentFormattingEditProvider('java', {
          provideDocumentFormattingEdits: (model /*, options, token */) => {
            const full = model.getValue()
            // Proper Java formatting:
            // 1. Normalize line endings
            let formatted = full.replace(/\r\n/g, '\n')
            // 2. Trim trailing whitespace from each line
            formatted = formatted
              .split('\n')
              .map((line) => line.replace(/\s+$/g, ''))
              .join('\n')
            // 3. Fix spacing around braces and operators
            formatted = formatted
              .replace(/\s*{\s*/g, ' {\n')
              .replace(/}\s*/g, '}\n')
              .replace(/;\s*/g, ';\n')
            // 4. Collapse multiple empty lines into single newlines
            formatted = formatted.replace(/\n\n+/g, '\n\n')
            // 5. Remove trailing newlines and add single newline at EOF
            formatted = formatted.trim() + '\n'
            // 6. Fix indentation (basic: 4 spaces per level)
            const lines = formatted.split('\n')
            let indentLevel = 0
            formatted = lines
              .map((line) => {
                const trimmed = line.trim()
                if (!trimmed) return ''
                // Decrease indent for closing braces
                if (trimmed.startsWith('}')) indentLevel = Math.max(0, indentLevel - 1)
                const indented = ' '.repeat(indentLevel * 4) + trimmed
                // Increase indent after opening braces
                if (trimmed.endsWith('{') || trimmed.endsWith('{\\n')) indentLevel++
                return indented
              })
              .join('\n')

            return [
              {
                range: model.getFullModelRange(),
                text: formatted
              }
            ]
          }
        })
        disposables.push(formatter)

        globalThis.__samcode_java_monaco_disposables = disposables
        globalThis.__samcode_java_monaco_registered = true
      }
    } catch (e) {
      console.error('Failed to register/unregister java helpers', e)
    }
  }, [installedPackages, monaco])
  const [activeMenuIndex, setActiveMenuIndex] = useState(null)
  const [runningNotebookCellIndex, setRunningNotebookCellIndex] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState('')
  const [selectedExplorerPath, setSelectedExplorerPath] = useState('')
  const [selectedPaths, setSelectedPaths] = useState(new Set())
  const [draggedItems, setDraggedItems] = useState(null)
  const [, setMenuForPath] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState('')
  const [deleteConfirmChoice, setDeleteConfirmChoice] = useState('delete')
  const [, setShowRenameModal] = useState(false)
  const [renameTarget, setRenameTarget] = useState('')
  const [renameNewName, setRenameNewName] = useState('')
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0)
  const [status, setStatus] = useState('')
  const [toasts, setToasts] = useState([])
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalCommand, setTerminalCommand] = useState('')
  const [showAgentPanel, setShowAgentPanel] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [rightWidth, setRightWidth] = useState(360)
  const [terminalHeight, setTerminalHeight] = useState(320)
  const [activeNotebookCellIndex, setActiveNotebookCellIndex] = useState(null)
  const [venvPath, setVenvPath] = useState('')
  const [notebookCellHeights, setNotebookCellHeights] = useState({})
  const [showPythonEnvironmentMenu, setShowPythonEnvironmentMenu] = useState(false)
  const [pythonEnvironments, setPythonEnvironments] = useState([])
  const [pythonEnvironmentsLoading, setPythonEnvironmentsLoading] = useState(false)
  const [pythonEnvironmentsError, setPythonEnvironmentsError] = useState('')

  const layoutMetricsRef = useRef({ sidebarWidth: 280, rightWidth: 360, terminalHeight: 320 })
  const notebookCellRefs = useRef([])
  const notebookEditorRefs = useRef([])
  const suppressNextNotebookScroll = useRef(false)
  const codeRef = useRef(code)
  const dragRef = useRef(null)
  const toastTimersRef = useRef(new Map())

  const hasApi = () => typeof window !== 'undefined' && window.api

  const isNotebookFile = (filePath) =>
    String(filePath || '')
      .toLowerCase()
      .endsWith('.ipynb')

  const isHtmlFile = (filePath) => {
    const lower = String(filePath || '').toLowerCase()
    return lower.endsWith('.html') || lower.endsWith('.htm')
  }

  const normalizeNotebookSource = (source) => {
    const text = String(source || '')
    const lines = text.split('\n')
    return lines.map((line, index) => (index < lines.length - 1 ? `${line}\n` : line))
  }

  const sanitizeNotebookExecutionText = (source) =>
    String(source || '').replace(/[\uD800-\uDFFF]/g, '�')

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const extractAgentPayload = (responseText) => {
    if (!responseText) return null

    const text = String(responseText).trim()

    // Try to extract JSON from code blocks (```json ... ```)
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    let jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : text

    // Try to find JSON object that starts with { and ends with }
    const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (jsonObjectMatch) {
      jsonStr = jsonObjectMatch[0]
    }

    try {
      const payload = JSON.parse(jsonStr)
      const operations = Array.isArray(payload.operations) ? payload.operations : []
      const summary = String(payload.summary || '').trim() || 'Agent operation completed.'

      return {
        operations,
        summary
      }
    } catch (e) {
      return null
    }
  }

  const safeParseNotebook = (jsonStr) => {
    try {
      const parsed = JSON.parse(String(jsonStr || '{}'))
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
      return { cells: [] }
    } catch (e) {
      return { cells: [] }
    }
  }

  const renderMarkdownPreviewHtml = (source) => {
    const lines = String(source || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
    const html = []
    let listMode = false

    const closeList = () => {
      if (listMode) {
        html.push('</ul>')
        listMode = false
      }
    }

    const formatInline = (text) =>
      escapeHtml(text)
        .replace(
          /`([^`]+)`/g,
          '<code class="rounded bg-white/10 px-1 py-0.5 text-[11px] text-cyan-100">$1</code>'
        )
        .replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" target="_blank" rel="noreferrer" class="text-cyan-300 underline">$1</a>'
        )
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')

    lines.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        closeList()
        html.push('<p class="my-2">&nbsp;</p>')
        return
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        closeList()
        const level = Math.min(headingMatch[1].length, 6)
        html.push(
          `<h${level} class="mt-3 mb-2 font-semibold text-white">${formatInline(headingMatch[2])}</h${level}>`
        )
        return
      }

      if (/^[-*+]\s+/.test(trimmed)) {
        if (!listMode) {
          html.push('<ul class="my-2 list-disc space-y-1 pl-5 text-gray-100">')
          listMode = true
        }
        html.push(`<li>${formatInline(trimmed.replace(/^[-*+]\s+/, ''))}</li>`)
        return
      }

      closeList()
      html.push(`<p class="my-2 leading-6 text-gray-100">${formatInline(trimmed)}</p>`)
    })

    closeList()
    return html.join('')
  }

  const renderMarkdownNotebookDocument = (sourceHtml) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #1f2937;
        color: #f3f4f6;
        font-family: Inter, system-ui, sans-serif;
      }

      body {
        padding: 14px 16px 18px;
        line-height: 1.65;
        font-size: 14px;
      }

      .prose {
        max-width: none;
      }

      h1, h2, h3, h4, h5, h6 {
        color: #ffffff;
      }

      a {
        color: #67e8f9;
      }

      code {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 0.1rem 0.25rem;
        color: #ffffff;
      }

      p, li {
        color: #f3f4f6;
      }
    </style>
  </head>
  <body>
    <div class="prose prose-invert max-w-none text-sm">${sourceHtml}</div>
  </body>
</html>
`

  const getNotebookDisplaySource = (cell) =>
    Array.isArray(cell?.source) ? cell.source.join('') : String(cell?.source || '')

  const getNotebookEditorHeight = (cell, content, fallback = 180) => {
    const baseLines = String(content || '').split('\n').length
    const lineHeight = cell?.cell_type === 'code' ? 20 : 19
    const padding = cell?.cell_type === 'code' ? 92 : 84
    const minimum = cell?.cell_type === 'code' ? 180 : 160
    return Math.max(minimum, baseLines * lineHeight + padding, fallback)
  }

  useEffect(() => {
    codeRef.current = code
  }, [code])

  const formatNotebookOutput = (output) => {
    // Handle stream outputs (stdout/stderr)
    if (output.output_type === 'stream') {
      return Array.isArray(output.text) ? output.text.join('') : String(output.text || '')
    }
    // Handle display_data (images, html, etc.) - show MIME type info
    if (output.output_type === 'display_data') {
      const mimeTypes = Object.keys(output.data || {})
      if (mimeTypes.length === 0) return '(no data)'
      return `[Display: ${mimeTypes.join(', ')}]`
    }
    // Handle error outputs
    if (output.output_type === 'error') {
      const traceback = Array.isArray(output.traceback)
        ? output.traceback.join('\n')
        : String(output.traceback || '')
      return `${output.ename || 'Error'}: ${output.evalue || ''}\n${traceback}`
    }
    // Handle execute_result
    if (output.output_type === 'execute_result') {
      const mimeTypes = Object.keys(output.data || {})
      if (mimeTypes.includes('text/plain')) {
        return Array.isArray(output.data['text/plain'])
          ? output.data['text/plain'].join('')
          : String(output.data['text/plain'] || '')
      }
      return `[Result: ${mimeTypes.join(', ')}]`
    }
    // Fallback
    return JSON.stringify(output, null, 2)
  }

  const renderNotebookDisplayOutput = (output, key) => {
    const pngData = Array.isArray(output?.data?.['image/png'])
      ? output.data['image/png'].join('')
      : String(output?.data?.['image/png'] || '')
    if (pngData) {
      return (
        <img
          key={key}
          src={`data:image/png;base64,${pngData}`}
          alt="Notebook output"
          className="max-h-130 w-auto max-w-full rounded border border-white/10 bg-black/40"
        />
      )
    }

    const htmlData = Array.isArray(output?.data?.['text/html'])
      ? output.data['text/html'].join('')
      : String(output?.data?.['text/html'] || '')
    if (htmlData) {
      return (
        <iframe
          key={key}
          title="Notebook visual output"
          className="h-130 w-full rounded border border-white/10 bg-[#111827]"
          sandbox="allow-scripts allow-same-origin"
          srcDoc={htmlData}
        />
      )
    }

    return (
      <pre key={key} className="whitespace-pre-wrap text-xs">
        {formatNotebookOutput(output)}
      </pre>
    )
  }

  const updateNotebookDocument = (transform, successMessage) => {
    if (!activePath || !isNotebookFile(activePath)) {
      pushActivity('warning', 'Open a notebook before using notebook tools.')
      return false
    }

    try {
      const notebook = safeParseNotebook(codeRef.current)
      if (!notebook || !Array.isArray(notebook.cells)) {
        throw new Error('Invalid notebook JSON')
      }

      const nextNotebook = transform(notebook)
      const nextNotebookText = JSON.stringify(nextNotebook, null, 2)
      codeRef.current = nextNotebookText
      setCode(nextNotebookText)
      setStatus(successMessage)
      pushActivity('success', successMessage)
      return true
    } catch (error) {
      setStatus(`${basenameFromPath(activePath)} does not contain valid notebook JSON.`)
      pushActivity('error', `Notebook action failed: ${error.message}`)
      return false
    }
  }

  const getNotebookCells = useCallback(() => {
    const notebook = safeParseNotebook(code)
    return Array.isArray(notebook.cells) ? notebook.cells : null
  }, [code])

  const getPythonRunnerCommand = () => {
    const pythonExecutable = String(venvPath || '').trim()
    if (!pythonExecutable) {
      return 'python -'
    }

    return `& "${pythonExecutable.replace(/"/g, '\\"')}" -`
  }

  const insertNotebookCell = (cellType, source, successMessage) => {
    let insertedIndex = null
    const succeeded = updateNotebookDocument((notebook) => {
      const selectedIndex =
        activeNotebookCellIndex != null && activeNotebookCellIndex >= 0
          ? Math.min(activeNotebookCellIndex + 1, notebook.cells.length)
          : notebook.cells.length

      const nextCell = {
        cell_type: cellType,
        metadata: {
          language: cellType === 'code' ? 'python' : 'markdown'
        },
        source: normalizeNotebookSource(source)
      }

      if (cellType === 'code') {
        nextCell.execution_count = null
        nextCell.outputs = []
      }

      insertedIndex = selectedIndex

      return {
        ...notebook,
        cells: [
          ...notebook.cells.slice(0, selectedIndex),
          nextCell,
          ...notebook.cells.slice(selectedIndex)
        ]
      }
    }, successMessage)

    if (succeeded && insertedIndex != null) {
      setActiveNotebookCellIndex(insertedIndex)
    }

    return succeeded
  }

  const runNotebookCell = useCallback(
    async (index) => {
      if (!activePath || !isNotebookFile(activePath)) {
        pushActivity('warning', 'Open a notebook before running cells.')
        return false
      }

      const cells = getNotebookCells()
      const cell = Array.isArray(cells) ? cells[index] : null
      if (!cell || !['code', 'markdown'].includes(cell.cell_type)) {
        pushActivity('warning', 'Select a notebook cell to run.')
        return false
      }

      const script = (
        Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '')
      ).trim()
      if (cell.cell_type === 'code' && !script) {
        pushActivity('warning', 'The selected code cell is empty.')
        return false
      }

      const sanitizedScript = sanitizeNotebookExecutionText(script)

      setRunningNotebookCellIndex(index)
      setStatus(`Running cell ${index + 1}...`)

      try {
        let outputs = []
        if (cell.cell_type === 'markdown') {
          const sourceText = getNotebookDisplaySource(cell)
          const renderedHtml = renderMarkdownNotebookDocument(renderMarkdownPreviewHtml(sourceText))
          outputs = [
            {
              output_type: 'display_data',
              data: {
                'text/plain': [sourceText],
                'text/html': [renderedHtml],
                'text/markdown': [sourceText]
              },
              metadata: {}
            }
          ]
        } else {
          const result = await window.api.executeNotebookCell({
            notebookPath: activePath,
            code: sanitizedScript,
            cwd: rootFolder || dirnameFromPath(activePath),
            interpreterPath: venvPath
          })

          outputs = Array.isArray(result?.outputs) ? result.outputs.slice() : []

          if (result?.stdout) {
            outputs.push({ output_type: 'stream', name: 'stdout', text: [String(result.stdout)] })
          }
          if (result?.stderr) {
            outputs.push({
              output_type: 'stream',
              name: 'stderr',
              text: [String(result.stderr)]
            })
          }
          if (result?.error) {
            const tracebackLines = String(result.error).split('\n').filter(Boolean)
            outputs.push({
              output_type: 'error',
              ename: 'ExecutionError',
              evalue: tracebackLines.at(-1) || 'Notebook execution failed',
              traceback: tracebackLines
            })
          }
        }

        updateNotebookDocument(
          (notebook) => {
            const next = { ...notebook }
            next.cells = next.cells.map((currentCell, currentIndex) =>
              currentIndex === index
                ? {
                    ...currentCell,
                    outputs,
                    execution_count:
                      currentCell.cell_type === 'code'
                        ? (currentCell.execution_count || 0) + 1
                        : (currentCell.execution_count ?? null)
                  }
                : currentCell
            )
            return next
          },
          `Ran cell ${index + 1}`
        )

        setStatus(
          cell.cell_type === 'markdown'
            ? `Rendered markdown cell ${index + 1}.`
            : `Cell ${index + 1} finished.`
        )
        return true
      } catch (error) {
        setStatus('Cell run failed')
        pushActivity('error', String(error?.message || error))
        return false
      } finally {
        setRunningNotebookCellIndex((current) => (current === index ? null : current))
      }
    },
    [
      activePath,
      venvPath,
      rootFolder,
      getNotebookCells,
      sanitizeNotebookExecutionText,
      isNotebookFile,
      updateNotebookDocument
    ]
  )

  const runAllNotebookCells = async () => {
    const cells = getNotebookCells()
    if (!cells) {
      pushActivity('warning', 'Open a valid notebook first.')
      return false
    }

    const runnableIndices = []
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index]
      if (cell && ['code', 'markdown'].includes(cell.cell_type)) {
        runnableIndices.push(index)
      }
    }

    if (runnableIndices.length === 0) {
      pushActivity('warning', 'This notebook has no runnable cells to run.')
      return false
    }

    for (const index of runnableIndices) {
      // run sequentially to preserve order
      // eslint-disable-next-line no-await-in-loop
      await runNotebookCell(index)
    }

    return true
  }

  const clearNotebookOutputs = () => {
    return updateNotebookDocument(
      (notebook) => ({
        ...notebook,
        cells: notebook.cells.map((cell) => {
          if (cell?.cell_type !== 'code') {
            return cell
          }

          return {
            ...cell,
            outputs: [],
            execution_count: null
          }
        })
      }),
      'Cleared notebook outputs.'
    )
  }

  const deleteNotebookCell = (index) => {
    const succeeded = updateNotebookDocument(
      (notebook) => ({
        ...notebook,
        cells: notebook.cells.filter((_, currentIndex) => currentIndex !== index)
      }),
      `Deleted cell ${index + 1}`
    )

    if (succeeded) {
      setActiveNotebookCellIndex((current) => {
        if (current == null) return null
        if (current > index) return current - 1
        if (current === index) return Math.max(0, index - 1)
        return current
      })
    }

    return succeeded
  }

  const createPythonVirtualEnv = async () => {
    if (!activePath) {
      pushActivity('warning', 'Open a project folder before creating a virtual env.')
      return false
    }

    const cwd = rootFolder || dirnameFromPath(activePath)
    const selectedPythonExecutable = String(venvPath || '').trim()
    setStatus('Creating Python virtual env...')

    try {
      const command = selectedPythonExecutable
        ? `& "${selectedPythonExecutable.replace(/"/g, '\\"')}" -m venv .venv`
        : 'python -m venv .venv'

      const result = await window.api.runCommand({
        type: 'command',
        cwd,
        shell: 'powershell',
        command
      })

      if (result?.code !== 0) {
        throw new Error(result?.stderr || result?.stdout || 'Failed to create virtual env')
      }

      const envPython = `${cwd}\\.venv\\Scripts\\python.exe`
      setVenvPath(envPython)
      setStatus(`Created virtual env at ${envPython}`)
      pushActivity('success', 'Created and selected a new virtual env.')
      return true
    } catch (error) {
      setStatus('Failed to create virtual env.')
      pushActivity('error', `Virtual env creation failed: ${String(error?.message || error)}`)
      return false
    }
  }

  const choosePythonVirtualEnv = async () => {
    if (!hasApi() || !window.api.listPythonEnvironments) {
      pushActivity('warning', 'Python environment discovery is unavailable.')
      return false
    }

    setShowPythonEnvironmentMenu(true)

    try {
      setPythonEnvironmentsLoading(true)
      setPythonEnvironmentsError('')

      const environments = await window.api.listPythonEnvironments(
        rootFolder || dirnameFromPath(activePath) || ''
      )
      setPythonEnvironments(Array.isArray(environments) ? environments : [])

      if (!Array.isArray(environments) || environments.length === 0) {
        setPythonEnvironmentsError('No Python environments were found on this computer.')
        pushActivity('warning', 'No Python environments were found on this computer.')
      } else {
        pushActivity(
          'success',
          `Found ${environments.length} Python environment${environments.length === 1 ? '' : 's'}.`
        )
      }
    } catch (error) {
      const message = String(error?.message || error)
      setPythonEnvironmentsError(message)
      pushActivity('error', `Failed to load Python environments: ${message}`)
      return false
    } finally {
      setPythonEnvironmentsLoading(false)
    }

    return true
  }

  const selectPythonEnvironment = (environment) => {
    const pythonPath = String(environment?.path || '').trim()
    if (!pythonPath) return

    setVenvPath(pythonPath)
    setShowPythonEnvironmentMenu(false)
    setStatus(`Selected Python executable: ${basenameFromPath(pythonPath)}`)
    pushActivity(
      'success',
      `Selected Python environment: ${environment?.label || basenameFromPath(pythonPath)}`
    )
  }

  const browsePythonExecutable = async () => {
    if (!hasApi()) return false

    const pythonPath = await window.api.openFile()
    if (!pythonPath) return false

    setVenvPath(pythonPath)
    setShowPythonEnvironmentMenu(false)
    setStatus(`Selected Python executable: ${basenameFromPath(pythonPath)}`)
    pushActivity('success', `Selected virtual env or interpreter: ${basenameFromPath(pythonPath)}`)
    return true
  }

  const activeIsNotebook = isNotebookFile(activePath)

  useEffect(() => {
    if (!activeIsNotebook || activeNotebookCellIndex == null) return undefined

    const cellNode = notebookCellRefs.current[activeNotebookCellIndex]
    const editor = notebookEditorRefs.current[activeNotebookCellIndex]

    if (suppressNextNotebookScroll.current) {
      // consume the suppression flag and do not scroll/focus
      suppressNextNotebookScroll.current = false
    } else {
      if (cellNode?.scrollIntoView) {
        cellNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      if (editor?.focus) {
        editor.focus()
      }
    }

    return undefined
  }, [activeIsNotebook, activeNotebookCellIndex, code])

  useEffect(() => {
    if (!activeIsNotebook) {
      setNotebookCellHeights({})
    }
  }, [activeIsNotebook])

  useEffect(() => {
    const handleNotebookShortcut = (event) => {
      if (!activeIsNotebook || !activePath) return

      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest?.('.monaco-editor')) {
        return
      }

      if (
        event.shiftKey &&
        event.key === 'Enter' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        event.preventDefault()

        const cells = getNotebookCells()
        if (!cells || cells.length === 0) return

        const selectedIndex =
          activeNotebookCellIndex != null
            ? activeNotebookCellIndex
            : cells.findIndex((cell) => cell?.cell_type === 'code')

        if (selectedIndex >= 0) {
          suppressNextNotebookScroll.current = true
          ;(async () => {
            const ok = await runNotebookCell(selectedIndex)
            if (ok) {
              const next = selectedIndex + 1 < cells.length ? selectedIndex + 1 : selectedIndex
              setActiveNotebookCellIndex(next)
            }
          })()
        }
      }
    }

    window.addEventListener('keydown', handleNotebookShortcut)
    return () => window.removeEventListener('keydown', handleNotebookShortcut)
  }, [
    activeIsNotebook,
    activeNotebookCellIndex,
    activePath,
    code,
    getNotebookCells,
    rootFolder,
    runNotebookCell,
    venvPath
  ])

  const installMarketplacePackage = (packageId) => {
    const packageDef = marketplaceCards.find((card) => card.id === packageId)
    if (!packageDef) return

    const installInMain = async () => {
      try {
        if (window.api?.installMarketplacePackage) {
          await window.api.installMarketplacePackage(packageId)
          const installedPackagesFromMain = await window.api.listMarketplacePackages()

          // Ensure installedPackagesFromMain is an array before mapping
          const packageIds = Array.isArray(installedPackagesFromMain)
            ? installedPackagesFromMain.map((record) => record?.id).filter(Boolean)
            : []

          setInstalledPackages(packageIds)
          setStatus(`${packageDef.name} installed.`)
          pushActivity('success', `${packageDef.name} installed and activated.`)
          return
        }

        const queue = [packageId]
        const resolved = new Set()

        while (queue.length > 0) {
          const currentId = queue.shift()
          if (!currentId || resolved.has(currentId)) {
            continue
          }

          resolved.add(currentId)
          const dependency = marketplaceCards.find((card) => card.id === currentId)
          const nextDependencies = Array.isArray(dependency?.requires) ? dependency.requires : []
          nextDependencies.forEach((dependencyId) => queue.push(dependencyId))
        }

        setInstalledPackages((current) => Array.from(new Set([...current, ...resolved])))
        setStatus(`${packageDef.name} installed.`)
        pushActivity('success', `${packageDef.name} installed and ready.`)
      } catch (error) {
        console.error('Install error:', error)
        pushActivity('error', `Failed to install ${packageDef.name}: ${error.message}`)
        setStatus(`Failed to install ${packageDef.name}.`)
      }
    }

    installInMain()
  }

  const uninstallMarketplacePackage = (packageId) => {
    const packageDef = marketplaceCards.find((card) => card.id === packageId)
    if (!packageDef) return

    const uninstallInMain = async () => {
      try {
        if (window.api?.uninstallMarketplacePackage) {
          await window.api.uninstallMarketplacePackage(packageId)
          const installedPackagesFromMain = await window.api.listMarketplacePackages()

          // Ensure installedPackagesFromMain is an array before mapping
          const packageIds = Array.isArray(installedPackagesFromMain)
            ? installedPackagesFromMain.map((record) => record?.id).filter(Boolean)
            : []

          setInstalledPackages(packageIds)
          setStatus(`${packageDef.name} removed.`)
          pushActivity('success', `${packageDef.name} uninstalled.`)
          return
        }

        setInstalledPackages((current) => current.filter((id) => id !== packageId))
        setStatus(`${packageDef.name} removed.`)
        pushActivity('success', `${packageDef.name} removed from the marketplace list.`)
      } catch (error) {
        console.error('Uninstall error:', error)
        pushActivity('error', `Failed to remove ${packageDef.name}: ${error.message}`)
        setStatus(`Failed to remove ${packageDef.name}.`)
      }
    }

    uninstallInMain()
  }

  const insertNotebookStarterCell = () => {
    insertNotebookCell(
      'code',
      `import pandas as pd\nimport numpy as np\n\nframe = pd.DataFrame({\n    'value': np.arange(5)\n})\nframe`,
      'Inserted a notebook starter cell.'
    )
  }

  const insertMarkdownNotebookCell = () => {
    insertNotebookCell(
      'markdown',
      '# Notebook Notes\n\nUse this space to explain the analysis or next steps.',
      'Inserted a markdown notebook cell.'
    )
  }

  const pushActivity = (kind, text) => {
    if (kind !== 'warning' && kind !== 'error') {
      return
    }

    const id = Date.now() + Math.random()
    setToasts((current) => [{ id, kind, text }, ...current].slice(0, 3))

    const timerId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      toastTimersRef.current.delete(id)
    }, 3000)

    toastTimersRef.current.set(id, timerId)
  }

  const dismissToast = (id) => {
    const timerId = toastTimersRef.current.get(id)
    if (timerId) {
      window.clearTimeout(timerId)
      toastTimersRef.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  useEffect(() => {
    layoutMetricsRef.current = { sidebarWidth, rightWidth, terminalHeight }
  }, [sidebarWidth, rightWidth, terminalHeight])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.apiKey, apiKey)
  }, [apiKey])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.apiProvider, apiProvider)
  }, [apiProvider])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.selectedModel, selectedModel)
  }, [selectedModel])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.appearanceMode, appearanceMode)
    document.documentElement.dataset.theme = appearanceMode
    document.body.style.backgroundColor = appearanceMode === 'light' ? '#f3f4f6' : '#1e1e1e'
    document.body.style.color = appearanceMode === 'light' ? '#111827' : '#ffffff'
  }, [appearanceMode])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.preferredModels, JSON.stringify(preferredModels))
  }, [preferredModels])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.installedPackages, JSON.stringify(installedPackages))
  }, [installedPackages])

  useEffect(() => {
    let cancelled = false

    const loadInstalledPackages = async () => {
      try {
        if (!window.api?.listMarketplacePackages) {
          return
        }

        const installed = await window.api.listMarketplacePackages()
        if (cancelled) return

        setInstalledPackages(installed.map((record) => record.id).filter(Boolean))
      } catch (error) {
        console.error('Failed to load installed marketplace packages', error)
      }
    }

    loadInstalledPackages()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!settingsOpen && !marketplaceOpen) return undefined

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
        setMarketplaceOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [settingsOpen, marketplaceOpen])

  useEffect(() => {
    if (!autoSaveEnabled || !activePath || fileLoading) return undefined
    const timer = window.setTimeout(() => {
      saveCurrentFile()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [code, autoSaveEnabled, activePath])

  // Persist auto save preference
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.autoSaveEnabled, autoSaveEnabled ? 'true' : 'false')
    } catch {}
  }, [autoSaveEnabled])

  // Persist recent folders when changed
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.recentFolders, JSON.stringify(recentFolders))
    } catch {}
  }, [recentFolders])

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc?.on) return undefined

    const handler = async (_, folderPath) => {
      if (!folderPath) return
      setRootFolder(folderPath)
      setExpanded({ [folderPath]: true })
      setStatus(`Loaded folder: ${folderPath}`)
      pushActivity('success', `Workspace opened in this window: ${folderPath}`)
      await loadDirectory(folderPath)
    }

    ipc.on('workspace:open', handler)
    return () => {
      ipc.removeListener('workspace:open', handler)
    }
  }, [])

  useEffect(() => {
    const startupWorkspace =
      typeof window.api?.getStartupWorkspacePath === 'function'
        ? window.api.getStartupWorkspacePath()
        : ''
    const params = new URLSearchParams(window.location.search)
    const workspace = startupWorkspace || params.get('workspace') || params.get('folder')
    if (!workspace) return undefined

    const openFromStartup = async () => {
      setRootFolder(workspace)
      setExpanded({ [workspace]: true })
      setStatus(`Loaded folder: ${workspace}`)
      pushActivity('success', `Workspace opened in this window: ${workspace}`)
      await loadDirectory(workspace)
    }

    openFromStartup()
    return undefined
  }, [])

  const addRecentFolder = (folderPath) => {
    if (!folderPath) return
    try {
      setRecentFolders((current) => {
        const next = [folderPath, ...current.filter((p) => p !== folderPath)]
        return next.slice(0, 50)
      })
    } catch {}
  }

  const openRecentFolder = async (folderPath) => {
    if (!folderPath) return
    // If no workspace currently open, open in this window (welcome flow)
    if (!rootFolder) {
      setRootFolder(folderPath)
      setStatus(`Loaded folder: ${folderPath}`)
      pushActivity('success', `Workspace opened: ${folderPath}`)
      setExpanded((current) => ({ ...current, [folderPath]: true }))
      await loadDirectory(folderPath)
      addRecentFolder(folderPath)
      return
    }

    // If a workspace is open, open the recent folder in a new window
    try {
      if (typeof window.api.newWindowWithFolder === 'function') {
        await window.api.newWindowWithFolder(folderPath)
      } else if (typeof window.api.openFolderInNewWindow === 'function') {
        // fallback to the open-folder-then-new-window flow
        await window.api.openFolderInNewWindow()
      } else {
        await window.api.newWindow?.()
      }
      addRecentFolder(folderPath)
    } catch (e) {
      pushActivity(
        'error',
        `Could not open recent folder in new window: ${String(e?.message || e)}`
      )
    }
  }

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      toastTimersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '+') {
        window.api?.zoomIn && window.api.zoomIn()
        e.preventDefault()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        window.api?.zoomOut && window.api.zoomOut()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isTypingTarget =
        e.target &&
        (e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.tagName === 'SELECT' ||
          e.target.isContentEditable)

      // Ctrl+S - Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        saveCurrentFile()
        return
      }

      // Ctrl+Alt+N - Open new folder
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'n') {
        e.preventDefault()
        openFolder()
        return
      }

      // Ctrl+T - Open new terminal
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && !e.shiftKey) {
        e.preventDefault()
        setTerminalOpen((current) => !current)
        return
      }

      // Ctrl+Shift+C - Toggle model selector
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        setShowAgentModelMenu((current) => !current)
        return
      }

      // Ctrl+K - Toggle agent/chat panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.shiftKey) {
        e.preventDefault()
        setShowAgentPanel((current) => !current)
        return
      }

      // Ctrl+F - Focus sidebar explorer
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault()
        setSidebarOpen(true)
        return
      }

      if (e.key === 'F2' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const targetPath = selectedExplorerPath || activePath
        if (targetPath) {
          handleRenameRequest(targetPath)
        }
        return
      }

      if (e.key === 'Escape') {
        setContextMenu(null)
        if (renameTarget) {
          cancelRename()
        }
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false)
          setDeleteTarget('')
        }
        return
      }

      if (!isTypingTarget && (e.key === 'Delete' || e.key === 'Suppr')) {
        const targetPath = selectedExplorerPath || activePath
        if (targetPath) {
          e.preventDefault()
          handleDeleteRequest(targetPath)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [activePath, selectedExplorerPath, renameTarget, showDeleteConfirm])

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

  const startResize = (kind, event) => {
    event.preventDefault()
    dragRef.current = { kind }
    document.body.style.cursor = kind === 'terminal' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMove = (event) => {
      if (!dragRef.current) return

      const { kind } = dragRef.current
      const { sidebarWidth: currentSidebarWidth, rightWidth: currentRightWidth } =
        layoutMetricsRef.current

      if (kind === 'sidebar') {
        const nextWidth = clamp(event.clientX, 220, window.innerWidth - currentRightWidth - 360)
        setSidebarWidth(nextWidth)
      }

      if (kind === 'right') {
        const nextWidth = clamp(
          window.innerWidth - event.clientX,
          280,
          window.innerWidth - currentSidebarWidth - 360
        )
        setRightWidth(nextWidth)
      }

      if (kind === 'terminal') {
        const nextHeight = clamp(
          window.innerHeight - event.clientY,
          180,
          Math.round(window.innerHeight * 0.65)
        )
        setTerminalHeight(nextHeight)
      }
    }

    const handleUp = () => {
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  const languageFromPath = (filePath) => {
    const lower = filePath.toLowerCase()
    if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
    if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs'))
      return 'javascript'
    if (lower.endsWith('.css')) return 'css'
    if (lower.endsWith('.html')) return 'html'
    if (lower.endsWith('.json')) return 'json'
    if (lower.endsWith('.md')) return 'markdown'
    return 'plaintext'
  }

  const iconForPath = (item, isOpen = false) => {
    if (item.isDirectory) {
      return isOpen ? FolderOpen : Folder
    }

    const lower = item.name.toLowerCase()
    if (/\.(png|jpg|jpeg|gif|webp|bmp|svg|ico)$/.test(lower)) return FileImage
    if (/\.(mp3|wav|ogg|m4a|flac)$/.test(lower)) return FileMusic
    if (/\.(mp4|mov|avi|mkv|webm)$/.test(lower)) return FileVideoCamera
    if (/\.(zip|rar|7z|tar|gz)$/.test(lower)) return FileArchive
    if (/\.(csv|xls|xlsx)$/.test(lower)) return FileSpreadsheet
    if (/\.(json|jsonc)$/.test(lower)) return FileCode
    if (
      /.(js|jsx|ts|tsx|mjs|cjs|css|scss|sass|html|htm|py|java|c|cpp|cs|go|rs|php|rb|sh|ps1|yml|yaml|md|txt|sql)$/.test(
        lower
      )
    ) {
      return FileCode
    }
    if (/\.(bat|cmd|ps1|sh)$/.test(lower)) return FileTerminal
    if (/\.(d\.ts)$/.test(lower)) return FileSymlink
    return Binary
  }

  const explorerToneForPath = (item) => {
    if (item.isDirectory) {
      return { iconColor: 'text-gray-400' }
    }

    const lower = item.name.toLowerCase()

    // Web files
    if (/\.html?$/.test(lower)) return { iconColor: 'text-green-500', badge: 'HTML' }
    if (/\.css$/.test(lower)) return { iconColor: 'text-purple-500', badge: 'CSS' }
    if (/\.(js|jsx|mjs|cjs)$/.test(lower)) return { iconColor: 'text-yellow-500', badge: 'JS' }
    if (/\.ts$/.test(lower)) return { iconColor: 'text-blue-600', badge: 'TS' }
    if (/\.tsx?$/.test(lower)) return { iconColor: 'text-blue-600', badge: 'TSX' }

    // Python
    if (/\.py$/.test(lower)) return { iconColor: 'text-blue-500', badge: 'PY' }

    // Java
    if (/\.java$/.test(lower)) return { iconColor: 'text-red-500', badge: 'JAVA' }

    // Notebooks
    if (/\.ipynb$/.test(lower)) return { iconColor: 'text-orange-500', badge: 'NB' }

    // Images
    if (/\.(png|jpg|jpeg|gif|webp|bmp|svg|ico)$/.test(lower)) {
      return { iconColor: 'text-cyan-500', badge: 'IMG' }
    }

    // Audio
    if (/\.(mp3|wav|ogg|m4a|flac)$/.test(lower)) {
      return { iconColor: 'text-fuchsia-500', badge: 'AUDIO' }
    }

    // Video
    if (/\.(mp4|mov|avi|mkv|webm)$/.test(lower)) {
      return { iconColor: 'text-rose-500', badge: 'VIDEO' }
    }

    // Archives
    if (/\.(zip|rar|7z|tar|gz)$/.test(lower)) {
      return { iconColor: 'text-orange-600', badge: 'ZIP' }
    }

    // Data
    if (/\.(csv|xls|xlsx)$/.test(lower)) {
      return { iconColor: 'text-emerald-500', badge: 'DATA' }
    }

    // JSON
    if (/\.(json|jsonc)$/.test(lower)) {
      return { iconColor: 'text-sky-500', badge: 'JSON' }
    }

    // Text/Markdown
    if (/\.(md|txt|sql|log)$/.test(lower)) {
      return { iconColor: 'text-slate-400', badge: lower.endsWith('.md') ? 'MD' : 'TXT' }
    }

    // Scripts
    if (/\.(sh|bash|bat|cmd|ps1)$/.test(lower)) {
      return { iconColor: 'text-lime-500', badge: 'CMD' }
    }

    // C/C++/C#
    if (/\.(c|cpp|cc|cxx|h|hpp)$/.test(lower)) {
      return { iconColor: 'text-blue-400', badge: lower.includes('h') ? 'H' : 'C++' }
    }
    if (/\.cs$/.test(lower)) {
      return { iconColor: 'text-purple-600', badge: 'C#' }
    }

    // Other languages
    if (/\.go$/.test(lower)) return { iconColor: 'text-cyan-600', badge: 'GO' }
    if (/\.rs$/.test(lower)) return { iconColor: 'text-orange-700', badge: 'RS' }
    if (/\.php$/.test(lower)) return { iconColor: 'text-purple-400', badge: 'PHP' }
    if (/\.rb$/.test(lower)) return { iconColor: 'text-red-600', badge: 'RB' }
    if (/\.(yaml|yml)$/.test(lower)) return { iconColor: 'text-red-500', badge: 'YAML' }

    // TypeScript definitions
    if (/\.d\.ts$/.test(lower)) return { iconColor: 'text-blue-600', badge: 'DTS' }

    // Default
    return { iconColor: 'text-gray-400' }
  }

  const inferProviderFromConnection = (connection) => {
    const value = String(connection || '').trim()
    const lower = value.toLowerCase()
    if (!value) return 'openrouter'

    if (/^https?:\/\//.test(lower)) {
      if (lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('/models')) {
        return 'ollama'
      }
      if (lower.includes('openrouter.ai') || lower.includes('/openrouter')) {
        return 'openrouter'
      }
      if (lower.includes('api.openai.com')) {
        return 'openai'
      }
      if (lower.includes('googleapis.com') || lower.includes('generativelanguage')) {
        return 'google'
      }
      return 'ollama'
    }

    if (/^sk-or-v1-|^or-/.test(value) || lower.includes('openrouter')) return 'openrouter'
    if (/^sk-|^pk-|^openai|^azure/.test(value)) return 'openai'
    if (/^AIza[A-Za-z0-9_-]{35}$/.test(value)) return 'google'
    return 'openai'
  }

  const getEffectiveProvider = (connection, provider) => {
    return provider === 'auto' ? inferProviderFromConnection(connection) : provider
  }

  const normalizeEndpointOrigin = (value, fallbackProtocol = 'http:') => {
    const raw = String(value || '')
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

    // If user provided only a port like ":11434", assume localhost
    if (/^:\d+$/.test(raw)) {
      return `${fallbackProtocol}//localhost${raw}`
    }

    const stripped = raw.replace(/\/(api\/(chat|tags)|v1\/models|models).*$/i, '')
    return `${fallbackProtocol}//${stripped}`
  }

  const loadModels = async (connection, provider) => {
    const effectiveProvider = getEffectiveProvider(connection, provider)
    if (!String(connection || '').trim()) {
      setAvailableModels([])
      setModelsError('')
      return
    }

    setModelsLoading(true)
    setModelsError('')
    setAvailableModels([])
    pushActivity('info', `Refreshing ${effectiveProvider} models from the API.`)

    try {
      const nextModels =
        typeof window.api.listProviderModels === 'function'
          ? await window.api.listProviderModels(connection, effectiveProvider)
          : await window.electron.ipcRenderer.invoke(
              'provider:listModels',
              connection,
              effectiveProvider
            )

      setAvailableModels(nextModels)
      const fallbackModel = nextModels[0]?.id || ''
      setSelectedModel((current) => {
        if (current && nextModels.some((model) => model.id === current)) {
          return current
        }
        return fallbackModel
      })
      setPreferredModels((current) => {
        const allowed = new Set(nextModels.map((model) => model.id))
        const next = Array.from(new Set(current.filter((id) => allowed.has(id))))
        if (!next.length && fallbackModel) {
          return [fallbackModel]
        }
        return next.length ? next : ['']
      })
      setStatus(
        nextModels.length
          ? `Loaded ${nextModels.length} ${effectiveProvider} models.`
          : `No models returned from ${effectiveProvider}.`
      )
      pushActivity(
        nextModels.length ? 'success' : 'warning',
        nextModels.length
          ? `Loaded ${nextModels.length} models from ${effectiveProvider}.`
          : `${effectiveProvider} returned no models.`
      )
    } catch (error) {
      if (error.name === 'AbortError') return
      // Provide clearer messaging for network/fetch failures
      const msg = String(error?.message || error)
      console.error('loadModels error', error)
      setAvailableModels([])
      if (
        msg.toLowerCase().includes('fetch failed') ||
        msg.toLowerCase().includes('networkerror') ||
        msg.toLowerCase().includes('ecoff')
      ) {
        const friendly = `Could not contact ${effectiveProvider} provider. Check network and provider settings.`
        setModelsError(friendly)
        setStatus(friendly)
        pushActivity('error', friendly)
      } else {
        setModelsError(msg)
        setStatus(`Could not load models from ${effectiveProvider}: ${msg}`)
        pushActivity('error', `Failed to load ${effectiveProvider} models: ${msg}`)
      }
    } finally {
      setModelsLoading(false)
    }
  }

  useEffect(() => {
    if (!settingsOpen) return undefined

    const controller = new AbortController()
    const timer = setTimeout(() => {
      loadModels(apiKey, apiProvider)
    }, 400)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [apiKey, apiProvider, settingsOpen])

  const loadDirectory = async (dirPath) => {
    if (!hasApi()) return []
    const items = await window.api.readDir(dirPath)
    const sorted = [...items].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    setTree((current) => ({ ...current, [dirPath]: sorted }))
    pushActivity('info', `Inspected ${sorted.length} entries in ${dirPath}.`)
    return sorted
  }

  const openFolder = async () => {
    if (!hasApi()) return
    // If there is no workspace open, open in this window (welcome flow)
    if (!rootFolder) {
      const folderPath = await window.api.openFolder()
      if (!folderPath) return
      setRootFolder(folderPath)
      setStatus(`Loaded folder: ${folderPath}`)
      pushActivity('success', `Workspace opened: ${folderPath}`)
      setExpanded({ [folderPath]: true })
      await loadDirectory(folderPath)
      try {
        setRecentFolders((current) => {
          const next = [folderPath, ...current.filter((p) => p !== folderPath)]
          return next.slice(0, 50)
        })
      } catch {}
      return
    }

    // If a workspace is already open, open the chosen folder in a new window
    try {
      const folderPath = await window.api.openFolderInNewWindow()
      if (!folderPath) return
      // record in recent folders (local list)
      setRecentFolders((current) => {
        const next = [folderPath, ...current.filter((p) => p !== folderPath)]
        return next.slice(0, 50)
      })
    } catch (e) {
      pushActivity('error', `Failed to open folder in new window: ${String(e?.message || e)}`)
    }
  }

  const ensureJoinedPath = (base, name) => {
    if (!base) return name
    const trimmedBase = String(base).replace(/[\\/]$/, '')
    const trimmedName = String(name).replace(/^[\\/]/, '')
    return `${trimmedBase}\\${trimmedName}`
  }

  const basenameFromPath = (p) =>
    String(p || '')
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || ''
  const dirnameFromPath = (p) => {
    const s = String(p || '').replace(/[\\/]+$/, '')
    const parts = s.split(/[/\\]/)
    parts.pop()
    return parts.join('\\')
  }

  const handleDeleteRequest = (path) => {
    setDeleteTarget(path)
    setShowDeleteConfirm(true)
    setDeleteConfirmChoice('delete')
    setMenuForPath('')
    setContextMenu(null)
  }

  const confirmDelete = async () => {
    try {
      const ok =
        typeof window.api?.deletePath === 'function'
          ? await window.api.deletePath(deleteTarget)
          : await window.electron.ipcRenderer.invoke('fs:delete', deleteTarget)
      if (ok) {
        pushActivity('success', `Deleted ${deleteTarget}`)
        const parent = dirnameFromPath(deleteTarget) || rootFolder
        await loadDirectory(parent)
      } else {
        pushActivity('error', `Failed to delete ${deleteTarget}`)
      }
    } catch (e) {
      console.error(e)
      pushActivity('error', `Delete error: ${e.message}`)
    } finally {
      setShowDeleteConfirm(false)
      setDeleteTarget('')
      setDeleteConfirmChoice('delete')
    }
  }

  useEffect(() => {
    if (!showDeleteConfirm) return undefined

    const handleDeleteDialogKeyDown = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        setDeleteConfirmChoice('cancel')
        return
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        setDeleteConfirmChoice('delete')
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        if (deleteConfirmChoice === 'delete') {
          confirmDelete()
        } else {
          setShowDeleteConfirm(false)
          setDeleteTarget('')
          setDeleteConfirmChoice('delete')
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setShowDeleteConfirm(false)
        setDeleteTarget('')
        setDeleteConfirmChoice('delete')
      }
    }

    window.addEventListener('keydown', handleDeleteDialogKeyDown, true)
    return () => window.removeEventListener('keydown', handleDeleteDialogKeyDown, true)
  }, [showDeleteConfirm, deleteConfirmChoice])

  const handleRenameRequest = (path) => {
    setRenameTarget(path)
    setRenameNewName(basenameFromPath(path))
    setShowRenameModal(false)
    setMenuForPath('')
    setContextMenu(null)
  }

  const cancelRename = () => {
    setShowRenameModal(false)
    setRenameTarget('')
    setRenameNewName('')
  }

  const confirmRename = async () => {
    try {
      const parent = dirnameFromPath(renameTarget) || rootFolder
      let finalName = renameNewName.trim()

      // Add .txt default extension for files without extension
      const isDir =
        tree[renameTarget]?.[0]?.isDirectory ||
        (renameTarget.includes('\\') && !renameTarget.includes('.'))
      if (!isDir && finalName && !finalName.includes('.')) {
        finalName = `${finalName}.txt`
      }

      const newPath = ensureJoinedPath(parent, finalName)
      const ok =
        typeof window.api?.renamePath === 'function'
          ? await window.api.renamePath(renameTarget, newPath)
          : await window.electron.ipcRenderer.invoke('fs:rename', renameTarget, newPath)
      if (ok) {
        pushActivity('success', `Renamed to ${newPath}`)
        setTabs((currentTabs) =>
          currentTabs.map((tab) =>
            tab.path === renameTarget
              ? { ...tab, path: newPath, name: basenameFromPath(newPath), missing: false }
              : tab
          )
        )
        setActivePath((currentActivePath) =>
          currentActivePath === renameTarget ? newPath : currentActivePath
        )
        setSelectedExplorerPath((currentSelected) =>
          currentSelected === renameTarget ? newPath : currentSelected
        )
        await loadDirectory(parent)
      } else {
        pushActivity('error', `Failed to rename ${renameTarget}`)
      }
    } catch (e) {
      console.error(e)
      pushActivity('error', `Rename error: ${e.message}`)
    } finally {
      cancelRename()
    }
  }

  const createFileAndStartRename = async () => {
    const targetBase = selectedFolder || rootFolder
    if (!targetBase) {
      pushActivity('warning', 'Open a workspace first to create files.')
      return
    }

    try {
      // Create unique filename
      let counter = 1
      let filename = 'new_file.txt'
      let fullPath = ensureJoinedPath(targetBase, filename)

      // Check if file exists and create with incrementing number if needed
      let fileItems = tree[targetBase] || []
      while (fileItems.some((item) => item.name === filename)) {
        filename = `new_file_${counter}.txt`
        counter++
      }

      fullPath = ensureJoinedPath(targetBase, filename)

      // Create the empty file
      const ok = await window.api.saveFile(fullPath, '')
      if (ok) {
        await loadDirectory(targetBase)
        // Start rename immediately
        setRenameTarget(fullPath)
        setRenameNewName('new_file')
      } else {
        pushActivity('error', `Failed to create file`)
      }
    } catch (error) {
      console.error(error)
      pushActivity('error', `Error creating file: ${error.message}`)
    }
  }

  const createFolderAndStartRename = async () => {
    const targetBase = selectedFolder || rootFolder
    if (!targetBase) {
      pushActivity('warning', 'Open a workspace first to create folders.')
      return
    }

    try {
      // Create unique folder name
      let counter = 1
      let foldername = 'new_folder'
      let fullPath = ensureJoinedPath(targetBase, foldername)

      // Check if folder exists and create with incrementing number if needed
      let fileItems = tree[targetBase] || []
      while (fileItems.some((item) => item.name === foldername)) {
        foldername = `new_folder_${counter}`
        counter++
      }

      fullPath = ensureJoinedPath(targetBase, foldername)

      // Create the folder
      const ok =
        typeof window.api.mkdir === 'function'
          ? await window.api.mkdir(fullPath)
          : await window.electron.ipcRenderer.invoke('fs:makeDir', fullPath)

      if (ok) {
        await loadDirectory(targetBase)
        // Start rename immediately
        setRenameTarget(fullPath)
        setRenameNewName('new_folder')
      } else {
        pushActivity('error', `Failed to create folder`)
      }
    } catch (error) {
      console.error(error)
      pushActivity('error', `Error creating folder: ${error.message}`)
    }
  }

  const refreshExplorer = async () => {
    if (!rootFolder) {
      pushActivity('warning', 'No workspace open to refresh.')
      return
    }
    try {
      // Clear cached tree and reload root + any expanded directories
      setTree({})
      // Ensure root is expanded
      setExpanded((current) => ({ ...current, [rootFolder]: true }))

      // Build list of directories to load (root first, then expanded ones)
      const expandedDirs = Object.keys(expanded).filter((p) => expanded[p])
      const toLoad = [rootFolder, ...expandedDirs.filter((p) => p !== rootFolder)]

      for (const p of toLoad) {
        // load sequentially to avoid IO contention and preserve order
        // eslint-disable-next-line no-await-in-loop
        await loadDirectory(p)
      }

      pushActivity('success', 'Explorer refreshed.')
    } catch (error) {
      console.error(error)
      pushActivity('error', `Failed to refresh explorer: ${error.message}`)
    }
  }

  const handleClone = async (path) => {
    try {
      const name = basenameFromPath(path)
      const parent = dirnameFromPath(path) || rootFolder
      const copyName = `${name}-copy`
      const dest = ensureJoinedPath(parent, copyName)
      const ok =
        typeof window.api?.copyPath === 'function'
          ? await window.api.copyPath(path, dest)
          : await window.electron.ipcRenderer.invoke('fs:copy', path, dest)
      if (ok) {
        pushActivity('success', `Cloned to ${dest}`)
        await loadDirectory(parent)
      } else {
        pushActivity('error', `Failed to clone ${path}`)
      }
    } catch (e) {
      console.error(e)
      pushActivity('error', `Clone error: ${e.message}`)
    } finally {
      setMenuForPath('')
    }
  }

  const handleItemClick = (itemPath, isDir, event) => {
    const isCtrlClick = event.ctrlKey || event.metaKey

    if (isCtrlClick) {
      // Toggle selection with Ctrl/Cmd
      setSelectedPaths((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(itemPath)) {
          newSet.delete(itemPath)
        } else {
          newSet.add(itemPath)
        }
        return newSet
      })
      setSelectedExplorerPath(itemPath)
    } else {
      // Single selection without Ctrl
      setSelectedPaths(new Set([itemPath]))
      setSelectedExplorerPath(itemPath)

      // Additional behavior for folders and files
      if (isDir) {
        setSelectedFolder(itemPath)
        toggleDirectory(itemPath)
      } else {
        setSelectedFolder(dirnameFromPath(itemPath))
        openFile(itemPath)
      }
    }
  }

  const handleDragStart = (item, event) => {
    const itemsToMove = selectedPaths.has(item.path) ? Array.from(selectedPaths) : [item.path]

    setDraggedItems(itemsToMove)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemsToMove.join('|'))
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDropOnFolder = async (targetFolderPath, event) => {
    event.preventDefault()
    event.stopPropagation()

    if (!draggedItems || draggedItems.length === 0) return

    try {
      for (const sourcePath of draggedItems) {
        if (sourcePath === targetFolderPath) continue // Can't drop on itself

        const itemName = basenameFromPath(sourcePath)
        const destPath = ensureJoinedPath(targetFolderPath, itemName)

        const ok =
          typeof window.api?.renamePath === 'function'
            ? await window.api.renamePath(sourcePath, destPath)
            : await window.electron.ipcRenderer.invoke('fs:rename', sourcePath, destPath)

        if (!ok) {
          pushActivity('error', `Failed to move ${itemName}`)
          continue
        }
      }

      pushActivity('success', `Moved ${draggedItems.length} item(s)`)
      await loadDirectory(targetFolderPath)

      // Reload source directories
      for (const sourcePath of draggedItems) {
        const sourceParent = dirnameFromPath(sourcePath) || rootFolder
        if (sourceParent !== targetFolderPath) {
          await loadDirectory(sourceParent)
        }
      }

      setDraggedItems(null)
      setSelectedPaths(new Set())
    } catch (e) {
      console.error(e)
      pushActivity('error', `Move error: ${e.message}`)
    }
  }

  const handleCopyPath = async (path) => {
    try {
      await navigator.clipboard.writeText(path)
      pushActivity('success', 'Path copied to clipboard.')
    } catch (e) {
      pushActivity('error', `Clipboard error: ${e.message}`)
    } finally {
      setMenuForPath('')
    }
  }

  const openFileDialog = async () => {
    if (!hasApi()) return
    const filePath = await window.api.openFile()
    if (!filePath) return
    await openFile(filePath)
  }

  const openFile = async (filePath) => {
    if (!hasApi()) return
    setFileLoading(true)
    setActivePath(filePath)
    setSelectedPaths(new Set([filePath]))
    setSelectedExplorerPath(filePath)
    setCode('// Loading file...')
    setStatus(`Loading ${filePath}...`)
    setTabs((current) => {
      if (current.some((tab) => tab.path === filePath)) return current
      return [
        ...current,
        { path: filePath, name: filePath.split('\\').pop() || filePath, missing: false }
      ]
    })

    try {
      const result = await window.api.readFile(filePath)
      if (!result) {
        setStatus(`Could not open ${filePath}.`)
        setCode(`// Could not open file:\n// ${filePath}`)
        pushActivity('error', `Failed to open ${filePath}.`)
        return
      }

      setActivePath(result.path)
      setSelectedPaths(new Set([result.path]))
      setSelectedExplorerPath(result.path)
      setCode(result.content ?? '')
      setStatus(result.truncated ? `Loaded preview of ${result.name}.` : `Editing ${result.name}`)
      pushActivity(
        'info',
        result.truncated ? `Loaded preview of ${result.name}.` : `Opened file ${result.name}.`
      )

      setTabs((current) => {
        if (current.some((tab) => tab.path === result.path)) {
          return current.map((tab) =>
            tab.path === result.path ? { ...tab, name: result.name, missing: false } : tab
          )
        }
        return [...current, { path: result.path, name: result.name, missing: false }]
      })
    } catch (error) {
      console.error(error)
      setStatus(`Could not open ${filePath}: ${error.message}`)
      setCode(`// Failed to open file:\n// ${filePath}\n// ${error.message}`)
      setTabs((current) =>
        current.map((tab) => (tab.path === filePath ? { ...tab, missing: true } : tab))
      )
      pushActivity('error', `Failed to open ${filePath}: ${error.message}`)
    } finally {
      setFileLoading(false)
    }
  }

  const toggleDirectory = async (dirPath) => {
    const isExpanded = Boolean(expanded[dirPath])
    setExpanded((current) => ({ ...current, [dirPath]: !isExpanded }))
    if (!isExpanded && !tree[dirPath]) {
      await loadDirectory(dirPath)
    }
  }

  const saveCurrentFile = async () => {
    if (!hasApi() || !activePath) return
    setSaving(true)
    try {
      await window.api.saveFile(activePath, code)
      setStatus(`Saved ${activePath}`)
      pushActivity('success', `Saved ${activePath}.`)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!showFileMenu) return undefined

    const handlePointerDown = (event) => {
      if (!event.target.closest?.('[data-file-menu]')) {
        setShowFileMenu(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [showFileMenu])

  useEffect(() => {
    if (!showModeMenu && !showAgentModelMenu) return undefined

    const handlePointerDown = (event) => {
      if (!event.target.closest?.('[data-agent-pickers]')) {
        setShowModeMenu(false)
        setShowAgentModelMenu(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [showModeMenu, showAgentModelMenu])

  useEffect(() => {
    if (!showSettingsMenu) return undefined

    const handlePointerDown = (event) => {
      if (!event.target.closest?.('[data-settings-menu]')) {
        setShowSettingsMenu(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [showSettingsMenu])

  useEffect(() => {
    if (!showHelpMenu) return undefined

    const handlePointerDown = (event) => {
      if (!event.target.closest?.('[data-help-menu]')) {
        setShowHelpMenu(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [showHelpMenu])

  useEffect(() => {
    if (!hasApi() || tabs.length === 0) return undefined

    let cancelled = false

    const validateTabs = async () => {
      const results = await Promise.all(
        tabs.map(async (tab) => ({
          path: tab.path,
          exists: Boolean(await window.api.readFile(tab.path))
        }))
      )

      if (cancelled) return

      setTabs((currentTabs) => {
        let changed = false
        const nextTabs = currentTabs.map((tab) => {
          const result = results.find((entry) => entry.path === tab.path)
          if (!result) return tab

          const missing = !result.exists
          if (tab.missing === missing) return tab

          changed = true
          return { ...tab, missing }
        })

        return changed ? nextTabs : currentTabs
      })
    }

    validateTabs().catch((error) => {
      console.error('Failed to validate open tabs', error)
    })

    return () => {
      cancelled = true
    }
  }, [tabs])

  const saveAsCurrentFile = async () => {
    if (!hasApi()) return
    setSaving(true)
    try {
      const savedPath = await window.api.saveAsFile(code)
      if (!savedPath) return
      setActivePath(savedPath)
      setTabs((currentTabs) => {
        if (currentTabs.some((tab) => tab.path === savedPath)) return currentTabs
        return [...currentTabs, { path: savedPath, name: basenameFromPath(savedPath) }]
      })
      setStatus(`Saved as ${savedPath}`)
      pushActivity('success', `Saved as ${savedPath}.`)
    } finally {
      setSaving(false)
    }
  }

  const openNewWindow = async () => {
    if (!hasApi()) return
    await window.api.newWindow()
    pushActivity('success', 'Opened a new Sam Code window.')
  }

  const toNotebookSource = (source) => {
    if (Array.isArray(source)) {
      return source.join('')
    }

    return String(source || '')
  }

  const abortGeneration = () => {
    if (generationAbortRef.current) {
      generationAbortRef.current.abort()
      generationAbortRef.current = null
    }
    setSending(false)
    setStatus('Generation stopped.')
  }

  const buildRunPlan = () => {
    if (!activePath) {
      return null
    }

    const lowerPath = activePath.toLowerCase()
    const cwd = rootFolder || dirnameFromPath(activePath)

    if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) {
      return { type: 'external', target: activePath }
    }

    if (lowerPath.endsWith('.ipynb')) {
      try {
        const notebook = safeParseNotebook(code)
        if (!notebook || !Array.isArray(notebook.cells)) {
          return { type: 'invalid-notebook' }
        }

        const script = notebook.cells
          .filter((cell) => cell && cell.cell_type === 'code')
          .map((cell) => toNotebookSource(cell.source))
          .join('\n\n')
          .trim()

        if (!script) {
          return { type: 'invalid-notebook' }
        }

        return {
          type: 'command',
          cwd,
          shell: 'powershell',
          command: `@'\n${script}\n'@ | python -`
        }
      } catch {
        return { type: 'invalid-notebook' }
      }
    }

    if (lowerPath.endsWith('.jsx') || lowerPath.endsWith('.tsx')) {
      if (rootFolder) {
        return {
          type: 'command',
          cwd: rootFolder,
          shell: 'powershell',
          command: 'npm run dev',
          background: true
        }
      }

      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `npx tsx "${activePath}"`
      }
    }

    if (lowerPath.endsWith('.ts')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `npx tsx "${activePath}"`
      }
    }

    if (lowerPath.endsWith('.js') || lowerPath.endsWith('.mjs') || lowerPath.endsWith('.cjs')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `node "${activePath}"`
      }
    }

    if (lowerPath.endsWith('.py')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `python "${activePath}"`
      }
    }

    if (lowerPath.endsWith('.java')) {
      // Extract the public class name from the Java file
      const javaCodeContent = String(code || '').trim()
      // Match: public [modifiers] class ClassName
      const publicClassMatch = javaCodeContent.match(
        /public\s+(?:final\s+)?(?:abstract\s+)?(?:static\s+)?class\s+(\w+)/
      )
      let className = publicClassMatch ? publicClassMatch[1] : null

      // If no public class found, try to find any class
      if (!className) {
        const anyClassMatch = javaCodeContent.match(
          /(?:public\s+)?(?:final\s+)?(?:abstract\s+)?(?:static\s+)?class\s+(\w+)/
        )
        className = anyClassMatch
          ? anyClassMatch[1]
          : basenameFromPath(activePath).replace(/\.java$/, '')
      }

      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `javac "${activePath}" 2>&1; if ($LASTEXITCODE -eq 0) { java -cp "." "${className}" } else { Write-Host "Compilation failed"; exit 1 }`
      }
    }

    if (lowerPath.endsWith('.go')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `go run "${activePath}"`
      }
    }

    if (lowerPath.endsWith('.rb')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `ruby "${activePath}"`
      }
    }

    if (lowerPath.endsWith('.php')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `php "${activePath}"`
      }
    }

    if (lowerPath.endsWith('.rs')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `cargo run`
      }
    }

    if (lowerPath.endsWith('.sh')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `bash "${activePath}"`
      }
    }

    if (lowerPath.endsWith('.ps1')) {
      return {
        type: 'command',
        cwd,
        shell: 'powershell',
        command: `& "${activePath}"`
      }
    }

    return null
  }

  const runCurrentFile = async () => {
    if (!hasApi() || !activePath) {
      setTerminalOpen(true)
      return
    }

    const activeTab = tabs.find((tab) => tab.path === activePath)
    if (activeTab?.missing) {
      setStatus(`${basenameFromPath(activePath)} is missing and cannot be run.`)
      pushActivity('warning', `${basenameFromPath(activePath)} is missing and cannot be run.`)
      return
    }

    const freshnessCheck = await window.api.readFile(activePath)
    if (!freshnessCheck) {
      setTabs((current) =>
        current.map((tab) => (tab.path === activePath ? { ...tab, missing: true } : tab))
      )
      setStatus(`${basenameFromPath(activePath)} no longer exists at this path.`)
      pushActivity('warning', `${basenameFromPath(activePath)} no longer exists at this path.`)
      return
    }

    const plan = buildRunPlan()
    if (!plan) {
      setStatus(`No execution command is available for ${basenameFromPath(activePath)}.`)
      pushActivity(
        'warning',
        `No execution command is available for ${basenameFromPath(activePath)}.`
      )
      return
    }

    if (plan.type === 'invalid-notebook') {
      setStatus(`${basenameFromPath(activePath)} is not a valid notebook.`)
      pushActivity(
        'warning',
        `${basenameFromPath(activePath)} does not contain valid notebook JSON.`
      )
      return
    }

    if (plan.type === 'external') {
      const fname = basenameFromPath(activePath)
      const opened = await window.api.openExternal(plan.target)
      if (opened) {
        setStatus(`Opened ${fname} in the browser.`)
      } else {
        setStatus(`Could not open ${fname} in the browser.`)
        pushActivity('error', `Could not open ${fname} in the browser.`)
      }
      return
    }

    const fname = basenameFromPath(activePath)
    setStatus(`Running ${fname}...`)

    try {
      // Set the command to run in the terminal
      if (plan.command) {
        setTerminalCommand(plan.command)
        setTerminalOpen(true)
        // For background tasks, also run via runCommand
        if (plan.background) {
          window.api.runCommand(plan).catch((error) => {
            setStatus(`Run failed for ${fname}.`)
            pushActivity('error', error.message)
          })
        }
      }
    } catch (error) {
      setStatus(`Run failed for ${fname}.`)
      pushActivity('error', error.message)
    }
  }

  const availableModelIds = availableModels.map((model) => model.id)
  const availableModelSet = new Set(availableModelIds)
  const preferredModelOptions = preferredModels.filter((model) => availableModelSet.has(model))
  const pinnedModelOptions = preferredModelOptions.length
    ? preferredModelOptions
    : availableModelIds.slice(0, 1)
  const otherModelOptions = availableModelIds.filter((model) => !pinnedModelOptions.includes(model))

  const updatePreferredModel = (index, value) => {
    if (value && !availableModelSet.has(value)) return
    setPreferredModels((current) => {
      const next = [...current]
      next[index] = value
      const cleaned = Array.from(new Set(next.filter(Boolean)))
      if (!cleaned.length && availableModelIds[0]) {
        return [availableModelIds[0]]
      }
      return cleaned.length ? cleaned : ['']
    })
  }

  const addPreferredModelSlot = () => {
    setPreferredModels((current) => {
      const currentSet = new Set(current.filter(Boolean))
      const firstUnused = availableModelIds.find((id) => !currentSet.has(id))
      if (!firstUnused) return current
      return [...current.filter(Boolean), firstUnused]
    })
  }

  const removePreferredModelSlot = (index) => {
    setPreferredModels((current) => {
      if (index === 0 || current.length <= 1) {
        return current
      }
      const next = current.filter((_, i) => i !== index).filter(Boolean)
      if (!next.length && availableModelIds[0]) {
        return [availableModelIds[0]]
      }
      return next.length ? next : ['']
    })
  }

  const closeFileTab = (tabPath) => {
    setTabs((currentTabs) => {
      const remainingTabs = currentTabs.filter((tab) => tab.path !== tabPath)
      setActivePath((currentActivePath) => {
        if (currentActivePath !== tabPath) {
          return currentActivePath
        }

        return remainingTabs[0]?.path || ''
      })
      return remainingTabs
    })
  }

  // Helper function for the agent to execute shell commands
  const executeShellCommand = async (command, cwd = rootFolder) => {
    if (!hasApi()) {
      throw new Error('API not available')
    }

    const plan = {
      type: 'command',
      cwd: cwd || rootFolder,
      shell: 'powershell',
      command: command
    }

    return await window.api.runCommand(plan)
  }

  // File operation helpers for the agent
  const createFile = async (path, content) => {
    if (!rootFolder) throw new Error('No workspace folder selected')
    const result = await window.api.applyAgentOperations({
      rootFolder,
      operations: [{ action: 'create', path, content }]
    })
    return result
  }

  const describeAgentOperation = (operation) => {
    const action = String(operation?.action || '').toLowerCase()
    const path = String(operation?.path || '').trim()
    const command = String(operation?.command || '').trim()

    if (action === 'execute') {
      return command ? `Run command: ${command}` : 'Run command'
    }

    if (action === 'mkdir') {
      return `Create folder: ${path}`
    }

    if (action === 'delete') {
      return `Delete: ${path}`
    }

    if (action === 'create' || action === 'update' || action === 'upsert' || action === 'write') {
      return `${action === 'create' ? 'Create' : 'Update'} file: ${path}`
    }

    return `${action || 'unknown'}: ${path || 'unknown path'}`
  }

  const findNextExecuteIndex = (operations, startIndex = 0) => {
    if (!Array.isArray(operations)) return -1

    for (let index = Math.max(0, startIndex); index < operations.length; index += 1) {
      if (String(operations[index]?.action || '').toLowerCase() === 'execute') {
        return index
      }
    }

    return -1
  }

  const collectFileOperations = (operations, startIndex = 0) => {
    if (!Array.isArray(operations)) return []

    return operations
      .slice(Math.max(0, startIndex))
      .filter((operation) => String(operation?.action || '').toLowerCase() !== 'execute')
  }

  const buildCommandResultMessage = (operation, result) => {
    const stdout = String(result?.stdout || '').trim()
    const stderr = String(result?.stderr || '').trim()
    const code = result?.code

    return [
      `Executed: ${describeAgentOperation(operation)}`,
      `Exit code: ${code}`,
      stdout ? `Stdout:\n${stdout}` : '',
      stderr ? `Stderr:\n${stderr}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  }

  const buildAgentResultMessage = (payload, result) => {
    const appliedCount = Array.isArray(result?.applied) ? result.applied.length : 0
    const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0

    const appliedList = Array.isArray(result?.applied)
      ? result.applied
          .slice(0, 8)
          .map((operation) => `- ${operation.action}: ${operation.path}`)
          .join('\n')
      : ''
    const failedList = Array.isArray(result?.failed)
      ? result.failed
          .slice(0, 5)
          .map(
            (operation) =>
              `- ${operation.action || 'unknown'} ${operation.path || ''}: ${operation.reason || 'error'}`
          )
          .join('\n')
      : ''

    const commandOutput = Array.isArray(result?.applied)
      ? result.applied
          .filter((operation) => operation?.action === 'execute' && operation?.result)
          .slice(0, 3)
          .map((operation) => {
            const stdout = String(operation?.result?.stdout || '').trim()
            const stderr = String(operation?.result?.stderr || '').trim()
            const code = operation?.result?.code
            return [
              `Command: ${operation.command}`,
              `Exit code: ${code}`,
              stdout ? `Stdout:\n${stdout}` : '',
              stderr ? `Stderr:\n${stderr}` : ''
            ]
              .filter(Boolean)
              .join('\n')
          })
          .join('\n\n')
      : ''

    const summaryLine = payload.summary || 'Workspace operations executed.'
    return [
      summaryLine,
      `Applied: ${appliedCount}`,
      `Failed: ${failedCount}`,
      appliedList ? `\nChanged files:\n${appliedList}` : '',
      failedList ? `\nFailed operations:\n${failedList}` : '',
      commandOutput ? `\nCommand output:\n${commandOutput}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  }

  const executeApprovedAgentOperations = async (payload) => {
    if (!rootFolder) {
      throw new Error('Open a folder first so the agent can apply file operations.')
    }

    const operations = Array.isArray(payload?.operations) ? payload.operations : []
    const currentOperation = operations[pendingAgentStepIndex]

    if (!currentOperation) {
      const fileOperations = collectFileOperations(operations, 0)
      if (!fileOperations.length) {
        return payload.summary || 'No workspace changes were needed.'
      }

      const result = await window.api.applyAgentOperations({
        rootFolder,
        operations: fileOperations
      })

      const appliedCount = Array.isArray(result?.applied) ? result.applied.length : 0
      const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0

      if (rootFolder) {
        await loadDirectory(rootFolder)
      }

      if (activePath) {
        const activeFileWasDeleted = Array.isArray(result?.applied)
          ? result.applied.some(
              (operation) =>
                operation?.action === 'delete' &&
                String(operation?.path || '').toLowerCase() === activePath.toLowerCase()
            )
          : false

        if (activeFileWasDeleted) {
          setActivePath('')
          setCode('// Active file was deleted by agent operation.')
          setTabs((current) => current.filter((tab) => tab.path !== activePath))
        } else {
          await openFile(activePath)
        }
      }

      if (failedCount > 0) {
        setStatus(`Agent applied ${appliedCount} change(s), ${failedCount} failed.`)
        pushActivity('warning', `Agent applied ${appliedCount} change(s), ${failedCount} failed.`)
      } else {
        setStatus(`Agent applied ${appliedCount} change(s).`)
        pushActivity('success', `Agent applied ${appliedCount} change(s) to the workspace.`)
      }

      return buildAgentResultMessage(payload, result)
    }

    if (String(currentOperation?.action || '').toLowerCase() === 'execute') {
      const command = String(currentOperation?.command || '').trim()
      if (!command) {
        throw new Error('Execute action requires a command.')
      }

      const commandResult = await window.api.runCommand({
        command,
        cwd: String(currentOperation?.cwd || rootFolder || '').trim() || rootFolder,
        shell: 'powershell'
      })

      const commandMessage = buildCommandResultMessage(currentOperation, commandResult)
      setMessages((current) => [
        ...current,
        { role: 'assistant', kind: 'command', content: commandMessage }
      ])

      if (Number(commandResult?.code) !== 0) {
        setStatus(`Command failed with exit code ${commandResult?.code}.`)
        pushActivity('warning', `Command failed: ${command}`)
        return commandMessage
      }

      const nextExecuteIndex = findNextExecuteIndex(operations, pendingAgentStepIndex + 1)
      if (nextExecuteIndex >= 0) {
        setPendingAgentStepIndex(nextExecuteIndex)
        setStatus('Review the next command and allow or skip it.')
        pushActivity(
          'info',
          `Command completed. Next step is ${describeAgentOperation(operations[nextExecuteIndex])}.`
        )
        return commandMessage
      }

      const fileOperations = collectFileOperations(operations, pendingAgentStepIndex + 1)
      if (fileOperations.length === 0) {
        setStatus(payload.summary || 'Agent finished with no file changes.')
        pushActivity('info', 'Agent finished with no file changes.')
        return [payload.summary || 'Agent finished with no file changes.', commandMessage]
          .filter(Boolean)
          .join('\n\n')
      }

      const result = await window.api.applyAgentOperations({
        rootFolder,
        operations: fileOperations
      })

      const appliedCount = Array.isArray(result?.applied) ? result.applied.length : 0
      const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0

      if (rootFolder) {
        await loadDirectory(rootFolder)
      }

      if (activePath) {
        const activeFileWasDeleted = Array.isArray(result?.applied)
          ? result.applied.some(
              (operation) =>
                operation?.action === 'delete' &&
                String(operation?.path || '').toLowerCase() === activePath.toLowerCase()
            )
          : false

        if (activeFileWasDeleted) {
          setActivePath('')
          setCode('// Active file was deleted by agent operation.')
          setTabs((current) => current.filter((tab) => tab.path !== activePath))
        } else {
          await openFile(activePath)
        }
      }

      if (failedCount > 0) {
        setStatus(`Agent applied ${appliedCount} change(s), ${failedCount} failed.`)
        pushActivity('warning', `Agent applied ${appliedCount} change(s), ${failedCount} failed.`)
      } else {
        setStatus(`Agent applied ${appliedCount} change(s).`)
        pushActivity('success', `Agent applied ${appliedCount} change(s) to the workspace.`)
      }

      return [buildAgentResultMessage(payload, result), commandMessage].filter(Boolean).join('\n\n')
    }

    const fileOperations = collectFileOperations(operations, pendingAgentStepIndex)
    if (!fileOperations.length) {
      return payload.summary || 'No workspace changes were needed.'
    }

    const result = await window.api.applyAgentOperations({
      rootFolder,
      operations: fileOperations
    })

    const appliedCount = Array.isArray(result?.applied) ? result.applied.length : 0
    const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0

    if (rootFolder) {
      await loadDirectory(rootFolder)
    }

    if (activePath) {
      const activeFileWasDeleted = Array.isArray(result?.applied)
        ? result.applied.some(
            (operation) =>
              operation?.action === 'delete' &&
              String(operation?.path || '').toLowerCase() === activePath.toLowerCase()
          )
        : false

      if (activeFileWasDeleted) {
        setActivePath('')
        setCode('// Active file was deleted by agent operation.')
        setTabs((current) => current.filter((tab) => tab.path !== activePath))
      } else {
        await openFile(activePath)
      }
    }

    if (failedCount > 0) {
      setStatus(`Agent applied ${appliedCount} change(s), ${failedCount} failed.`)
      pushActivity('warning', `Agent applied ${appliedCount} change(s), ${failedCount} failed.`)
    } else {
      setStatus(`Agent applied ${appliedCount} change(s).`)
      pushActivity('success', `Agent applied ${appliedCount} change(s) to the workspace.`)
    }

    return buildAgentResultMessage(payload, result)
  }

  const approvePendingAgentProposal = async () => {
    if (!pendingAgentProposal || approvalBusy) return

    setApprovalBusy(true)
    pushActivity('info', 'Approved agent proposal. Executing requested workspace changes.')
    try {
      const resultMessage = await executeApprovedAgentOperations(pendingAgentProposal)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          kind: 'chat',
          content: resultMessage
        }
      ])
      const operations = Array.isArray(pendingAgentProposal.operations)
        ? pendingAgentProposal.operations
        : []
      const nextExecuteIndex = findNextExecuteIndex(operations, pendingAgentStepIndex + 1)

      if (nextExecuteIndex >= 0) {
        setPendingAgentStepIndex(nextExecuteIndex)
        setStatus('Review the next command and allow or skip it.')
      } else {
        setPendingAgentProposal(null)
        setPendingAgentStepIndex(0)
        setStatus('Agent finished command steps; file changes were applied automatically.')
      }
    } catch (error) {
      const message = String(error?.message || error)
      setStatus(`Agent approval failed: ${message}`)
      pushActivity('error', `Agent approval failed: ${message}`)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          kind: 'chat',
          content: `Error applying approved actions: ${message}`
        }
      ])
    } finally {
      setApprovalBusy(false)
    }
  }

  const skipPendingAgentProposal = () => {
    if (!pendingAgentProposal) return

    pushActivity('warning', 'Skipped the agent proposal.')
    setMessages((current) => [
      ...current,
      {
        role: 'assistant',
        kind: 'chat',
        content: `Skipped: ${pendingAgentProposal.summary || 'Agent proposal'}`
      }
    ])
    setPendingAgentProposal(null)
    setPendingAgentStepIndex(0)
  }

  const sendMessage = async () => {
    if (pendingAgentProposal) {
      const operations = Array.isArray(pendingAgentProposal.operations)
        ? pendingAgentProposal.operations
        : []
      const nextExecuteIndex = findNextExecuteIndex(operations, pendingAgentStepIndex + 1)
      if (nextExecuteIndex >= 0) {
        setPendingAgentStepIndex(nextExecuteIndex)
        setStatus('Review the next command and allow or skip it.')
      } else {
        setPendingAgentProposal(null)
        setPendingAgentStepIndex(0)
        setStatus('Agent proposal skipped.')
      }
      return
    }

    const now = Date.now()
    if (rateLimitedUntil > now) {
      const secondsLeft = Math.ceil((rateLimitedUntil - now) / 1000)
      setStatus(`Rate limited. Please wait ${secondsLeft}s and try again.`)
      pushActivity('warning', `Rate limited by provider. Retry in ${secondsLeft}s.`)
      return
    }

    if (!apiKey.trim()) {
      setStatus('Add your API key in Settings before sending agent prompts.')
      pushActivity('warning', 'Missing API key. Open Settings manually to configure it.')
      return
    }
    if (!selectedModel) {
      setStatus('Select a model in Settings before sending agent prompts.')
      pushActivity('warning', 'Missing model selection. Open Settings manually to choose one.')
      return
    }

    const userMessage = { role: 'user', content: input.trim() }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setStatus('Loading response...')
    pushActivity('info', `Thinking about a response for ${selectedModel}.`)
    pushActivity('info', 'Preparing prompt and workspace context.')

    try {
      let systemPrompt = 'You are Sam, a concise coding assistant.'
      if (mode === 'agent') {
        systemPrompt += `
You are working inside this workspace folder path: ${rootFolder || 'NO_WORKSPACE_SELECTED'}.
Active file path: ${activePath || 'NO_ACTIVE_FILE'}.

You can inspect the workspace by proposing terminal commands such as Get-ChildItem, git status, npm run build, npm test, or other read-only checks when needed.
Any command or file-changing action must be proposed first and will be shown to the user for approval before it runs.
When debugging, inspect the folder and relevant files first, then propose the smallest useful command or edit plan.
Only propose the next immediate step, not the whole pipeline. Prefer one command at a time, then wait for its terminal output before proposing another command.
After the command phase is done, you may propose file changes that can be applied automatically without user approval.

CRITICAL ERROR RECOVERY: When a command fails (exit code != 0), analyze the error message and propose a corrected version immediately:
- If "capital letters not allowed" (npm naming): propose lowercase alternative
- If "file not found" or "no such file": propose checking paths first, or create missing files
- If "permission denied": propose using different access methods or tools
- If "not installed" or "command not found": propose installing it or using alternatives
Do NOT ask the user to fix it. Analyze the error and propose the next command to solve it.

When the user asks for changes, respond ONLY with JSON in a single \`\`\`json block using:
{
  "summary": "short summary of what changes you're making",
  "operations": [
    { "action": "create|update|delete|mkdir", "path": "relative/path/from/workspace", "content": "required for create/update" },
    { "action": "execute", "command": "shell command to run", "cwd": "optional working directory" }
  ]
}

Examples of valid operations:
1. Create a new file:
\`\`\`json
{
  "summary": "Creating a new component file",
  "operations": [
    {
      "action": "create",
      "path": "src/components/Button.jsx",
      "content": "import React from 'react';\\n\\nconst Button = ({ children }) => {\\n  return <button className='btn'>{children}</button>;\\n};\\n\\nexport default Button;"
    }
  ]
}
\`\`\`

2. Update an existing file:
\`\`\`json
{
  "summary": "Updating the main App component",
  "operations": [
    {
      "action": "update",
      "path": "src/App.js",
      "content": "import React from 'react';\\nimport Button from './components/Button';\\n\\nfunction App() {\\n  return (\\n    <div className='App'>\\n      <h1>Hello World</h1>\\n      <Button>Click Me</Button>\\n    </div>\\n  );\\n}\\n\\nexport default App;"
    }
  ]
}
\`\`\`

3. Execute a shell command:
\`\`\`json
{
  "summary": "Running a build command",
  "operations": [
    {
      "action": "execute",
      "command": "npm run build",
      "cwd": "./my-project"
    }
  ]
}
\`\`\`

4. Combine file operations and commands:
\`\`\`json
{
  "summary": "Setting up a new React project",
  "operations": [
    { "action": "mkdir", "path": "my-new-app" },
    { "action": "create", "path": "my-new-app/package.json", "content": '{"name": "my-new-app", "version": "1.0.0"}' },
    { "action": "execute", "command": "npm install", "cwd": "./my-new-app" }
  ]
}
\`\`\`

5. Run a Python script:
\`\`\`json
{
  "summary": "Running a Python script",
  "operations": [
    { "action": "execute", "command": "python script.py" }
  ]
}
\`\`\`

Rules:
- Use relative paths under the workspace folder for file operations.
- For delete/mkdir, do not include content.
- For execute actions, do not include path. Use command and optional cwd only.
- For execute actions, provide the command to run and optionally the working directory (cwd).
- If no operations are needed, return operations as an empty array.
- Always provide a clear summary of what changes you're making.
- Always return valid JSON in a single code block.
- You can combine file operations and command execution in the same response.
`
      }

      // Use fetch with AbortController so the UI Stop button can cancel the in-flight request.
      const controller = new AbortController()
      generationAbortRef.current = controller
      const effectiveProvider = getEffectiveProvider(apiKey, apiProvider)

      const requestBody = {
        model: selectedModel,
        messages: [{ role: 'system', content: systemPrompt }, ...nextMessages],
        max_tokens: mode === 'agent' ? 2048 : 512
      }

      let responseText = ''
      if (effectiveProvider === 'ollama') {
        const base = normalizeEndpointOrigin(apiKey, 'http:')
        const resp = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: 'system', content: systemPrompt }, ...nextMessages],
            stream: false
          }),
          signal: controller.signal
        })
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(`Ollama returned ${resp.status}: ${text}`)
        }
        const completion = await resp.json()
        responseText =
          completion?.message?.content ??
          completion?.response ??
          completion?.choices?.[0]?.message?.content ??
          ''
      } else if (effectiveProvider === 'google') {
        const key = String(apiKey || '').trim()
        const url = /^https?:\/\//i.test(key)
          ? key
          : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(key)}`
        const contents = nextMessages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(message.content || '') }]
        }))
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] }
          }),
          signal: controller.signal
        })
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(`Google returned ${resp.status}: ${text}`)
        }
        const completion = await resp.json()
        responseText =
          completion?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') ||
          ''
      } else {
        const endpoint =
          effectiveProvider === 'openai'
            ? 'https://api.openai.com/v1/chat/completions'
            : 'https://openrouter.ai/api/v1/chat/completions'
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
        if (effectiveProvider === 'openrouter') {
          headers['HTTP-Referer'] = 'http://localhost'
          headers['X-Title'] = 'Sam Code'
        }
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        })
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(`${effectiveProvider} returned ${resp.status}: ${text}`)
        }
        const completion = await resp.json()
        responseText = completion?.choices?.[0]?.message?.content ?? ''
      }

      pushActivity('success', 'AI response received.')

      if (mode === 'agent') {
        const payload = extractAgentPayload(responseText)
        if (!payload) {
          setStatus('Agent responded, but no valid JSON operations were found.')
          pushActivity('warning', 'Agent response did not include valid JSON operations.')
          setMessages((current) => [
            ...current,
            {
              role: 'assistant',
              content:
                'I could not execute changes because the model did not return a valid operation payload. Please ask me to create files, modify content, or run commands in a structured way. For example, you can ask me to "Create a new React component called Button.jsx", "Update the App.js file to include a header", or "Run npm install to install dependencies". I need you to be specific about what files you want me to create or modify, or what commands you want me to run.'
            }
          ])
        } else if (!rootFolder) {
          setStatus('Open a folder first so the agent can apply file operations.')
          pushActivity('warning', 'Agent operations skipped because no workspace folder is open.')
          setMessages((current) => [
            ...current,
            {
              role: 'assistant',
              content:
                'Open a workspace folder first, then I can create/update/delete files for you.'
            }
          ])
        } else if (payload.operations.length === 0) {
          setStatus(payload.summary || 'Agent finished with no file changes.')
          pushActivity('info', 'Agent finished with no file changes.')
          setMessages((current) => [
            ...current,
            {
              role: 'assistant',
              content: payload.summary || 'No workspace changes were needed.'
            }
          ])
        } else {
          const firstExecuteIndex = findNextExecuteIndex(payload.operations, 0)

          if (firstExecuteIndex === -1) {
            setPendingAgentProposal(null)
            setPendingAgentStepIndex(0)
            try {
              const fileResultMessage = await executeApprovedAgentOperations(payload)
              setMessages((current) => [
                ...current,
                { role: 'assistant', kind: 'chat', content: fileResultMessage }
              ])
            } catch (error) {
              const message = String(error?.message || error)
              setStatus(`Agent file changes failed: ${message}`)
              pushActivity('error', `Agent file changes failed: ${message}`)
              setMessages((current) => [
                ...current,
                {
                  role: 'assistant',
                  kind: 'chat',
                  content: `Error applying file changes: ${message}`
                }
              ])
            }
          } else {
            setPendingAgentProposal(payload)
            setPendingAgentStepIndex(firstExecuteIndex)
            setStatus('Review the next command and allow or skip it.')
            pushActivity(
              'info',
              `Agent proposed ${payload.operations.length} action(s) for stepwise execution.`
            )
            setMessages((current) => [
              ...current,
              {
                role: 'assistant',
                kind: 'approval',
                operationIndex: firstExecuteIndex,
                operations: payload.operations,
                summary:
                  payload.summary ||
                  'I prepared the first command. Review and choose Allow or Skip.'
              }
            ])
          }
        }
      } else {
        setStatus('Chat response received.')
        setMessages((current) => [
          ...current,
          { role: 'assistant', kind: 'chat', content: responseText }
        ])
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        // generation was cancelled by user
        setStatus('Generation aborted.')
        pushActivity('warning', 'Generation was cancelled.')
        setMessages((current) => [
          ...current,
          { role: 'assistant', content: 'Generation aborted.' }
        ])
      } else {
        console.error(error)
        setMessages((current) => [
          ...current,
          { role: 'assistant', content: 'Error: ' + error.message }
        ])
        if (error?.status === 429) {
          const retryAfter = Number(error?.headers?.['retry-after'] || 15)
          const cooldownMs = Number.isFinite(retryAfter) ? Math.max(5, retryAfter) * 1000 : 15000
          setRateLimitedUntil(Date.now() + cooldownMs)
          setStatus(`OpenRouter rate limit hit (429). Retry in ${Math.ceil(cooldownMs / 1000)}s.`)
          pushActivity(
            'warning',
            `Rate limited (429). Waiting ${Math.ceil(cooldownMs / 1000)}s before retry.`
          )
        } else {
          // Provide more actionable feedback for connection errors
          const effectiveProvider = getEffectiveProvider(apiKey, apiProvider)
          let attempted = ''
          try {
            if (effectiveProvider === 'ollama') {
              attempted = normalizeEndpointOrigin(apiKey, 'http:')
            } else if (effectiveProvider === 'google') {
              attempted = String(apiKey || '').trim()
            } else {
              attempted =
                effectiveProvider === 'openai' ? 'https://api.openai.com' : 'https://openrouter.ai'
            }
          } catch {
            attempted = ''
          }

          const brief = String(error?.message || error)
          if (
            brief.includes('Failed to fetch') ||
            brief.includes('NetworkError') ||
            brief.includes('ECONNREFUSED')
          ) {
            setStatus(
              `Connection refused when contacting ${attempted || 'the API'}. Is the provider running?`
            )
            pushActivity('error', `Connection refused: ${attempted || 'API endpoint'}`)
          } else {
            setStatus('Request failed. Check your API key and network connection.')
            pushActivity('error', `Request failed: ${brief}`)
          }
        }
      }
    } finally {
      generationAbortRef.current = null
      setSending(false)
    }
  }

  const renderDirectory = (dirPath, depth = 0) => {
    const items = tree[dirPath] || []
    return items.map((item) => {
      const isDir = item.isDirectory
      const isOpen = Boolean(expanded[item.path])
      const paddingLeft = `${depth * 14 + 12}px`
      const Icon = iconForPath(item, isOpen)
      const tone = explorerToneForPath(item)
      const isSelected = selectedPaths.has(item.path) || selectedExplorerPath === item.path
      const isDragging = draggedItems?.includes(item.path)

      return (
        <div key={item.path} className="group relative">
          <div
            onClick={(e) => handleItemClick(item.path, isDir, e)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (isDir) {
                setSelectedFolder(item.path)
                setSelectedExplorerPath(item.path)
              } else {
                setSelectedFolder(dirnameFromPath(item.path))
                setSelectedExplorerPath(item.path)
              }
              setContextMenu({
                path: item.path,
                isDir,
                x: event.clientX,
                y: event.clientY
              })
            }}
            draggable
            onDragStart={(e) => handleDragStart(item, e)}
            onDragOver={isDir ? handleDragOver : undefined}
            onDrop={isDir ? (e) => handleDropOnFolder(item.path, e) : undefined}
            role="button"
            aria-expanded={isDir ? isOpen : undefined}
            className={`mx-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-all duration-150 ${isDragging ? 'opacity-50 bg-blue-500/10' : ''} ${isSelected ? 'border-white/10 bg-[#1f2937]' : 'border-transparent hover:border-white/5 hover:bg-white/5'}`}
            style={{ paddingLeft }}
          >
            {isDir ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleDirectory(item.path)
                  }}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center text-gray-400 px-0 py-0 mr-1 transform transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                  aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
                >
                  <ChevronRight size={14} />
                </button>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center ${tone.iconColor}`}
                >
                  <Icon size={16} className="text-current" />
                </span>
              </>
            ) : (
              <span
                className={`flex h-5 w-8 shrink-0 items-center justify-center ${tone.iconColor}`}
              >
                {tone.badge ? (
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    {tone.badge}
                  </span>
                ) : null}
              </span>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {renameTarget === item.path ? (
                <input
                  autoFocus
                  value={renameNewName}
                  onChange={(event) => setRenameNewName(event.target.value)}
                  onBlur={confirmRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      confirmRename()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelRename()
                    }
                  }}
                  onFocus={(event) => event.target.select()}
                  className="min-w-0 flex-1 rounded border border-blue-500/50 bg-[#111827] px-2 py-1 text-xs font-medium text-white outline-none"
                />
              ) : (
                <span
                  className={`truncate ${isSelected ? 'font-medium text-gray-100' : 'text-gray-300'}`}
                >
                  {item.name}
                </span>
              )}
            </div>
          </div>

          {isDir && isOpen && renderDirectory(item.path, depth + 1)}
        </div>
      )
    })
  }

  const activeLanguage = activePath ? languageFromPath(activePath) : 'javascript'
  const activeTab = tabs.find((tab) => tab.path === activePath)
  const activeFileMissing = Boolean(activeTab?.missing)
  const packageInstallationSet = new Set(installedPackages)
  const activeIsHtml = isHtmlFile(activePath)
  const notebookToolbarVisible = activeIsNotebook
  const notebookCells = notebookToolbarVisible ? getNotebookCells() : null
  const selectedNotebookCellIndex = Array.isArray(notebookCells)
    ? activeNotebookCellIndex != null && activeNotebookCellIndex >= 0
      ? activeNotebookCellIndex
      : notebookCells.length > 0
        ? 0
        : -1
    : -1

  const marketplaceCards = [
    {
      id: 'python-notebook-core',
      name: 'Python Notebook Core',
      type: 'Kernel',
      description: 'Runs notebooks cell by cell with rich outputs and notebook state.',
      badge: 'PY',
      accent: 'from-cyan-500/20 to-blue-500/10',
      deps: 'Self-contained notebook runtime'
    },
    {
      id: 'pandas-numpy',
      name: 'Pandas and NumPy',
      type: 'Package',
      description: 'Adds pandas, NumPy and the core data analysis stack for Python notebooks.',
      badge: 'PN',
      accent: 'from-emerald-500/20 to-teal-500/10',
      deps: 'Requires Python Notebook Core'
    },
    {
      id: 'data-science-pack',
      name: 'Data Science Pack',
      type: 'Bundle',
      description:
        'Installs notebook core, pandas, NumPy and common data science tooling together.',
      badge: 'DS',
      accent: 'from-violet-500/20 to-fuchsia-500/10',
      deps: 'Installs notebook core + pandas/numpy'
    },
    {
      id: 'java-language',
      name: 'Java Language Support',
      type: 'Extension',
      description: 'Adds Java snippets, lightweight formatting, and editor helpers for Java files.',
      badge: 'JV',
      accent: 'from-orange-500/20 to-amber-500/10',
      deps: 'Editor helper package'
    }
  ]
  const footerStatus = status

  return (
    <div
      className={`flex h-screen w-screen flex-col ${appearanceMode === 'light' ? 'bg-[#f3f4f6] text-[#111827]' : 'bg-[#1e1e1e] text-white'}`}
    >
      <header
        className={`flex items-center justify-between border-b px-2 py-2 flex-nowrap ${appearanceMode === 'light' ? 'border-gray-200 bg-white' : 'border-black bg-[#252526]'}`}
      >
        <div className="flex items-center gap-0 flex-nowrap min-w-0" data-file-menu>
          <button
            type="button"
            onClick={() => setSidebarOpen((current) => !current)}
            className="rounded p-1 text-gray-300 transition-colors hover:bg-[#3c3c3c] hover:text-white shrink-0"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>

          <div className="relative shrink-0" data-file-menu>
            <button
              type="button"
              onClick={() => setShowFileMenu((current) => !current)}
              className={`rounded px-1.5 py-0.5 text-xs font-semibold transition-colors ${showFileMenu ? 'bg-[#3c3c3c] text-white' : 'text-gray-300 hover:bg-[#3c3c3c] hover:text-white'}`}
            >
              File
            </button>

            {showFileMenu && (
              <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded border border-black bg-[#1f1f1f] p-1 shadow-xl">
                <button
                  type="button"
                  onClick={async () => {
                    setShowFileMenu(false)
                    await openFolder()
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                >
                  Open New Folder
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowFileMenu(false)
                    await openFileDialog()
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                >
                  Open File
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowFileMenu(false)
                    await openNewWindow()
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                >
                  New Window
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowFileMenu(false)
                    await saveCurrentFile()
                  }}
                  disabled={!activePath || saving}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowFileMenu(false)
                    await saveAsCurrentFile()
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                >
                  Save As
                </button>
                <button
                  type="button"
                  onClick={() => setAutoSaveEnabled((current) => !current)}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                >
                  Auto Save {autoSaveEnabled ? 'On' : 'Off'}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setTerminalOpen((current) => !current)}
            className={`rounded px-1.5 py-0.5 text-xs font-semibold transition-colors shrink-0 ${terminalOpen ? 'bg-[#3c3c3c] text-white' : 'text-gray-300 hover:bg-[#3c3c3c] hover:text-white'}`}
          >
            Terminal
          </button>

          <button
            type="button"
            onClick={() => setMarketplaceOpen((current) => !current)}
            className={`rounded px-1.5 py-0.5 text-xs font-semibold transition-colors shrink-0 ${marketplaceOpen ? 'bg-[#1d4ed8] text-white' : 'text-gray-300 hover:bg-[#3c3c3c] hover:text-white'}`}
          >
            Marketplace
          </button>

          <div className="relative shrink-0" data-settings-menu>
            <button
              type="button"
              onClick={() => setShowSettingsMenu((current) => !current)}
              className={`rounded px-1.5 py-0.5 text-xs font-semibold transition-colors ${showSettingsMenu ? 'bg-[#3c3c3c] text-white' : 'text-gray-300 hover:bg-[#3c3c3c] hover:text-white'}`}
            >
              Settings
            </button>

            {showSettingsMenu && (
              <div className="absolute left-0 top-full z-50 mt-2 w-48 rounded border border-black bg-[#1f1f1f] p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsMenu(false)
                    setSettingsSection('preferences')
                    setSettingsOpen(true)
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                >
                  Preferences
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsMenu(false)
                    setSettingsSection('view')
                    setSettingsOpen(true)
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsMenu(false)
                    setSettingsSection('api')
                    setSettingsOpen(true)
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                >
                  API & Models
                </button>
                <div className="my-1 border-t border-black" />
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsMenu(false)
                    setSettingsSection('preferences')
                    setSettingsOpen(true)
                  }}
                  className="w-full rounded px-3 py-2 text-left text-xs font-semibold text-blue-400 hover:bg-[#323232]"
                >
                  ↗ Open Settings Window
                </button>
              </div>
            )}
          </div>

          <div className="relative shrink-0" data-help-menu>
            <button
              type="button"
              onClick={() => setShowHelpMenu((current) => !current)}
              className={`rounded px-1.5 py-0.5 text-xs font-semibold transition-colors ${showHelpMenu ? 'bg-[#3c3c3c] text-white' : 'text-gray-300 hover:bg-[#3c3c3c] hover:text-white'}`}
            >
              Help
            </button>

            {showHelpMenu && (
              <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded border border-black bg-[#1f1f1f] p-3 shadow-xl max-h-96 overflow-y-auto">
                <div className="mb-3 font-semibold text-white text-sm">Keyboard Shortcuts</div>

                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Editor</div>
                  <div className="text-xs text-gray-300 space-y-1">
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+S
                      </span>{' '}
                      Save file
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+Z
                      </span>{' '}
                      Undo
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+Y
                      </span>{' '}
                      Redo
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+A
                      </span>{' '}
                      Select all
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+C
                      </span>{' '}
                      Copy
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+V
                      </span>{' '}
                      Paste
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+X
                      </span>{' '}
                      Cut
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+F
                      </span>{' '}
                      Focus explorer
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">
                    Workspace
                  </div>
                  <div className="text-xs text-gray-300 space-y-1">
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+Alt+N
                      </span>{' '}
                      Open folder
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+T
                      </span>{' '}
                      Toggle terminal
                    </div>
                    <div>
                      <span className="font-mono bg-[#2d2d2d] px-2 py-1 rounded text-yellow-300">
                        Ctrl+K
                      </span>{' '}
                      Toggle agent
                    </div>
                  </div>
                </div>

                <div className="mb-3 pt-2 border-t border-[#2d2d2d]">
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Tips</div>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>
                      • Click the <span className="text-white">Run</span> button or a file to
                      execute code
                    </li>
                    <li>• Agent can create, edit, and delete files in your workspace</li>
                    <li>
                      • Use the <span className="text-white">File</span> menu to manage your project
                    </li>
                    <li>• Toggle light/dark mode in Settings → View</li>
                    <li>• Star your favorite models in Settings → API & Models</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={runCurrentFile}
            disabled={!activePath}
            className="rounded px-1.5 py-0.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-[#3c3c3c] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
          >
            Run
          </button>
        </div>

        <div className="flex items-center gap-0.5 ml-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowAgentPanel((current) => !current)}
            className={`inline-flex items-center rounded p-1 text-xs font-semibold transition-colors ${showAgentPanel ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-[#3c3c3c] hover:text-blue-300'}`}
            aria-label={showAgentPanel ? 'Close agent panel' : 'Open agent panel'}
            title={showAgentPanel ? 'Close agent panel' : 'Open agent panel'}
          >
            <Bot size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {sidebarOpen && (
            <>
              <aside
                style={{ width: `${sidebarWidth}px` }}
                className={`flex min-w-0 flex-col border-r ${appearanceMode === 'light' ? 'border-gray-200 bg-white' : 'border-black bg-[#252526]'}`}
              >
                <div className="flex items-center justify-between border-b border-black/70 bg-linear-to-r from-[#1f2937] to-[#111827] px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <FolderOpen size={14} />
                    Explorer
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={createFileAndStartRename}
                      title="Create file"
                      className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-[#3c3c3c]"
                    >
                      <FileText size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={createFolderAndStartRename}
                      title="Create folder"
                      className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-[#3c3c3c]"
                    >
                      <FolderOpen size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={refreshExplorer}
                      title="Refresh explorer"
                      className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-[#3c3c3c]"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
                <div className="samcode-scrollbar min-h-0 flex-1 overflow-auto py-2">
                  {rootFolder ? (
                    <div>
                      <div className="px-4 pb-2 text-[11px] uppercase tracking-[0.25em] text-gray-500">
                        {rootFolder}
                      </div>
                      {renderDirectory(rootFolder)}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center px-4 text-center text-sm text-gray-400">
                      <p className="mb-4">Open a folder to browse files.</p>
                      <button
                        type="button"
                        onClick={openFolder}
                        className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
                      >
                        Open Folder
                      </button>
                    </div>
                  )}
                </div>
              </aside>

              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={(event) => startResize('sidebar', event)}
                className="w-1 cursor-col-resize bg-black/60 transition-colors hover:bg-blue-500"
              />
            </>
          )}

          <main
            className={`flex min-w-0 flex-1 flex-col ${showAgentPanel ? 'border-r' : ''} ${appearanceMode === 'light' ? 'border-gray-200 bg-[#f8fafc]' : 'border-black bg-[#1e1e1e]'}`}
          >
            {tabs.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto border-b border-black bg-[#2d2d2d] px-2 py-1">
                {tabs.map((tab) => (
                  <div
                    key={tab.path}
                    className={`flex min-w-0 items-center gap-2 rounded px-3 py-2 text-left text-xs transition-colors ${tab.missing ? 'bg-[#351b1b] text-red-200 opacity-75 line-through' : activePath === tab.path ? 'bg-[#1e1e1e] text-white' : 'bg-transparent text-gray-400 hover:bg-[#252526] hover:text-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => openFile(tab.path)}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <FileText size={12} className="shrink-0" />
                      <span className="max-w-40 truncate">{tab.name}</span>
                      {tab.missing && (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200">
                          missing
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeFileTab(tab.path)
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-[#3c3c3c] hover:text-white"
                      aria-label={`Close ${tab.name}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1">
              {activePath ? (
                <div className="relative flex h-full min-h-0 flex-col">
                  {notebookToolbarVisible && (
                    <div className="border-b border-black/70 bg-[#202020] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                          <span className="uppercase tracking-[0.2em]">Add cell</span>
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              const value = event.target.value
                              if (value === 'code') {
                                insertNotebookCell(
                                  'code',
                                  "import pandas as pd\nimport numpy as np\n\nframe = pd.DataFrame({\n    'value': np.arange(5)\n})\nframe",
                                  'Inserted a code cell.'
                                )
                              }
                              if (value === 'markdown') {
                                insertNotebookCell(
                                  'markdown',
                                  '# Notebook Notes\n\nUse this space to explain the analysis or next steps.',
                                  'Inserted a markdown cell.'
                                )
                              }
                              event.target.value = ''
                            }}
                            className="rounded border border-white/10 bg-[#111827] px-2 py-1 text-xs text-white outline-none"
                          >
                            <option value="" disabled>
                              Choose
                            </option>
                            <option value="code">Code cell</option>
                            <option value="markdown">Markdown cell</option>
                          </select>
                        </label>

                        <button
                          type="button"
                          onClick={() => runAllNotebookCells()}
                          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                        >
                          Run all cells
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (selectedNotebookCellIndex >= 0) {
                              runNotebookCell(selectedNotebookCellIndex)
                            }
                          }}
                          className="rounded-full bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-cyan-400"
                        >
                          Run selected cell
                        </button>

                        <button
                          type="button"
                          onClick={() => clearNotebookOutputs()}
                          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                        >
                          Clear all outputs
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={choosePythonVirtualEnv}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                          >
                            Set python virtual env
                          </button>

                          {showPythonEnvironmentMenu && (
                            <div className="absolute right-0 top-full z-30 mt-2 w-[24rem] rounded-xl border border-white/10 bg-[#0f172a] p-3 shadow-2xl shadow-black/30">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="text-xs uppercase tracking-[0.2em] text-gray-400">
                                    Python environments
                                  </div>
                                  <div className="mt-1 text-[11px] text-gray-500">
                                    Choose an interpreter or create a new venv in the current
                                    project.
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await choosePythonVirtualEnv()
                                  }}
                                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white hover:bg-white/10"
                                >
                                  Refresh
                                </button>
                              </div>

                              <div className="mt-3 flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await createPythonVirtualEnv()
                                  }}
                                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-left text-xs text-cyan-100 hover:bg-cyan-500/20"
                                >
                                  Create venv in current folder
                                </button>
                                <button
                                  type="button"
                                  onClick={browsePythonExecutable}
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-gray-200 hover:bg-white/10"
                                >
                                  Browse for Python executable
                                </button>
                              </div>

                              <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/20 p-2">
                                {pythonEnvironmentsLoading ? (
                                  <div className="px-3 py-2 text-xs text-gray-400">
                                    Scanning Python environments...
                                  </div>
                                ) : pythonEnvironments.length > 0 ? (
                                  pythonEnvironments.map((environment) => {
                                    const selected =
                                      String(environment.path || '') === String(venvPath || '')
                                    return (
                                      <button
                                        key={environment.path}
                                        type="button"
                                        onClick={() => selectPythonEnvironment(environment)}
                                        className={`mb-2 w-full rounded-lg border px-3 py-2 text-left transition-colors last:mb-0 ${selected ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-sm font-medium text-white">
                                            {environment.label}
                                          </div>
                                          {selected && (
                                            <div className="rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-black">
                                              Selected
                                            </div>
                                          )}
                                        </div>
                                        <div className="mt-1 break-all text-[11px] text-gray-400">
                                          {environment.path}
                                        </div>
                                      </button>
                                    )
                                  })
                                ) : (
                                  <div className="px-3 py-2 text-xs text-gray-400">
                                    {pythonEnvironmentsError ||
                                      'No Python environments were found. Try browsing for an interpreter or creating a new venv.'}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {venvPath && (
                          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300">
                            {basenameFromPath(venvPath)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="relative min-h-0 flex-1 overflow-auto p-4">
                    {activeIsNotebook ? (
                      (() => {
                        try {
                          const notebook = safeParseNotebook(code || '{}')
                          if (!notebook || !Array.isArray(notebook.cells))
                            throw new Error('Invalid')

                          const updateCellSource = (index, newText) => {
                            updateNotebookDocument(
                              (nb) => {
                                const next = { ...nb }
                                next.cells = next.cells.map((c, i) =>
                                  i === index
                                    ? {
                                        ...c,
                                        source: normalizeNotebookSource(String(newText || ''))
                                      }
                                    : c
                                )
                                return next
                              },
                              `Updated cell ${index + 1}`
                            )
                          }

                          return (
                            <div className="space-y-6">
                              {notebook.cells.map((cell, idx) => (
                                <div
                                  key={idx}
                                  ref={(node) => {
                                    notebookCellRefs.current[idx] = node
                                  }}
                                  onMouseDown={() => setActiveNotebookCellIndex(idx)}
                                  className={`rounded-lg border p-4 ${activeNotebookCellIndex === idx ? 'border-cyan-500/40 bg-white/6 ring-1 ring-cyan-500/20' : 'border-white/8 bg-white/3'}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="text-xs text-gray-300">
                                      {cell.cell_type === 'code'
                                        ? `In [${cell.execution_count ?? ''}]`
                                        : 'Markdown'}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {runningNotebookCellIndex === idx && (
                                        <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
                                          Running...
                                        </div>
                                      )}
                                      <div className="relative">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActiveMenuIndex(activeMenuIndex === idx ? null : idx)
                                          }
                                          className="rounded bg-cyan-500 px-2 py-1 text-xs font-semibold text-black"
                                        >
                                          {activeMenuIndex === idx ? '▲' : 'Run'}
                                        </button>
                                        {activeMenuIndex === idx && (
                                          <div className="absolute right-0 z-10 mt-2 w-24 rounded-md border border-white/20 bg-white/10">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                runNotebookCell(idx)
                                                setActiveMenuIndex(null)
                                              }}
                                              className="block w-full px-2 py-2 text-left text-xs hover:bg-white/20"
                                            >
                                              Run
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                deleteNotebookCell(idx)
                                                setActiveMenuIndex(null)
                                              }}
                                              className="block w-full px-2 py-2 text-left text-xs hover:bg-white/20"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3">
                                    <Editor
                                      height={
                                        notebookCellHeights[idx] ||
                                        getNotebookEditorHeight(
                                          cell,
                                          getNotebookDisplaySource(cell),
                                          cell.cell_type === 'code' ? 220 : 180
                                        )
                                      }
                                      theme="vs-dark"
                                      language={
                                        cell?.metadata?.language ||
                                        (cell.cell_type === 'code' ? 'python' : 'markdown')
                                      }
                                      value={
                                        Array.isArray(cell.source)
                                          ? cell.source.join('')
                                          : String(cell.source || '')
                                      }
                                      onMount={(editor) => {
                                        notebookEditorRefs.current[idx] = editor
                                        const updateNotebookCellHeight = () => {
                                          const nextHeight = getNotebookEditorHeight(
                                            cell,
                                            editor.getValue(),
                                            cell.cell_type === 'code' ? 220 : 180
                                          )
                                          setNotebookCellHeights((current) => {
                                            if (current[idx] === nextHeight) {
                                              return current
                                            }

                                            return { ...current, [idx]: nextHeight }
                                          })
                                        }

                                        updateNotebookCellHeight()
                                        editor.onDidContentSizeChange(updateNotebookCellHeight)
                                        // Always bind Shift+Enter to run the current cell
                                        editor.addCommand(
                                          monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                                          () => {
                                            suppressNextNotebookScroll.current = true
                                            // Fire-and-forget: run cell then advance selection
                                            Promise.resolve(runNotebookCell(idx)).then((ok) => {
                                              if (ok) {
                                                const cells = getNotebookCells()
                                                if (Array.isArray(cells)) {
                                                  const next =
                                                    idx + 1 < cells.length ? idx + 1 : idx
                                                  setActiveNotebookCellIndex(next)
                                                }
                                              }
                                            })
                                          }
                                        )
                                        if (activeNotebookCellIndex === idx) {
                                          editor.focus()
                                        }
                                      }}
                                      onFocus={() => setActiveNotebookCellIndex(idx)}
                                      onChange={(v) => updateCellSource(idx, v)}
                                      options={{
                                        minimap: { enabled: false },
                                        fontSize: 13,
                                        automaticLayout: true,
                                        wordWrap: 'on',
                                        scrollBeyondLastLine: false,
                                        scrollbar: {
                                          vertical: 'hidden',
                                          horizontal: 'hidden',
                                          alwaysConsumeMouseWheel: false
                                        }
                                      }}
                                    />
                                  </div>

                                  {Array.isArray(cell.outputs) && cell.outputs.length > 0 && (
                                    <div className="mt-3 rounded border border-white/6 bg-black/50 p-3 text-sm text-gray-200">
                                      {cell.outputs.map((out, oi) => {
                                        if (
                                          out?.output_type === 'display_data' ||
                                          out?.output_type === 'execute_result'
                                        ) {
                                          return renderNotebookDisplayOutput(out, oi)
                                        }

                                        return (
                                          <pre key={oi} className="whitespace-pre-wrap text-xs">
                                            {formatNotebookOutput(out)}
                                          </pre>
                                        )
                                      })}
                                    </div>
                                  )}

                                  {runningNotebookCellIndex === idx &&
                                    (!Array.isArray(cell.outputs) || cell.outputs.length === 0) && (
                                      <div className="mt-3 rounded border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100">
                                        Running cell...
                                      </div>
                                    )}

                                  {typeof notebookCellHeights[idx] === 'number' && (
                                    <div
                                      style={{ display: 'none' }}
                                      data-height={notebookCellHeights[idx]}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )
                        } catch (e) {
                          return (
                            <div>
                              <div className="text-sm text-red-400">
                                Failed to render notebook: {String(e?.message || e)}
                              </div>
                              <Editor
                                height="100%"
                                theme="vs-dark"
                                language={activeLanguage}
                                value={code}
                                onChange={(value) => setCode(value ?? '')}
                                options={{
                                  minimap: { enabled: false },
                                  fontSize: 14,
                                  automaticLayout: true
                                }}
                              />
                            </div>
                          )
                        }
                      })()
                    ) : (
                      <>
                        {activePath && activePath.toLowerCase().endsWith('.java') && (
                          <div className="bg-[#1e1e1e] border-b border-white/10 px-4 py-2 flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  if (editorMainRef.current && editorMainRef.current.getAction) {
                                    await editorMainRef.current
                                      .getAction('editor.action.formatDocument')
                                      .run()
                                    setStatus('Formatted Java file')
                                    pushActivity('success', 'Formatted Java file')
                                  }
                                } catch (e) {
                                  console.error('Format failed', e)
                                  pushActivity('error', 'Format failed: ' + (e?.message || e))
                                }
                              }}
                              className="rounded px-2 py-1 text-xs font-semibold text-gray-300 bg-[#2d2d2d] hover:bg-[#3c3c3c] hover:text-white transition-colors"
                            >
                              Format
                            </button>
                            <button
                              type="button"
                              onClick={runCurrentFile}
                              className="rounded px-2 py-1 text-xs font-semibold text-gray-300 bg-[#2d2d2d] hover:bg-[#3c3c3c] hover:text-white transition-colors"
                            >
                              Run
                            </button>
                          </div>
                        )}
                        <Editor
                          height="100%"
                          theme="vs-dark"
                          language={activeLanguage}
                          value={code}
                          onMount={(editor) => {
                            editorMainRef.current = editor
                          }}
                          onChange={(value) => setCode(value ?? '')}
                          options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            automaticLayout: true
                          }}
                        />
                        {fileLoading && (
                          <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-black/70 px-3 py-1.5 text-xs text-gray-200 shadow-lg">
                            Loading file...
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center pt-24 text-center text-gray-400 bg-transparent">
                  <Bot size={56} className="mb-6 text-blue-500 opacity-80" />
                  <h2 className="mb-8 text-3xl font-semibold text-white">Welcome to Sam Code</h2>
                  <div className="flex flex-col gap-4 max-w-sm w-full text-left bg-black/20 p-6 rounded-xl border border-white/10 shadow-lg">
                    <button
                      type="button"
                      onClick={openFileDialog}
                      className="text-left text-blue-400 hover:text-blue-300 hover:underline transition-colors text-sm font-medium"
                    >
                      Open file
                    </button>
                    <button
                      type="button"
                      onClick={openFolder}
                      className="text-left text-blue-400 hover:text-blue-300 hover:underline transition-colors text-sm font-medium"
                    >
                      Open folder
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarketplaceOpen(true)}
                      className="text-left text-blue-400 hover:text-blue-300 hover:underline transition-colors text-sm font-medium"
                    >
                      Browse for extensions
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsSection('api')
                        setSettingsOpen(true)
                      }}
                      className="text-left text-blue-400 hover:text-blue-300 hover:underline transition-colors text-sm font-medium"
                    >
                      Add your api for sam code
                    </button>
                    {Array.isArray(recentFolders) && recentFolders.length > 0 && (
                      <div>
                        <div className="mt-3 mb-2 text-sm font-semibold text-gray-200">
                          Recent folders
                        </div>
                        <div className="flex flex-col gap-1">
                          {(showMoreRecent ? recentFolders : recentFolders.slice(0, 4)).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => openRecentFolder(p)}
                              className="text-left text-gray-200 hover:underline hover:text-white text-sm"
                            >
                              <div className="text-sm font-medium">{basenameFromPath(p)}</div>
                              <div className="text-[11px] text-gray-400">{p}</div>
                            </button>
                          ))}
                          {recentFolders.length > 4 && (
                            <button
                              type="button"
                              onClick={() => setShowMoreRecent((s) => !s)}
                              className="text-left text-blue-400 hover:text-blue-300 hover:underline transition-colors text-sm font-medium mt-2"
                            >
                              {showMoreRecent
                                ? 'Show less'
                                : `Show more (${recentFolders.length - 4})`}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </main>

          {showAgentPanel && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={(event) => startResize('right', event)}
                className="w-1 cursor-col-resize bg-black/60 transition-colors hover:bg-blue-500"
              />

              <aside
                style={{ width: `${rightWidth}px` }}
                className={`flex min-w-0 flex-col ${appearanceMode === 'light' ? 'bg-white' : 'bg-[#252526]'}`}
              >
                <div
                  className={`flex items-center justify-between border-b px-3 py-2 ${appearanceMode === 'light' ? 'border-gray-200' : 'border-black'}`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {mode === 'agent' ? 'Agent Mode' : 'Chat Mode'}
                  </div>
                  <div className="text-xs text-gray-500">Use the controls below</div>
                </div>

                <div className="samcode-scrollbar min-h-0 flex-1 overflow-auto p-4">
                  {messages.length === 0 ? (
                    <div className="rounded border border-dashed border-gray-700 p-4 text-center text-sm text-gray-400">
                      <Bot size={24} className="mx-auto mb-2 text-blue-400" />
                      Ask a question or request an edit.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {messages.map((message, index) => (
                        <div key={index}>
                          {message.kind === 'approval' ? (
                            <div className="rounded-lg border border-blue-500/30 bg-[#20252f] p-3 shadow-lg">
                              {(() => {
                                const operations = Array.isArray(message.operations)
                                  ? message.operations
                                  : []
                                const currentOpIdx = message.operationIndex || 0
                                const currentOperation = operations[currentOpIdx]
                                const remainingCommands = operations
                                  .slice(currentOpIdx)
                                  .filter(
                                    (op) => String(op?.action || '').toLowerCase() === 'execute'
                                  ).length
                                const remainingFiles = operations
                                  .slice(currentOpIdx)
                                  .filter(
                                    (op) => String(op?.action || '').toLowerCase() !== 'execute'
                                  ).length

                                return (
                                  <>
                                    <div className="mb-2 flex items-start justify-between gap-3">
                                      <div>
                                        <div className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                                          Approval required
                                        </div>
                                        <div className="mt-1 text-sm text-gray-200">
                                          {message.summary ||
                                            'Review the next agent action before it runs.'}
                                        </div>
                                      </div>
                                      <div className="text-right text-[11px] text-gray-400">
                                        <div>{remainingCommands} command(s)</div>
                                        <div>{remainingFiles} file action(s)</div>
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      {currentOperation ? (
                                        <div className="rounded border border-white/10 bg-black/25 px-3 py-2 text-xs text-gray-200">
                                          <div className="font-medium text-white">
                                            {describeAgentOperation(currentOperation)}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="rounded border border-white/10 bg-black/25 px-3 py-2 text-xs text-gray-200">
                                          File changes will apply automatically.
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-3 flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => skipPendingAgentProposal()}
                                        disabled={approvalBusy}
                                        className="rounded border border-gray-600 bg-[#2b2b2d] px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-[#38383a] disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Skip
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          setTerminalOpen(true)
                                          await approvePendingAgentProposal()
                                        }}
                                        disabled={approvalBusy}
                                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {approvalBusy ? 'Running...' : 'Allow'}
                                      </button>
                                    </div>
                                  </>
                                )
                              })()}
                            </div>
                          ) : (
                            <div
                              className={`max-w-full wrap-break-word rounded-md px-3 py-2 text-sm ${
                                message.role === 'user'
                                  ? 'self-end bg-blue-600 text-white'
                                  : 'self-start bg-[#2b2b2d] text-gray-100'
                              }`}
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <div className="text-[11px] font-medium opacity-80">
                                  {message.role === 'user' ? 'You' : 'Sam'}
                                </div>
                              </div>
                              <div className="whitespace-pre-wrap leading-relaxed text-sm">
                                {message.content}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-black bg-[#1e1e1e] p-3">
                  <div className="relative">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendMessage()
                        }
                      }}
                      rows={3}
                      placeholder={sending ? 'Loading...' : `Ask Sam (${mode})...`}
                      className="w-full resize-none rounded border border-gray-600 bg-[#3c3c3c] px-3 py-2 pr-10 pb-10 text-sm text-white outline-none placeholder:text-gray-400 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={sending || !input.trim()}
                      className="absolute bottom-2 right-2 rounded p-1 text-gray-200 transition-colors hover:text-white disabled:cursor-not-allowed disabled:text-gray-600"
                      aria-label={sending ? 'Sending message' : 'Send message'}
                    >
                      <ChevronUp size={16} />
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-500">
                        {sending ? 'Thinking…' : footerStatus}
                      </div>
                      <div className="flex items-center gap-2">
                        {sending && (
                          <button
                            type="button"
                            onClick={abortGeneration}
                            className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
                          >
                            Stop
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2" data-agent-pickers>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAgentModelMenu(false)
                            setShowModeMenu((current) => !current)
                          }}
                          className="inline-flex items-center gap-2 rounded px-1 py-0.5 text-xs text-gray-200 hover:text-white"
                        >
                          <span>{mode === 'agent' ? 'Agent' : 'Chat'}</span>
                          <span className="text-gray-500">▾</span>
                        </button>
                        {showModeMenu && (
                          <div className="absolute bottom-full left-0 z-50 mb-2 w-40 rounded border border-black bg-[#1f1f1f] p-1 shadow-xl">
                            {['chat', 'agent'].map((nextMode) => (
                              <button
                                key={nextMode}
                                type="button"
                                onClick={() => {
                                  setMode(nextMode)
                                  setShowModeMenu(false)
                                }}
                                className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                              >
                                <span>{nextMode === 'chat' ? 'Chat' : 'Agent'}</span>
                                {mode === nextMode && (
                                  <span className="text-xs text-gray-500">Selected</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="relative min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowModeMenu(false)
                            setShowAgentModelMenu((current) => !current)
                          }}
                          className="inline-flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-xs text-gray-200 hover:text-white"
                        >
                          <span className="truncate">{selectedModel || 'Choose model'}</span>
                          <span className="text-gray-500">▾</span>
                        </button>
                        {showAgentModelMenu && (
                          <div className="absolute bottom-full left-0 z-50 mb-2 max-h-56 w-full overflow-auto rounded border border-black bg-[#1f1f1f] p-1 shadow-xl">
                            {pinnedModelOptions.length ? (
                              <>
                                <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-gray-500">
                                  Pinned Models
                                </div>
                                {pinnedModelOptions.map((model) => (
                                  <button
                                    key={model}
                                    type="button"
                                    onClick={() => {
                                      setSelectedModel(model)
                                      setShowAgentModelMenu(false)
                                    }}
                                    className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                                  >
                                    <span className="truncate">{model}</span>
                                    {selectedModel === model && (
                                      <span className="text-xs text-gray-500">Selected</span>
                                    )}
                                  </button>
                                ))}
                              </>
                            ) : null}

                            {otherModelOptions.length ? (
                              <>
                                <div className="mt-1 px-3 py-1 text-[11px] uppercase tracking-wider text-gray-500">
                                  Other Models
                                </div>
                                {otherModelOptions.map((model) => (
                                  <button
                                    key={model}
                                    type="button"
                                    onClick={() => {
                                      setSelectedModel(model)
                                      setShowAgentModelMenu(false)
                                    }}
                                    className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#323232]"
                                  >
                                    <span className="truncate">{model}</span>
                                    {selectedModel === model && (
                                      <span className="text-xs text-gray-500">Selected</span>
                                    )}
                                  </button>
                                ))}
                              </>
                            ) : null}

                            {!pinnedModelOptions.length && !otherModelOptions.length && (
                              <div className="px-3 py-2 text-xs text-gray-500">
                                No models loaded
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </>
          )}
        </div>

        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={(event) => startResize('terminal', event)}
          className={`h-1 cursor-row-resize bg-black/70 transition-colors hover:bg-blue-500 ${terminalOpen ? 'block' : 'hidden'}`}
        />

        <div
          style={{ height: terminalOpen ? `${terminalHeight}px` : '0px' }}
          className="overflow-hidden border-t border-black bg-[#1e1e1e]"
        >
          <TerminalDock
            open={terminalOpen}
            cwd={rootFolder}
            onClose={() => setTerminalOpen(false)}
            pushActivity={pushActivity}
            command={terminalCommand}
            onCommandExecuted={() => setTerminalCommand('')}
          />
        </div>
      </div>

      {marketplaceOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setMarketplaceOpen(false)}
        >
          <div
            className="w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-linear-to-r from-[#0f172a] to-[#111827] px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Store size={16} />
                  Sam Code Marketplace
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Packages, plugins, kernels and notebook tooling for Sam Code.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMarketplaceOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid max-h-[78vh] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="border-b border-white/10 bg-[#0f172a] p-4 lg:border-b-0 lg:border-r">
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Browse
                </div>
                <div className="space-y-2">
                  {[
                    ['Featured', 'Notebook runtimes and starter packs'],
                    ['Packages', 'Reusable dependencies and helpers'],
                    ['Plugins', 'Editor and workflow extensions'],
                    ['Kernels', 'Execution engines for notebooks']
                  ].map(([label, description]) => (
                    <button
                      key={label}
                      type="button"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10"
                    >
                      <div className="text-sm font-semibold text-white">{label}</div>
                      <div className="mt-1 text-xs text-gray-400">{description}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                  The online catalog will live in the marketplace folder and load lazily into the
                  editor.
                </div>
              </aside>

              <main className="min-h-0 overflow-auto p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">Available extensions</div>
                    <div className="text-xs text-gray-400">
                      Packages will install into isolated folders and stay out of the editor bundle.
                    </div>
                  </div>
                  <label className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300">
                    <Search size={14} className="shrink-0 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search marketplace"
                      className="w-full bg-transparent outline-none placeholder:text-gray-500"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                  {marketplaceCards.map((item) => (
                    <article
                      key={item.id}
                      className={`rounded-2xl border border-white/10 bg-linear-to-br ${item.accent} p-4 shadow-lg shadow-black/20`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{item.name}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-gray-400">
                            {item.type}
                          </div>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-sm font-bold text-white">
                          {item.badge}
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-gray-300">{item.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{item.deps}</span>
                          <span>
                            {installedPackages.includes(item.id)
                              ? 'Installed and available in the workspace UI.'
                              : 'Install to unlock its UI requirements.'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            installedPackages.includes(item.id)
                              ? uninstallMarketplacePackage(item.id)
                              : installMarketplacePackage(item.id)
                          }
                          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-gray-400"
                        >
                          {installedPackages.includes(item.id) ? 'Remove' : 'Install'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-[#111827] p-4 text-sm text-gray-300">
                  Marketplace packages will be downloaded into the local marketplace workspace and
                  loaded on demand.
                </div>
              </main>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="rounded-xl border border-[#404040] bg-[#1f1f1f] shadow-2xl"
            style={{ width: '72rem', maxWidth: 'calc(100vw - 2rem)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-white">Settings</div>
                <div className="text-xs text-gray-400">Preferences, view and API</div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-[#333] hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex border-b border-black bg-[#252526] text-xs font-semibold uppercase tracking-wider text-gray-400">
              {['preferences', 'view', 'api'].map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setSettingsSection(section)}
                  className={`flex-1 px-3 py-2 transition-colors ${settingsSection === section ? 'bg-[#1f1f1f] text-white' : 'hover:bg-[#2f2f2f] hover:text-white'}`}
                >
                  {section}
                </button>
              ))}
            </div>

            <div className="max-h-[75vh] overflow-auto p-5">
              {settingsSection === 'preferences' && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-white">Preferences</div>
                  <label className="flex items-center justify-between rounded border border-gray-700 bg-[#252526] px-3 py-2 text-sm text-gray-200">
                    <span>Auto Save</span>
                    <button
                      type="button"
                      onClick={() => setAutoSaveEnabled((current) => !current)}
                      className={`rounded px-3 py-1 text-xs font-semibold ${autoSaveEnabled ? 'bg-emerald-600 text-white' : 'bg-[#3c3c3c] text-gray-200'}`}
                    >
                      {autoSaveEnabled ? 'On' : 'Off'}
                    </button>
                  </label>
                  <div className="text-xs text-gray-400">
                    Auto save writes the active file shortly after edits.
                  </div>
                </div>
              )}

              {settingsSection === 'view' && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-white">View</div>
                  <div className="rounded border border-gray-700 bg-[#252526] p-3">
                    <div className="mb-2 text-xs uppercase tracking-wider text-gray-500">Zoom</div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => window.api.zoomOut && window.api.zoomOut()}
                        className="flex w-full items-center justify-between rounded bg-[#3c3c3c] px-3 py-2 text-sm text-gray-200 hover:bg-[#4b4b4b]"
                      >
                        <span>Zoom out</span>
                        <span className="text-xs text-gray-500">Ctrl -</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => window.api.zoomIn && window.api.zoomIn()}
                        className="flex w-full items-center justify-between rounded bg-[#3c3c3c] px-3 py-2 text-sm text-gray-200 hover:bg-[#4b4b4b]"
                      >
                        <span>Zoom in</span>
                        <span className="text-xs text-gray-500">Ctrl +</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded border border-gray-700 bg-[#252526] p-3 space-y-2">
                    <div className="mb-1 text-xs uppercase tracking-wider text-gray-500">
                      Appearance
                    </div>
                    <button
                      type="button"
                      onClick={() => setAppearanceMode('dark')}
                      className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm ${appearanceMode === 'dark' ? 'bg-[#3c3c3c] text-white' : 'bg-transparent text-gray-200 hover:bg-[#333]'}`}
                    >
                      <span>Dark mode</span>
                      <span className="text-xs text-gray-500">Current</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAppearanceMode('light')}
                      className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm ${appearanceMode === 'light' ? 'bg-[#3c3c3c] text-white' : 'bg-transparent text-gray-200 hover:bg-[#333]'}`}
                    >
                      <span>Light mode</span>
                      <span className="text-xs text-gray-500">Preview</span>
                    </button>
                  </div>
                </div>
              )}

              {settingsSection === 'api' && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-white">API</div>
                  <label className="block">
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">
                      API Provider
                    </div>
                    <select
                      value={apiProvider}
                      onChange={(e) => setApiProvider(e.target.value)}
                      className="w-full rounded border border-gray-600 bg-[#3c3c3c] px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                    >
                      <option value="auto">Auto detect</option>
                      <option value="openai">OpenAI</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="ollama">Ollama</option>
                      <option value="google">Google</option>
                    </select>
                  </label>

                  <label className="block">
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">
                      API connection / key
                    </div>
                    <input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      type="text"
                      autoComplete="off"
                      spellCheck="false"
                      placeholder="Paste your API key or endpoint"
                      className="w-full rounded border border-gray-600 bg-[#3c3c3c] px-3 py-2 text-sm text-white outline-none placeholder:text-gray-400 focus:border-blue-500"
                    />
                  </label>

                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">
                      Load models for the agent
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => loadModels(apiKey, apiProvider)}
                        disabled={modelsLoading || !apiKey.trim()}
                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                      >
                        {modelsLoading ? 'Loading...' : 'Load Models'}
                      </button>
                      {modelsLoading && (
                        <span className="text-xs text-gray-400">
                          Fetching {apiProvider === 'auto' ? 'provider-specific' : apiProvider}{' '}
                          models...
                        </span>
                      )}
                    </div>
                    {modelsError && <div className="mt-2 text-xs text-red-400">{modelsError}</div>}
                  </div>

                  <label className="block">
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">
                      Model Selection
                    </div>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={!availableModels.length}
                      className="w-full rounded border border-gray-600 bg-[#3c3c3c] px-3 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <option value="">
                        {availableModels.length ? 'Choose a model' : 'Load models first'}
                      </option>
                      {selectedModel &&
                        !availableModels.some((model) => model.id === selectedModel) && (
                          <option value={selectedModel}>{selectedModel} (saved)</option>
                        )}
                      {availableModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded border border-gray-700 bg-[#252526] p-3">
                    <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">
                      Preferred agent models
                    </div>
                    <div className="space-y-2">
                      {preferredModels.map((modelId, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="w-16 text-xs text-gray-500">Slot {index + 1}</span>
                          <select
                            value={modelId}
                            onChange={(e) => updatePreferredModel(index, e.target.value)}
                            className="flex-1 rounded border border-gray-600 bg-[#3c3c3c] px-3 py-2 text-sm text-white outline-none"
                          >
                            {availableModelIds.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                          {index > 0 && preferredModels.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePreferredModelSlot(index)}
                              className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-[#3c3c3c]"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addPreferredModelSlot}
                      disabled={!availableModelIds.length}
                      className="mt-3 rounded bg-[#3c3c3c] px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-[#4b4b4b]"
                    >
                      Add another preferred model
                    </button>
                    <div className="mt-2 text-xs text-gray-400">
                      Keep at least one pinned model. The first model can be edited but not removed.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-96 rounded bg-[#1e1e1e] p-4 shadow-lg">
            <div className="mb-2 text-sm font-semibold">Confirm Delete</div>
            <div className="text-sm text-gray-300">Are you sure you want to delete:</div>
            <div className="mt-2 rounded border border-gray-700 bg-[#252526] px-3 py-2 text-sm text-white wrap-break-word">
              {deleteTarget}
            </div>
            <div className="mt-3 text-xs text-gray-400">
              Use the arrow keys to switch between Delete and Cancel, then press Enter.
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteTarget('')
                  setDeleteConfirmChoice('delete')
                }}
                className={`rounded px-3 py-1 text-sm ${deleteConfirmChoice === 'cancel' ? 'bg-[#3c3c3c] text-white ring-1 ring-white/20' : 'text-gray-300 hover:bg-[#3c3c3c]'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className={`rounded px-3 py-1 text-sm font-semibold text-white ${deleteConfirmChoice === 'delete' ? 'bg-red-500 ring-1 ring-red-200/40' : 'bg-red-600 hover:bg-red-500'}`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onMouseDown={() => setContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault()
            setContextMenu(null)
          }}
        >
          <div
            data-explorer-context-menu
            className="fixed z-50 w-56 rounded-xl border border-white/10 bg-[#111827] p-2 text-sm shadow-2xl shadow-black/40"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              className="w-full rounded-lg px-2 py-1.5 text-left text-gray-200 transition-colors hover:bg-white/5"
              onClick={() => {
                handleCopyPath(contextMenu.path)
                setContextMenu(null)
              }}
            >
              Copy Path
            </button>
            <button
              className="w-full rounded-lg px-2 py-1.5 text-left text-gray-200 transition-colors hover:bg-white/5"
              onClick={() => {
                handleRenameRequest(contextMenu.path)
                setContextMenu(null)
              }}
            >
              Rename (F2)
            </button>
            <button
              className="w-full rounded-lg px-2 py-1.5 text-left text-gray-200 transition-colors hover:bg-white/5"
              onClick={() => {
                handleDeleteRequest(contextMenu.path)
                setContextMenu(null)
              }}
            >
              Delete
            </button>
            <button
              className="w-full rounded-lg px-2 py-1.5 text-left text-gray-200 transition-colors hover:bg-white/5"
              onClick={() => {
                handleClone(contextMenu.path)
                setContextMenu(null)
              }}
            >
              Clone
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed left-1/2 top-4 z-50 flex w-[320px] -translate-x-1/2 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded border px-3 py-2 text-xs shadow-lg backdrop-blur ${toast.kind === 'error' ? 'border-red-500/30 bg-red-950/90 text-red-100' : 'border-amber-500/30 bg-amber-950/90 text-amber-100'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                {toast.kind}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded p-1 opacity-80 transition-opacity hover:bg-black/20 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X size={12} />
              </button>
            </div>
            <div className="mt-0.5 leading-relaxed">{toast.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
