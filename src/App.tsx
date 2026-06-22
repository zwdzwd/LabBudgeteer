import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore'
import { parseImportedYAML } from './lib/io'
import { Dashboard } from './pages/Dashboard'

const DEFAULT_SOURCE = `${import.meta.env.BASE_URL}budget_events.yaml`

// Read-only simulator seed. Provide your own public/budget_events.yaml (gitignored);
// in local development it is typically a symlink to your canonical event file.
async function loadDefaultBudgetEvents(): Promise<string> {
  const res = await fetch(DEFAULT_SOURCE, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Could not load budget_events.yaml (${res.status}).`)
  return res.text()
}

function applyBudgetEvents(text: string): void {
  useStore.getState().replaceAll(parseImportedYAML(text))
}

export default function App() {
  const [sourceName, setSourceName] = useState('public/budget_events.yaml')
  const [status, setStatus] = useState('Loading default YAML...')
  const [error, setError] = useState<string | null>(null)
  const [watchEnabled, setWatchEnabled] = useState(true)
  const [hasFileHandle, setHasFileHandle] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null)
  const fileSignatureRef = useRef<string | null>(null)

  async function loadText(label: string, readText: () => Promise<string>): Promise<void> {
    try {
      const text = await readText()
      applyBudgetEvents(text)
      setSourceName(label)
      setStatus('Loaded')
      setError(null)
      setLastLoadedAt(new Date())
    } catch (e) {
      console.error(e)
      setStatus('Load failed')
      setError(e instanceof Error ? e.message : 'Could not load YAML.')
    }
  }

  async function loadSelectedFile(handle: FileSystemFileHandle): Promise<void> {
    const file = await handle.getFile()
    const text = await file.text()
    applyBudgetEvents(text)
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
              description: 'YAML files',
              accept: {
                'text/yaml': ['.yaml', '.yml'],
                'text/plain': ['.yaml', '.yml'],
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
    void loadText('public/budget_events.yaml', loadDefaultBudgetEvents)
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
          applyBudgetEvents(text)
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
    <main className="min-w-0 px-5 py-5">
      <section className="sticky top-0 z-[80] mb-0 flex flex-wrap items-center gap-2 rounded-t-md border border-slate-200 bg-white/95 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur">
        <span className="font-semibold text-slate-900">Data</span>
        <span className="max-w-full truncate tabular-nums">{sourceName}</span>
        <button
          type="button"
          onClick={() => void chooseFile()}
          className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
        >
          Open YAML
        </button>
        <button
          type="button"
          onClick={() => void reloadCurrentSource()}
          className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
        >
          Reload
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
          accept=".yaml,.yml,text/yaml,text/plain"
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
  )
}

function fileSignature(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}
