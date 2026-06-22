import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore'
import { parseImportedYAML, parseImportedTXTWithEvents } from './lib/io'
import { Dashboard } from './pages/Dashboard'
import { EventEditor } from './components/EventEditor'

const DEFAULT_SOURCE = `${import.meta.env.BASE_URL}budget_events.txt`

// Read-only simulator seed. Provide your own public/budget_events.txt (gitignored);
// in local development it is typically a symlink to your canonical event file.
async function loadDefaultBudgetEvents(): Promise<string> {
  const res = await fetch(DEFAULT_SOURCE, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Could not load budget_events.txt (${res.status}).`)
  return res.text()
}

function applyBudgetEvents(text: string, filename: string): void {
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
  const [watchEnabled, setWatchEnabled] = useState(true)
  const [hasFileHandle, setHasFileHandle] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null)
  const fileSignatureRef = useRef<string | null>(null)

  async function loadText(label: string, readText: () => Promise<string>): Promise<void> {
    try {
      const text = await readText()
      applyBudgetEvents(text, label)
      setSourceName(label)
      setStatus('Loaded')
      setError(null)
      setLastLoadedAt(new Date())
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
    setLastLoadedAt(new Date())
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
        setHasFileHandle(true)
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
    await loadText('public/budget_events.yaml', loadDefaultBudgetEvents)
  }

  useEffect(() => {
    void loadText('public/budget_events.txt', loadDefaultBudgetEvents)
  }, [])

  useEffect(() => {
    if (!watchEnabled || !fileHandleRef.current) return

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
          setLastLoadedAt(new Date())
        })
        .catch((e) => {
          console.error(e)
          setStatus('Watch failed')
          setError(e instanceof Error ? e.message : 'Could not watch selected file.')
        })
    }, 2000)

    return () => window.clearInterval(interval)
  }, [watchEnabled])

  return (
    <>
      <EventEditor isOpen={editorOpen} onToggle={() => setEditorOpen(!editorOpen)} />
      <main className={`min-w-0 px-5 py-5 transition-all duration-300 ${editorOpen ? 'calc-offset' : ''}`} style={editorOpen ? { marginRight: '320px' } : {}}>
        <section className="sticky top-0 z-[80] mb-0 flex flex-wrap items-center gap-2 rounded-t-md border border-slate-200 bg-white/95 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur">
        <span className="font-semibold text-slate-900">Data</span>
        <span className="max-w-full truncate tabular-nums">{sourceName}</span>
        <button
          type="button"
          onClick={() => void chooseFile()}
          className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
        >
          Open File
        </button>
        <button
          type="button"
          onClick={() => void reloadCurrentSource()}
          className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setEditorOpen(!editorOpen)}
          className={`rounded border px-2 py-1 font-medium transition-colors ${
            editorOpen
              ? 'bg-slate-900 text-white border-slate-900'
              : 'border-slate-200 text-slate-900 hover:bg-slate-50'
          }`}
        >
          Events
        </button>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={watchEnabled}
            disabled={!hasFileHandle}
            onChange={(event) => setWatchEnabled(event.target.checked)}
          />
          Auto reload
        </label>
        <span className="text-slate-400">
          {status}
          {lastLoadedAt ? ` at ${lastLoadedAt.toLocaleTimeString()}` : ''}
        </span>
        {error && <span className="font-medium text-red-600">{error}</span>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml,.txt,text/yaml,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            fileHandleRef.current = null
            setHasFileHandle(false)
            fileSignatureRef.current = fileSignature(file)
            void loadText(file.name, () => file.text())
            event.currentTarget.value = ''
          }}
        />
      </section>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
    </>
  )
}

function fileSignature(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}
