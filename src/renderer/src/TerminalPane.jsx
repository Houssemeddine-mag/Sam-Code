/* eslint-disable react/prop-types, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { PanelLeftClose, RotateCcw } from 'lucide-react'

function TerminalPane({ open, cwd, onClose, pushActivity }) {
  const containerRef = useRef(null)
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)
  const sessionIdRef = useRef('')
  const disposeDataRef = useRef(null)
  const disposeExitRef = useRef(null)
  const resizeObserverRef = useRef(null)
  const [shell, setShell] = useState('powershell')
  const [sessionCounter, setSessionCounter] = useState(0)
  const [status, setStatus] = useState('Terminal closed')

  const cleanupTerminal = async () => {
    if (disposeDataRef.current) {
      disposeDataRef.current()
      disposeDataRef.current = null
    }

    if (disposeExitRef.current) {
      disposeExitRef.current()
      disposeExitRef.current = null
    }

    if (sessionIdRef.current && window?.api?.disposeTerminal) {
      await window.api.disposeTerminal(sessionIdRef.current)
    }

    sessionIdRef.current = ''

    if (terminalRef.current) {
      terminalRef.current.dispose()
      terminalRef.current = null
    }

    fitAddonRef.current = null
  }

  const startTerminal = async () => {
    if (!open || !cwd || !containerRef.current || !window?.api?.createTerminal) {
      return
    }

    await cleanupTerminal()

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
    terminal.focus()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const session = await window.api.createTerminal({ cwd, shell })
    sessionIdRef.current = session.sessionId
    terminal.writeln(`Sam Code terminal opened in ${cwd}`)
    terminal.writeln('')
    setStatus(`Running ${shell} in ${cwd}`)
    pushActivity?.('success', `Opened terminal in ${cwd}.`)

    disposeDataRef.current = window.api.onTerminalData((payload) => {
      if (payload.sessionId === session.sessionId && terminalRef.current) {
        terminalRef.current.write(payload.data)
      }
    })

    disposeExitRef.current = window.api.onTerminalExit((payload) => {
      if (payload.sessionId === session.sessionId) {
        setStatus(`Terminal exited with code ${payload.exitCode}.`)
        pushActivity?.('warning', `Terminal exited with code ${payload.exitCode}.`)
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

    queueMicrotask(() => {
      fitAddon.fit()
      if (sessionIdRef.current) {
        window.api.resizeTerminal(sessionIdRef.current, terminal.cols, terminal.rows)
      }
    })
  }

  useEffect(() => {
    if (!open || !cwd) {
      cleanupTerminal()
      setStatus(open ? 'Open a folder to start a terminal.' : 'Terminal closed')
      return undefined
    }

    startTerminal()

    return () => {
      cleanupTerminal()
    }
  }, [open, cwd, shell, sessionCounter])

  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        if (sessionIdRef.current) {
          window.api.resizeTerminal(
            sessionIdRef.current,
            terminalRef.current.cols,
            terminalRef.current.rows
          )
        }
      }
    }

    window.addEventListener('resize', handleResize)
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserverRef.current = new ResizeObserver(handleResize)
      resizeObserverRef.current.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
        resizeObserverRef.current = null
      }
    }
  }, [])

  if (!open) {
    return null
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-black bg-[#252526] px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Terminal
          </div>
          <div className="text-[11px] text-gray-500">{cwd || 'Open a folder first'}</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={shell}
            onChange={(e) => setShell(e.target.value)}
            className="rounded border border-gray-600 bg-[#3c3c3c] px-2 py-1 text-xs text-white outline-none"
          >
            <option value="powershell">PowerShell</option>
            <option value="cmd">Command Prompt</option>
          </select>
          <button
            type="button"
            onClick={() => setSessionCounter((current) => current + 1)}
            className="inline-flex items-center gap-2 rounded bg-[#3c3c3c] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#4b4b4b]"
          >
            <RotateCcw size={13} />
            New Terminal
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-gray-300 transition-colors hover:bg-[#3c3c3c] hover:text-white"
            aria-label="Close terminal"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-[#1e1e1e]" ref={containerRef} />
      <div className="border-t border-black bg-[#252526] px-3 py-1 text-[11px] text-gray-400">
        {status}
      </div>
    </div>
  )
}

export default TerminalPane
