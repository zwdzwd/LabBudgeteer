import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { eventTypeColor } from '../lib/eventTypes'

const FIELD_ORDER = [
  'month',
  'type',
  'grantId',
  'personId',
  'name',
  'effort',
  'capAtTotal',
  'amount',
  'annualSalary',
  'startMonth',
  'endMonth',
  'budget',
  'budgetStartMonth',
  'accountType',
  'nextReportMonth',
  'description',
]

function getTooltipLines(event: Record<string, any>): Array<[string, string]> {
  const seen = new Set<string>()
  const lines: Array<[string, string]> = []
  const push = (key: string) => {
    const value = event[key]
    if (value === undefined || value === null || value === '') return
    seen.add(key)
    lines.push([key, String(value)])
  }
  FIELD_ORDER.forEach(push)
  for (const key of Object.keys(event)) {
    if (!seen.has(key)) push(key)
  }
  return lines
}

function EventTooltip({ event }: { event: Record<string, any> }) {
  const lines = getTooltipLines(event)
  return (
    <div className="rounded-md border border-slate-200 bg-white/45 px-3 py-2 text-xs text-slate-700 shadow-lg backdrop-blur-sm space-y-0.5">
      {lines.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <span className="min-w-20 font-semibold text-blue-600">{key}</span>
          <span className="break-words text-slate-800">{value}</span>
        </div>
      ))}
    </div>
  )
}

function EventLine({
  event,
  onHover,
}: {
  event: Record<string, any>
  onHover?: (event: Record<string, any> | null) => void
}) {
  const [hover, setHover] = useState(false)
  const type = event.type || 'unknown'
  // The viewer is already scoped to one year, so show just the month-of-year
  // (e.g. "02"); the full "2026-02" remains in the tooltip.
  const rawMonth = event.month ? String(event.month) : ''
  const month = rawMonth.includes('-') ? rawMonth.slice(rawMonth.indexOf('-') + 1) : rawMonth || '—'

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        setHover(true)
        onHover?.(event)
      }}
      onMouseLeave={() => {
        setHover(false)
        onHover?.(null)
      }}
    >
      {/* Single truncated line. overflow-hidden lives here, NOT on the
          positioning parent, so the tooltip below is never clipped. */}
      <div className="truncate rounded px-2 py-0.5 text-[11px] leading-relaxed hover:bg-slate-50">
        <span className="font-bold tabular-nums text-slate-900">{month}</span>{' '}
        <span className="font-semibold" style={{ color: eventTypeColor(event.type) }}>
          {type}
        </span>
        {event.grantId && <span className="ml-1 text-slate-700 underline">{event.grantId}</span>}
        {event.personId && <span className="ml-1 italic text-slate-600">{event.personId}</span>}
        {event.name && <span className="ml-1 text-slate-800">"{event.name}"</span>}
        {event.amount != null && (
          <span className="ml-1 font-medium text-green-700">{event.amount}</span>
        )}
        {event.effort != null && (
          <span className="ml-1 font-medium text-orange-700">{event.effort}%</span>
        )}
        {event.annualSalary != null && (
          <span className="ml-1 font-medium text-green-700">
            ${Number(event.annualSalary).toLocaleString()}
          </span>
        )}
        {event.description && <span className="ml-1 text-slate-500">— {event.description}</span>}
      </div>

      {/* Tooltip */}
      <div
        className={`absolute left-0 top-full z-50 mt-0.5 w-max max-w-xs pointer-events-none transition-opacity duration-75 ${
          hover ? 'opacity-100' : 'invisible opacity-0'
        }`}
      >
        <EventTooltip event={event} />
      </div>
    </div>
  )
}

interface EventListProps {
  year?: number
  selectedGrantId?: string | null
  selectedGrantName?: string | null
  onClearGrant?: () => void
  onHoverEvent?: (
    event: { month: string; grantId?: string | null; type?: string } | null,
  ) => void
}

export function EventList({
  year,
  selectedGrantId,
  selectedGrantName,
  onClearGrant,
  onHoverEvent,
}: EventListProps = {}) {
  const rawEvents = useStore((s) => s.rawEvents)
  const [typeFilter, setTypeFilter] = useState('all')

  const yearStr = year != null ? String(year) : null

  const types = useMemo(() => {
    const set = new Set<string>()
    for (const e of rawEvents) if (e.type) set.add(String(e.type))
    return [...set].sort()
  }, [rawEvents])

  const filtered = useMemo(() => {
    return rawEvents.filter((e) => {
      if (selectedGrantId && e.grantId !== selectedGrantId) return false
      if (yearStr && String(e.month ?? '').slice(0, 4) !== yearStr) return false
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      return true
    })
  }, [rawEvents, selectedGrantId, yearStr, typeFilter])

  return (
    <aside className="flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white/95 shadow-sm backdrop-blur lg:w-72 lg:shrink-0">
      <div className="border-b border-slate-200 bg-slate-100 px-3 py-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
          <span>Events</span>
          <span className="font-normal text-slate-500">
            {filtered.length}
            {filtered.length !== rawEvents.length ? ` / ${rawEvents.length}` : ''}
          </span>
        </div>

        {/* Grant filter chip (driven by snapshot / chart selection) */}
        {selectedGrantId && (
          <button
            type="button"
            onClick={onClearGrant}
            className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
            title="Clear grant filter"
          >
            <span className="truncate">{selectedGrantName ?? selectedGrantId}</span>
            <span className="text-slate-400">✕</span>
          </button>
        )}

        {/* Type filter (year follows the global year selector) */}
        <div className="mt-1.5">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1 font-mono">
        {rawEvents.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">No events loaded</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">No events match the filters</p>
        ) : (
          filtered.map((event, idx) => (
            <EventLine
              key={idx}
              event={event}
              onHover={(e) =>
                onHoverEvent?.(
                  e ? { month: String(e.month), grantId: e.grantId, type: e.type } : null,
                )
              }
            />
          ))
        )}
      </div>
    </aside>
  )
}
