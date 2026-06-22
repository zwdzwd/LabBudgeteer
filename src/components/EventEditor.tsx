import { useStore } from '../store/useStore'

interface EventEditorProps {
  isOpen: boolean
  onToggle: () => void
}

function formatEventLine(event: any, idx: number): string {
  const parts = [
    `${idx + 1}.`,
    event.month,
    event.type,
  ]

  if (event.grantId) parts.push(`grant:${event.grantId}`)
  if (event.personId) parts.push(`person:${event.personId}`)
  if (event.name) parts.push(`"${event.name}"`)
  if (event.amount) parts.push(`amount:${event.amount}`)
  if (event.effort) parts.push(`effort:${event.effort}%`)
  if (event.annualSalary) parts.push(`salary:$${event.annualSalary}`)
  if (event.description) parts.push(`— ${event.description}`)

  return parts.join(' ')
}

export function EventEditor({ isOpen, onToggle }: EventEditorProps) {
  const { rawEvents } = useStore()

  return (
    <>
      {/* Slide-out Panel */}
      <div
        className={`fixed left-0 top-0 h-screen w-full max-w-2xl bg-white shadow-2xl transform transition-transform duration-300 z-[85] overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-100 border-b p-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Events ({rawEvents.length})
          </h2>
          <button
            onClick={onToggle}
            className="text-slate-600 hover:text-slate-900 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-3">
          {rawEvents.length === 0 ? (
            <p className="text-xs text-slate-500">No events loaded</p>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {rawEvents.map((event, idx) => (
                <div
                  key={idx}
                  className="text-slate-700 hover:bg-slate-50 px-2 py-1 rounded"
                >
                  {formatEventLine(event, idx)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-[84]"
          onClick={onToggle}
        />
      )}
    </>
  )
}
