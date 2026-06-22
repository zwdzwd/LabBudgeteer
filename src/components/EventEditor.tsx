import { useState } from 'react'
import { useStore } from '../store/useStore'

interface EventEditorProps {
  isOpen: boolean
  onToggle: () => void
}

function getTooltipLines(event: any): Array<[string, string]> {
  const lines: Array<[string, string]> = []
  const order = ['month', 'type', 'grantId', 'personId', 'name', 'effort', 'amount', 'annualSalary', 'startMonth', 'endMonth', 'accountType', 'description']

  for (const key of order) {
    const value = event[key]
    if (value === undefined || value === null || value === '') continue
    lines.push([key, String(value)])
  }

  // Add remaining keys not in order
  for (const [key, value] of Object.entries(event)) {
    if (!order.includes(key) && value !== undefined && value !== null && value !== '') {
      lines.push([key, String(value)])
    }
  }

  return lines
}

function EventTooltip({ event }: { event: any }) {
  const lines = getTooltipLines(event)

  return (
    <div className="bg-slate-900/95 text-white rounded-lg p-3 shadow-xl border border-slate-700 space-y-1.5 text-xs max-w-sm">
      {lines.map(([key, value], idx) => (
        <div key={idx} className="flex gap-2">
          <span className="font-semibold text-blue-300 min-w-24">{key}:</span>
          <span className="text-slate-100 break-words">{value}</span>
        </div>
      ))}
    </div>
  )
}

function EventLine({ event }: { event: any }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const type = event.type || 'unknown'
  const month = event.month || '—'

  return (
    <div
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      className="relative group text-slate-700 hover:bg-slate-50 px-2 py-1 rounded text-xs leading-relaxed"
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

      {/* Custom Tooltip */}
      <div
        className={`absolute left-0 top-full mt-1 z-50 pointer-events-none transition-opacity duration-100 ${
          showTooltip ? 'opacity-100' : 'opacity-0 invisible'
        }`}
      >
        <EventTooltip event={event} />
      </div>
    </div>
  )
}

export function EventEditor({ isOpen, onToggle }: EventEditorProps) {
  const { rawEvents } = useStore()

  return (
    <>
      {/* Slide-out Panel */}
      <div
        className={`fixed right-0 top-0 h-screen w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 z-50 overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
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

    </>
  )
}
