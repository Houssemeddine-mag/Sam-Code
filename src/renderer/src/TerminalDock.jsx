/* eslint-disable react/prop-types, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, no-unused-vars */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { Plus, Terminal as TerminalIcon, X } from 'lucide-react'

function escapeForPowerShell(path) {
  return String(path || '').replaceAll("'", "''")
}

function getCdCommand(shell, cwd) {
  const target = String(cwd || '').trim()
  if (!target) return ''

  if (shell === 'cmd') {
    return `cd /d "${target}"\r\n`
  }

  return `Set-Location -LiteralPath '${escapeForPowerShell(target)}'\r\n`
}

function normalizeTerminalUrl(text) {
  return String(text || '')
    .trim()
    .replace(/[),.;:!?]+$/g, '')
}

function extractTerminalUrls(text) {
  const urls = []
  const pattern = /https?:\/\/[^\s<>'"`]+/gi
  const source = String(text || '')
  let match = null

  while ((match = pattern.exec(source)) !== null) {
    const rawText = normalizeTerminalUrl(match[0])
    if (!rawText) continue

    urls.push({
      rawText,
      start: match.index + 1,
      end: match.index + rawText.length
    })
  }

  return urls
}

function TerminalSession({
  session,
  cwd,
  active,
  focusSignal,
  pushActivity,
  onExit,
  onCommandFinished,
  pendingCommandToken
}) {
  const containerRef = useRef(null)
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)
  const fitTimerRef = useRef(null)
  const promptTimerRef = useRef(null)
  const sessionIdRef = useRef(session.id)
  const dataDisposeRef = useRef(null)
  const exitDisposeRef = useRef(null)
  const linkProviderDisposeRef = useRef(null)
  const initializedRef = useRef(false)
  const previousCwdRef = useRef(cwd)
  const pendingCommandTokenRef = useRef('')
  const pendingCommandOutputRef = useRef('')
  const [status, setStatus] = useState('Starting terminal...')
  const resolvedCwd = String(session.cwd || cwd || '').trim()

  const fitTerminal = () => {
    if (!fitAddonRef.current || !terminalRef.current || !containerRef.current) {
      return false
    }

    const { width, height } = containerRef.current.getBoundingClientRect()
    if (width <= 0 || height <= 0) {
      return false
    }

    try {
      fitAddonRef.current.fit()
    } catch (error) {
      return false
    }

    if (sessionIdRef.current) {
      window.api.resizeTerminal(
        sessionIdRef.current,
        terminalRef.current.cols,
        terminalRef.current.rows
      )
    }

    terminalRef.current.focus()
    refreshPrompt()
    return true
  }

  const refreshPrompt = () => {
    if (!sessionIdRef.current) return
    if (promptTimerRef.current) {
      window.clearTimeout(promptTimerRef.current)
    }
    promptTimerRef.current = window.setTimeout(() => {
      if (sessionIdRef.current) {
        window.api.writeTerminal(sessionIdRef.current, '\r')
      }
    }, 25)
  }

  const clearPendingTimers = () => {
    if (fitTimerRef.current) {
      window.clearTimeout(fitTimerRef.current)
      fitTimerRef.current = null
    }
    if (promptTimerRef.current) {
      window.clearTimeout(promptTimerRef.current)
      promptTimerRef.current = null
    }
  }

  const cleanup = () => {
    clearPendingTimers()

    if (dataDisposeRef.current) {
      dataDisposeRef.current()
      dataDisposeRef.current = null
    }

    if (exitDisposeRef.current) {
      exitDisposeRef.current()
      exitDisposeRef.current = null
    }

    if (linkProviderDisposeRef.current) {
      linkProviderDisposeRef.current.dispose()
      linkProviderDisposeRef.current = null
    }

    if (terminalRef.current) {
      terminalRef.current.dispose()
      terminalRef.current = null
    }

    fitAddonRef.current = null

    if (sessionIdRef.current && window?.api?.disposeTerminal) {
      window.api.disposeTerminal(sessionIdRef.current)
    }

    initializedRef.current = false
    sessionIdRef.current = session.id
  }

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      if (!containerRef.current || !window?.api?.createTerminal) {
        return
      }

      cleanup()

      const terminal = new Terminal({
        cursorBlink: true,
        convertEol: true,
        fontFamily: 'Cascadia Code, Consolas, monospace',
        fontSize: 13,
        scrollback: 5000,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4'
        }
      })
      const fitAddon = new FitAddon()

      terminal.loadAddon(fitAddon)
      terminal.open(containerRef.current)
      terminalRef.current = terminal
      fitAddonRef.current = fitAddon

      linkProviderDisposeRef.current = terminal.registerLinkProvider({
        provideLinks: (bufferLineNumber, callback) => {
          const activeBuffer = terminal.buffer?.active
          const line = activeBuffer?.getLine(bufferLineNumber - 1)
          if (!line) {
            callback(undefined)
            return
          }

          const lineText = line.translateToString(true)
          const links = extractTerminalUrls(lineText).map((entry) => ({
            range: {
              start: { x: entry.start, y: bufferLineNumber },
              end: { x: entry.end, y: bufferLineNumber }
            },
            text: entry.rawText,
            decorations: {
              pointerCursor: true,
              underline: true
            },
            activate: async (_event, text) => {
              const url = normalizeTerminalUrl(text)
              if (url) {
                await window.api.openExternal(url)
              }
            },
            hover: (event, text) => {
              if (event.ctrlKey || event.metaKey) {
                setStatus(`Ctrl+click to open: ${normalizeTerminalUrl(text)}`)
              }
            },
            leave: () => {
              setStatus(`Running ${session.shell} in ${resolvedCwd || 'home'}`)
            }
          }))

          callback(links.length ? links : undefined)
        }
      })

      const created = await window.api.createTerminal({
        sessionId: session.id,
        cwd: resolvedCwd,
        shell: session.shell
      })

      if (cancelled) {
        if (created?.sessionId && window?.api?.disposeTerminal) {
          window.api.disposeTerminal(created.sessionId)
        }
        terminal.dispose()
        return
      }

      sessionIdRef.current = created?.sessionId || session.id
      initializedRef.current = true
      previousCwdRef.current = resolvedCwd
      terminal.writeln(`Sam Code terminal opened in ${resolvedCwd || 'home'}`)
      terminal.writeln('')
      setStatus(`Running ${session.shell} in ${resolvedCwd || 'home'}`)
      pushActivity?.('success', `Opened ${session.title}.`)

      dataDisposeRef.current = window.api.onTerminalData((payload) => {
        if (payload.sessionId === sessionIdRef.current && terminalRef.current) {
          const chunk = String(payload.data || '')
          terminalRef.current.write(chunk)

          if (pendingCommandTokenRef.current) {
            pendingCommandOutputRef.current += chunk
            const buffered = pendingCommandOutputRef.current
            const token = String(pendingCommandTokenRef.current || '')

            if (buffered.includes(token)) {
              const exitCodeMatch = buffered.match(new RegExp(`${token}:(-?\\d+)`))
              const exitCode = exitCodeMatch ? Number(exitCodeMatch[1]) : 0
              const outputBeforeMarker = buffered.slice(0, buffered.indexOf(token)).trim()
              pendingCommandTokenRef.current = ''
              pendingCommandOutputRef.current = ''
              setStatus(`Command finished with code ${exitCode}.`)
              pushActivity?.('success', `Command finished with code ${exitCode}.`)
              try {
                onCommandFinished?.({
                  sessionId: sessionIdRef.current,
                  exitCode,
                  output: outputBeforeMarker
                })
              } catch (e) {
                console.error('Terminal command finished callback error:', e)
              }
            }
          }
        }
      })

      exitDisposeRef.current = window.api.onTerminalExit((payload) => {
        if (payload.sessionId === sessionIdRef.current) {
          setStatus(`Terminal exited with code ${payload.exitCode}.`)
          pushActivity?.('warning', `${session.title} exited with code ${payload.exitCode}.`)
          try {
            onExit?.(payload)
          } catch (e) {
            console.error('Terminal exit callback error:', e)
          }
        }
      })

      terminal.onData((data) => {
        if (sessionIdRef.current) {
          window.api.writeTerminal(sessionIdRef.current, data)
        }
      })

      terminal.onResize(({ cols, rows }) => {
        if (sessionIdRef.current) {
          window.api.resizeTerminal(sessionIdRef.current, cols, rows)
        }
      })

      fitTimerRef.current = window.setTimeout(() => {
        fitTerminal()
      }, 0)
    }

    initialize()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [resolvedCwd, session.id, session.shell])

  useEffect(() => {
    pendingCommandTokenRef.current = String(pendingCommandToken || '')
    if (pendingCommandTokenRef.current) {
      pendingCommandOutputRef.current = ''
    }
  }, [pendingCommandToken])

  useEffect(() => {
    if (!initializedRef.current || !sessionIdRef.current || !resolvedCwd) {
      previousCwdRef.current = resolvedCwd
      return undefined
    }

    if (previousCwdRef.current === resolvedCwd) {
      return undefined
    }

    previousCwdRef.current = resolvedCwd
    const command = getCdCommand(session.shell, resolvedCwd)
    if (command) {
      window.api.writeTerminal(sessionIdRef.current, command)
      pushActivity?.('info', `${session.title} moved to the selected folder.`)
      setStatus(`Running ${session.shell} in ${resolvedCwd}`)
      refreshPrompt()
    }

    return undefined
  }, [resolvedCwd, pushActivity, session.shell, session.title])

  useEffect(() => {
    if (active && terminalRef.current) {
      terminalRef.current.focus()
      fitTerminal()
    }
  }, [active, focusSignal])

  useEffect(() => {
    if (active && fitAddonRef.current && terminalRef.current) {
      fitTimerRef.current = window.setTimeout(() => {
        fitTerminal()
      }, 0)
    }
  }, [active])

  if (!active) {
    return (
      <div
        className="absolute inset-0 h-full min-h-0 opacity-0 pointer-events-none"
        aria-hidden="true"
      >
        <div ref={containerRef} className="h-full min-h-0 w-full" />
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex h-full min-h-0 flex-col bg-[#1e1e1e]">
      <div ref={containerRef} className="min-h-0 flex-1 bg-[#1e1e1e]" />
      <div className="border-t border-black bg-[#252526] px-3 py-1 text-[11px] text-gray-400">
        {status}
      </div>
    </div>
  )
}

function TerminalDock({
  open,
  cwd,
  onClose,
  pushActivity,
  command,
  onCommandExecuted,
  onCommandFinished
}) {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [defaultShell, setDefaultShell] = useState('powershell')
  const nextIndexRef = useRef(1)
  const resolvedCwd = String(cwd || '').trim()
  const pendingCommandRef = useRef('')
  const pendingCommandSessionRef = useRef('')
  const pendingCommandTokenRef = useRef('')
  const [pendingCommandToken, setPendingCommandToken] = useState('')
  const [focusSignal, setFocusSignal] = useState(0)

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0],
    [activeSessionId, sessions]
  )

  const createSession = (shell = defaultShell) => {
    const index = nextIndexRef.current++
    const id = `terminal-${Date.now()}-${index}`
    const nextSession = {
      id,
      title: `Terminal ${index}`,
      shell,
      cwd: resolvedCwd
    }

    setSessions((current) => [...current, nextSession])
    setActiveSessionId(id)
    window.setTimeout(() => {
      pushActivity?.('info', `Opened ${nextSession.title}.`)
    }, 0)
  }

  useEffect(() => {
    if (open && sessions.length === 0) {
      createSession(defaultShell)
    }
  }, [open, sessions.length, defaultShell, resolvedCwd])

  useEffect(() => {
    if (!open || !resolvedCwd) {
      return
    }

    setSessions((current) => current.map((session) => ({ ...session, cwd: resolvedCwd })))
  }, [open, resolvedCwd])

  useEffect(() => {
    if (!open) {
      setSessions([])
      setActiveSessionId('')
    }
  }, [open])

  useEffect(() => {
    if (open && !activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id)
    }
  }, [activeSessionId, open, sessions])

  useEffect(() => {
    if (command && command.trim()) {
      pendingCommandRef.current = command.trim()
      // Create a terminal session if none exist
      if (sessions.length === 0) {
        const index = nextIndexRef.current++
        const id = `terminal-${Date.now()}-${index}`
        const newSession = {
          id,
          title: `Terminal ${index}`,
          shell: defaultShell,
          cwd: resolvedCwd
        }
        setSessions([newSession])
        setActiveSessionId(id)
      }
    }
  }, [command, defaultShell, resolvedCwd, sessions.length])

  useEffect(() => {
    if (
      pendingCommandRef.current &&
      activeSessionId &&
      sessions.some((s) => s.id === activeSessionId)
    ) {
      const cmd = pendingCommandRef.current.trim()
      pendingCommandRef.current = ''

      const activeSession = sessions.find((session) => session.id === activeSessionId)
      const shell = String(activeSession?.shell || defaultShell).toLowerCase()
      const token = `__SAMCODE_DONE__${Date.now()}_${Math.random().toString(16).slice(2)}`
      pendingCommandTokenRef.current = token
      setPendingCommandToken(token)

      // Write the command to the active terminal session
      const wrappedCommand =
        shell === 'cmd'
          ? `${cmd} & echo ${token}:%errorlevel%`
          : `${cmd}; Write-Output "${token}:$LASTEXITCODE"`

      window.api.writeTerminal(activeSessionId, wrappedCommand + '\r\n')
      // mark which session ran the pending command
      pendingCommandSessionRef.current = activeSessionId
      setFocusSignal((current) => current + 1)
      onCommandExecuted?.()
    }
  }, [activeSessionId, sessions, onCommandExecuted, defaultShell])

  const handleSessionExit = (payload) => {
    try {
      const sid = String(payload?.sessionId || '')
      const exitCode = Number(payload?.exitCode)
      if (pendingCommandSessionRef.current && pendingCommandSessionRef.current === sid) {
        pendingCommandSessionRef.current = ''
        pendingCommandTokenRef.current = ''
        try {
          onCommandFinished?.({ sessionId: sid, exitCode })
        } catch (e) {
          console.error('Session exit callback error:', e)
        }
      }
    } catch (e) {
      console.error('Session exit error:', e)
    }
  }

  const closeSession = (sessionId) => {
    setSessions((current) => {
      const nextSessions = current.filter((session) => session.id !== sessionId)
      if (nextSessions.length === 0) {
        window.setTimeout(() => onClose?.(), 0)
      }
      return nextSessions
    })
    setActiveSessionId((currentActiveId) => (currentActiveId === sessionId ? '' : currentActiveId))
  }

  const closeAllSessions = () => {
    setSessions([])
    setActiveSessionId('')
    onClose?.()
  }

  if (!open) {
    return null
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-black bg-[#252526] px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <TerminalIcon size={14} />
            Terminal
          </div>
          <div className="min-w-0 truncate text-[11px] text-gray-500">
            {cwd || 'Open a folder first'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={defaultShell}
            onChange={(e) => setDefaultShell(e.target.value)}
            className="rounded border border-gray-600 bg-[#3c3c3c] px-2 py-1 text-xs text-white outline-none"
          >
            <option value="powershell">PowerShell</option>
            <option value="cmd">Command Prompt</option>
          </select>
          <button
            type="button"
            onClick={() => createSession(defaultShell)}
            className="inline-flex items-center gap-2 rounded bg-[#3c3c3c] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#4b4b4b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={13} />
            New Terminal
          </button>
          <button
            type="button"
            onClick={closeAllSessions}
            className="rounded p-1.5 text-gray-300 transition-colors hover:bg-[#3c3c3c] hover:text-white"
            aria-label="Close terminal pane"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-black bg-[#1e1e1e] px-2 py-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex min-w-0 items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${activeSession?.id === session.id ? 'bg-[#2d2d2d] text-white' : 'bg-transparent text-gray-400 hover:bg-[#252526] hover:text-white'}`}
            >
              <button
                type="button"
                onClick={() => setActiveSessionId(session.id)}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <TerminalIcon size={12} className="shrink-0" />
                <span className="max-w-40 truncate">{session.title}</span>
                <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gray-300">
                  {session.shell}
                </span>
              </button>
              <button
                type="button"
                onClick={() => closeSession(session.id)}
                className="rounded p-1 text-gray-400 hover:bg-[#3c3c3c] hover:text-white"
                aria-label={`Close ${session.title}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => createSession(defaultShell)}
            className="ml-1 inline-flex items-center gap-2 rounded px-2 py-2 text-xs text-gray-400 transition-colors hover:bg-[#252526] hover:text-white"
          >
            <Plus size={12} />
            New
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
            <div>
              <div className="mb-2 text-base font-semibold text-white">
                No terminal sessions open
              </div>
              <div className="mb-4">
                Create a terminal tab to run commands inside the selected folder.
              </div>
              <button
                type="button"
                onClick={() => createSession(defaultShell)}
                className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-600"
              >
                Open Terminal
              </button>
            </div>
          </div>
        ) : (
          sessions.map((session) => (
            <TerminalSession
              key={session.id}
              session={session}
              cwd={cwd}
              active={session.id === activeSession?.id}
              focusSignal={focusSignal}
              pushActivity={pushActivity}
              onExit={handleSessionExit}
              onCommandFinished={onCommandFinished}
              pendingCommandToken={session.id === activeSession?.id ? pendingCommandToken : ''}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default TerminalDock
