import { useStore } from '../store/useStore'

interface EventEditorProps {
  isOpen: boolean
  onToggle: () => void
}

function getTooltipText(event: any): string {
  const lines = []
  for (const [key, value] of Object.entries(event)) {
    if (value === undefined || value === null || value === '') continue
    lines.push(`${key}: ${value}`)
  }
  return lines.join('\n')
}

function EventLine({ event }: { event: any }) {
  const type = event.type || 'unknown'
  const month = event.month || '—'
  const tooltip = getTooltipText(event)

  return (
    <div
      title={tooltip}
      className="text-slate-700 hover:bg-slate-50 px-2 py-1 rounded cursor-help text-xs leading-relaxed"
    >
      <span className="font-bold text-slate-900">{month}</span>
      {' '}
      <span className="font-semibold text-blue-600">{type}</span>
      {event.grantId && (
        <>
          {' '}
          <span className="underline text-slate-700">{event.grantId}</span>
        </>
      )}
      {event.personId && (
        <>
          {' '}
          <span className="italic text-slate-600">{event.personId}</span>
        </>
      )}
      {event.name && (
        <>
          {' '}
          <span className="text-slate-800">"{event.name}"</span>
        </>
      )}
      {event.amount && (
        <>
          {' '}
          <span className="text-green-700 font-medium">{event.amount}</span>
        </>
      )}
      {event.effort && (
        <>
          {' '}
          <span className="text-orange-700 font-medium">{event.effort}%</span>
        </>
      )}
      {event.annualSalary && (
        <>
          {' '}
          <span className="text-green-700 font-medium">${event.annualSalary.toLocaleString()}</span>
        </>
      )}
      {event.description && (
        <>
          {' '}
          <span className="text-slate-500">— {event.description}</span>
        </>
      )}
    </div>
  )
}

export function EventEditor({ isOpen, onToggle }: EventEditorProps) {
  const { rawEvents } = useStore()

  return (
    <>
      {/* Slide-out Panel */}
      <div
        className={`fixed left-0 top-0 h-screen w-full max-w-3xl bg-white shadow-2xl transform transition-transform duration-300 z-[85] overflow-y-auto ${
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
            <div className="space-y-0 font-mono">
              {rawEvents.map((event, idx) => (
                <EventLine key={idx} event={event} />
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
