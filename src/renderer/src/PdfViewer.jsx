/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Download, Loader2 } from 'lucide-react'

function PdfViewer({ filePath, pushActivity }) {
  const iframeRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [fileName, setFileName] = useState('')
  const [blobUrl, setBlobUrl] = useState('')
  const objectUrlRef = useRef(null)
  const pushActivityRef = useRef(pushActivity)

  // Keep pushActivity ref current without triggering re-renders
  useEffect(() => {
    pushActivityRef.current = pushActivity
  }, [pushActivity])

  useEffect(() => {
    if (!filePath) {
      setLoading(false)
      return
    }

    // Store cleanup function
    let cancelled = false

    const loadPdf = async () => {
      setLoading(true)
      setError('')
      
      const name = filePath.split(/[\\/]/).pop() || 'document.pdf'
      setFileName(name)

      try {
        const result = await window.api?.readFileAsArrayBuffer?.(filePath)

        if (!result) {
          throw new Error('Failed to read PDF file')
        }

        if (!result.ok) {
          throw new Error(result.error || 'Unknown error reading PDF')
        }

        setFileSize(result.size)

        const uint8Array = new Uint8Array(result.buffer)
        const blob = new Blob([uint8Array], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        
        // Clean up previous URL
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
        }
        
        objectUrlRef.current = url
        setBlobUrl(url)
        setLoading(false)

        pushActivityRef.current?.('success', `Opened ${name} (${(result.size / 1024).toFixed(0)}KB)`)
      } catch (err) {
        if (!cancelled) {
          setError(String(err?.message || err))
          setLoading(false)
          pushActivityRef.current?.('error', `Failed to open PDF: ${err?.message || err}`)
        }
      }
    }

    loadPdf()

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [filePath])

  const handleDownload = async () => {
    try {
      if (blobUrl) {
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = fileName || 'document.pdf'
        a.click()
      }
    } catch (err) {
      pushActivity?.('error', `Download failed: ${err?.message || err}`)
    }
  }

  const handleZoomIn = () => {
    const iframe = iframeRef.current
    if (iframe) {
      try {
        iframe.contentWindow?.postMessage({ action: 'zoomIn' }, '*')
      } catch {
        // Cross-origin iframe
      }
    }
  }

  const handleZoomOut = () => {
    const iframe = iframeRef.current
    if (iframe) {
      try {
        iframe.contentWindow?.postMessage({ action: 'zoomOut' }, '*')
      } catch {
        // Cross-origin iframe
      }
    }
  }

  const handleFitWidth = () => {
    const iframe = iframeRef.current
    if (iframe) {
      try {
        iframe.contentWindow?.postMessage({ action: 'fitWidth' }, '*')
      } catch {
        // Cross-origin iframe
      }
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#1e1e1e]">
        <Loader2 size={32} className="mb-4 animate-spin text-blue-400" />
        <div className="text-sm font-medium text-gray-300">Loading PDF...</div>
        <div className="mt-1 text-xs text-gray-500">{fileName}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#1e1e1e] px-6 text-center">
        <div className="mb-3 text-red-400">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="text-sm font-medium text-red-300">Failed to load PDF</div>
        <div className="mt-1 max-w-sm text-xs text-gray-400">{error}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
        >
          Reload
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-black bg-[#252526] px-3 py-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 shrink-0">
            PDF Viewer
          </div>
          <div className="text-[11px] text-gray-500 truncate max-w-xs" title={filePath}>
            {fileName}
          </div>
          {fileSize > 0 && (
            <div className="text-[11px] text-gray-600 shrink-0">
              {(fileSize / 1024).toFixed(0)}KB
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleZoomOut}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-[#3c3c3c] hover:text-white"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-[#3c3c3c] hover:text-white"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={handleFitWidth}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-[#3c3c3c] hover:text-white"
            title="Fit to width"
          >
            <Maximize2 size={14} />
          </button>
          <div className="mx-1 h-4 w-px bg-gray-600" />
          <button
            type="button"
            onClick={handleDownload}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-[#3c3c3c] hover:text-white"
            title="Download PDF"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* PDF iframe */}
      <div className="flex-1 min-h-0 bg-[#2d2d2d]">
        <iframe
          ref={iframeRef}
          src={blobUrl}
          className="w-full h-full border-0"
          title={`PDF: ${fileName}`}
          style={{ backgroundColor: '#2d2d2d' }}
        />
      </div>
    </div>
  )
}

export default PdfViewer