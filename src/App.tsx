import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore'
import { parseImportedYAML, parseImportedTXTWithEvents } from './lib/io'
import { Dashboard } from './pages/Dashboard'

declare global {
  interface Window {
    // Set by the single-file build (vite.config.single.ts), which bakes the
    // event text into the HTML so it works from file:// without a server.
    __EMBEDDED_BUDGET_EVENTS__?: string
  }
}

// Local-first simulator seed: budget_events.local.txt is gitignored (point it at
// your canonical event file, e.g. via a symlink) and wins when present; the
// committed budget_events.txt is the demo fallback served on the public site.
const SEED_SOURCES = [
  { url: `${import.meta.env.BASE_URL}budget_events.local.txt`, label: 'public/budget_events.local.txt' },
  { url: `${import.meta.env.BASE_URL}budget_events.txt`, label: 'public/budget_events.txt' },
] as const

async function loadDefaultBudgetEvents(): Promise<{ text: string; label: string }> {
  const embedded = window.__EMBEDDED_BUDGET_EVENTS__
  if (embedded) return { text: embedded, label: 'embedded budget_events.txt' }
  for (const { url, label } of SEED_SOURCES) {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) continue
    const text = await res.text()
    // Dev/preview servers answer missing files with the SPA index.html; skip those.
    if (text.trimStart().startsWith('<')) continue
    return { text, label }
  }
  throw new Error('Could not load budget_events.local.txt or budget_events.txt.')
}

// Verbatim text of the most recently loaded event file, for the Export button.
let loadedEventText = ''

function exportBudgetEvents(): void {
  const blob = new Blob([loadedEventText], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'budget_events.txt'
  anchor.click()
  URL.revokeObjectURL(url)
}

function applyBudgetEvents(text: string, filename: string): void {
  loadedEventText = text
  const ext = filename.toLowerCase().split('.').pop()
  let appData
  let rawEvents: Record<string, any>[] = []

  if (ext === 'txt') {
    const result = parseImportedTXTWithEvents(text)
    appData = result.appData
    rawEvents = result.events
  } else {
    // For YAML, we don't track raw events yet
    appData = parseImportedYAML(text)
  }

  useStore.getState().replaceAll(appData, rawEvents)
}

export default function App() {
  const [sourceName, setSourceName] = useState('public/budget_events.txt')
  const [status, setStatus] = useState('Loading...')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null)
  const fileSignatureRef = useRef<string | null>(null)

  async function loadDefaultSource(): Promise<void> {
    try {
      const { text, label } = await loadDefaultBudgetEvents()
      await loadText(label, async () => text)
    } catch (e) {
      console.error(e)
      setStatus('Load failed')
      setError(e instanceof Error ? e.message : 'Could not load file.')
    }
  }

  async function loadText(label: string, readText: () => Promise<string>): Promise<void> {
    try {
      const text = await readText()
      applyBudgetEvents(text, label)
      setSourceName(label)
      setStatus('Loaded')
      setError(null)
    } catch (e) {
      console.error(e)
      setStatus('Load failed')
      setError(e instanceof Error ? e.message : 'Could not load file.')
    }
  }

  async function loadSelectedFile(handle: FileSystemFileHandle): Promise<void> {
    const file = await handle.getFile()
    const text = await file.text()
    applyBudgetEvents(text, file.name)
    fileSignatureRef.current = fileSignature(file)
    setSourceName(handle.name)
    setStatus('Loaded')
    setError(null)
  }

  async function chooseFile(): Promise<void> {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Event files (YAML or TXT)',
              accept: {
                'text/yaml': ['.yaml', '.yml'],
                'text/plain': ['.yaml', '.yml', '.txt'],
              },
            },
          ],
        })
        if (!handle) return
        fileHandleRef.current = handle
        await loadSelectedFile(handle)
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        console.error(e)
        setStatus('Open failed')
        setError(e instanceof Error ? e.message : 'Could not open file.')
        return
      }
    }

    fileInputRef.current?.click()
  }

  async function reloadCurrentSource(): Promise<void> {
    const handle = fileHandleRef.current
    if (handle) {
      try {
        await loadSelectedFile(handle)
      } catch (e) {
        console.error(e)
        setStatus('Reload failed')
        setError(e instanceof Error ? e.message : 'Could not reload selected file.')
      }
      return
    }
    await loadDefaultSource()
  }

  useEffect(() => {
    void loadDefaultSource()
  }, [])

  // Auto-reload the selected file when it changes on disk (always on).
  useEffect(() => {
    const interval = window.setInterval(() => {
      const handle = fileHandleRef.current
      if (!handle) return

      void handle
        .getFile()
        .then(async (file) => {
          const signature = fileSignature(file)
          if (signature === fileSignatureRef.current) return
          const text = await file.text()
          applyBudgetEvents(text, file.name)
          fileSignatureRef.current = signature
          setStatus('Auto reloaded')
          setError(null)
        })
        .catch((e) => {
          console.error(e)
          setStatus('Watch failed')
          setError(e instanceof Error ? e.message : 'Could not watch selected file.')
        })
    }, 2000)

    return () => window.clearInterval(interval)
  }, [])

  return (
    <>
      <section className="sticky top-0 z-[80] flex items-center gap-3 border-b border-slate-200 bg-white/95 px-5 py-1.5 text-xs text-slate-500 shadow-sm backdrop-blur">
        <span className="truncate font-mono text-slate-700">{sourceName}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void chooseFile()}
            className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50"
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => void reloadCurrentSource()}
            className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={exportBudgetEvents}
            className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50"
          >
            Export
          </button>
          {error
            ? <span className="text-red-600">{error}</span>
            : <span className="text-slate-400">{status}</span>
          }
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml,.txt,text/yaml,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            fileHandleRef.current = null
            fileSignatureRef.current = fileSignature(file)
            void loadText(file.name, () => file.text())
            event.currentTarget.value = ''
          }}
        />
      </section>
      <main className="px-5 pb-5">
        <Routes>
          <Route path="/" element={<Dashboard showEvents />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

function fileSignature(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}
