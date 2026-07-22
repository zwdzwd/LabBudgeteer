import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { eventTypeColor } from '../lib/eventTypes'
import { parseEventLine } from '../lib/io'
import { addMonth, currentMonth, maxMonth, minMonth, monthRange } from '../lib/months'

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
  onEdit,
}: {
  event: Record<string, any>
  onHover?: (event: Record<string, any> | null) => void
  onEdit?: () => void
}) {
  const [hover, setHover] = useState(false)
  const type = event.type || 'unknown'
  // The viewer is already scoped to one year, so show just the month-of-year
  // (e.g. "02"); the full "2026-02" remains in the tooltip.
  const rawMonth = event.month ? String(event.month) : ''
  const month = rawMonth.includes('-') ? rawMonth.slice(rawMonth.indexOf('-') + 1) : rawMonth || '—'

  return (
    <div
      className="group relative"
      onMouseEnter={() => {
        setHover(true)
        onHover?.(event)
      }}
      onMouseLeave={() => {
        setHover(false)
        onHover?.(null)
      }}
    >
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          title="Edit this event"
          className="absolute right-1 top-0 z-10 hidden rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-500 hover:bg-slate-100 group-hover:block"
        >
          ✎
        </button>
      )}
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

// Structured form editor for one event, mirroring the zod schemas in io.ts.
// The form serializes to a pipe-delimited line in the file's own style
// (numbers and ids unquoted, other values quoted), so saving goes through the
// same line-level recompile-and-validate path as raw edits.

type FieldKind = 'text' | 'number' | 'month' | 'select' | 'grantId' | 'personId'
type FieldSpec = { key: string; kind: FieldKind; required?: boolean; options?: string[]; hint?: string }

const TYPE_FIELDS: Record<string, FieldSpec[]> = {
  grant_start: [
    { key: 'grantId', kind: 'text' },
    { key: 'name', kind: 'text', required: true },
    { key: 'grtNumber', kind: 'text' },
    { key: 'sponsor', kind: 'text' },
    { key: 'accountType', kind: 'select', options: ['flexible', 'regular', 'supplemental'] },
    { key: 'endMonth', kind: 'month' },
    { key: 'budget', kind: 'number' },
    { key: 'budgetStartMonth', kind: 'month' },
    { key: 'nextReportMonth', kind: 'month' },
    { key: 'fringeRate', kind: 'number', hint: 'e.g. 0.233' },
    { key: 'info', kind: 'text' },
  ],
  grant_renew: [
    { key: 'grantId', kind: 'grantId' },
    { key: 'name', kind: 'text' },
    { key: 'amount', kind: 'text', hint: '1000 reset, +1000 add, -1000 subtract' },
    { key: 'renewalId', kind: 'text' },
    { key: 'nextReportMonth', kind: 'month' },
    { key: 'description', kind: 'text' },
    { key: 'info', kind: 'text' },
  ],
  grant_cost: [
    { key: 'grantId', kind: 'grantId' },
    { key: 'expenseId', kind: 'text', hint: 'auto-generated if blank' },
    { key: 'name', kind: 'text' },
    { key: 'amount', kind: 'number', required: true, hint: 'positive = cost, negative = supplement' },
    { key: 'description', kind: 'text' },
  ],
  grant_end: [
    { key: 'grantId', kind: 'grantId' },
    { key: 'name', kind: 'text' },
  ],
  personnel_salary_rate: [
    { key: 'personId', kind: 'personId' },
    { key: 'name', kind: 'text' },
    { key: 'annualSalary', kind: 'number', required: true },
  ],
  personnel_cover: [
    { key: 'grantId', kind: 'grantId' },
    { key: 'personId', kind: 'personId' },
    { key: 'name', kind: 'text' },
    { key: 'effort', kind: 'number', required: true, hint: '% of salary charged' },
    { key: 'capAtTotal', kind: 'number', hint: 'cap on total effort across grants' },
    { key: 'startMonth', kind: 'month', required: true },
    { key: 'endMonth', kind: 'month', required: true },
  ],
  personnel_terminate: [
    { key: 'personId', kind: 'personId' },
    { key: 'name', kind: 'text' },
  ],
}

const EVENT_TYPES = Object.keys(TYPE_FIELDS)

// grantId / personId are conventionally unquoted in the file; every other
// string value is quoted. Numbers stay raw so they parse as numbers.
const UNQUOTED_KEYS = new Set(['grantId', 'personId'])

function serializeToken(key: string, value: string, kind: FieldKind): string {
  if (kind === 'number') return `${key}:${value}`
  if (UNQUOTED_KEYS.has(key) && !/\s/.test(value)) return `${key}:${value}`
  return `${key}:"${value}"`
}

function serializeEventLine(
  month: string,
  type: string,
  values: Record<string, string>,
  extras: Array<[string, unknown]>,
): string {
  const tokens: string[] = []
  for (const spec of TYPE_FIELDS[type] ?? []) {
    const value = (values[spec.key] ?? '').trim()
    if (value === '') continue
    tokens.push(serializeToken(spec.key, value, spec.kind))
  }
  for (const [key, raw] of extras) {
    if (typeof raw === 'number' || typeof raw === 'boolean') tokens.push(`${key}:${raw}`)
    else tokens.push(serializeToken(key, String(raw), 'text'))
  }
  return `${month} | ${type}${tokens.length ? ' | ' + tokens.join(' ') : ''}`
}

function valuesFromEvent(event: Record<string, any> | null, type: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const spec of TYPE_FIELDS[type] ?? []) {
    const raw = event?.[spec.key]
    values[spec.key] = raw === undefined || raw === null ? '' : String(raw)
  }
  return values
}

// Full-width drawer that slides over the top of the page. Rendered through a
// portal because ancestors with backdrop-filter would otherwise become the
// containing block for position:fixed.
function EventForm({
  title,
  initialEvent,
  initialRaw,
  defaultMonth,
  onSave,
  onCancel,
  onDelete,
}: {
  title: string
  initialEvent: Record<string, any> | null
  initialRaw?: string
  defaultMonth: string
  onSave: (line: string) => string | null
  onCancel: () => void
  onDelete?: () => string | null
}) {
  const grants = useStore((s) => s.grants)
  const people = useStore((s) => s.people)
  const settings = useStore((s) => s.settings)

  // The event object the form fields are derived from; replaced when the user
  // returns from raw mode so hand-typed keys survive the switch.
  const [baseEvent, setBaseEvent] = useState(initialEvent)
  const [type, setType] = useState(String(initialEvent?.type ?? 'grant_cost'))
  const [month, setMonth] = useState(String(initialEvent?.month ?? defaultMonth))
  const [values, setValues] = useState<Record<string, string>>(() =>
    valuesFromEvent(initialEvent, String(initialEvent?.type ?? 'grant_cost')),
  )
  const [touched, setTouched] = useState(false)
  const [rawDraft, setRawDraft] = useState<string | null>(null) // non-null = raw mode
  const [error, setError] = useState<string | null>(null)

  function backToForm() {
    const parsed = parseEventLine(rawDraft ?? '')
    if (!parsed) {
      setError('Cannot parse this line into the form; expected "YYYY-MM | type | key:value ...".')
      return
    }
    const parsedType = String(parsed.type ?? 'grant_cost')
    setBaseEvent(parsed)
    setType(parsedType)
    setMonth(String(parsed.month ?? defaultMonth))
    setValues(valuesFromEvent(parsed, parsedType))
    setTouched(true)
    setRawDraft(null)
    setError(null)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Keys on the base event not covered by the current type's form fields;
  // they are preserved verbatim on save so the form never drops data.
  const extras = useMemo(() => {
    if (!baseEvent) return [] as Array<[string, unknown]>
    const covered = new Set(['month', 'type', ...(TYPE_FIELDS[type] ?? []).map((f) => f.key)])
    return Object.entries(baseEvent).filter(([key]) => !covered.has(key))
  }, [baseEvent, type])

  // All months of the plan window, for month dropdowns (native month inputs
  // degrade to plain text in Safari). Falls back to grants' span, then to a
  // window around today; the currently-set month is always included.
  const monthOptions = useMemo(() => {
    let start = settings.startMonth
    let end = settings.endMonth
    if (!start || !end) {
      for (const grant of grants) {
        start = start ? minMonth(start, grant.startMonth) : grant.startMonth
        end = end ? maxMonth(end, grant.endMonth) : grant.endMonth
      }
    }
    if (!start || !end) {
      start = addMonth(currentMonth(), -24)
      end = addMonth(currentMonth(), 24)
    }
    const options = monthRange(start, end)
    for (const extra of [month, ...Object.values(values)]) {
      if (/^\d{4}-\d{2}$/.test(extra) && !options.includes(extra)) options.push(extra)
    }
    return options.sort()
  }, [settings, grants, month, values])

  const setField = (key: string, value: string) => {
    setTouched(true)
    setValues((prev) => {
      const next = { ...prev, [key]: value }
      // Selecting a known person/grant fills the name field: for personnel_*
      // events name refers to the person, for grant_* events to the grant.
      if (key === 'personId') {
        const person = people.find((p) => p.id === value)
        if (person) next.name = person.name
      } else if (key === 'grantId' && !type.startsWith('personnel')) {
        const grant = grants.find((g) => g.id === value)
        if (grant) next.name = grant.name
      }
      return next
    })
  }

  const switchType = (nextType: string) => {
    setTouched(true)
    setType(nextType)
    setValues((prev) => ({ ...valuesFromEvent(baseEvent, nextType), ...pickShared(prev, nextType) }))
  }

  const currentLine = () => {
    const finalValues = { ...values }
    // Auto-generate an expenseId for new costs so one-off charges stay
    // individually identifiable (e.g. idf-lab-consumables-2026-07).
    if (initialEvent === null && type === 'grant_cost' && !finalValues.expenseId?.trim()) {
      const slug = (finalValues.description ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .split('-')
        .slice(0, 3)
        .join('-')
      finalValues.expenseId = `${finalValues.grantId?.trim() || 'cost'}-${slug || 'expense'}-${month}`
    }
    return serializeEventLine(month, type, finalValues, extras)
  }

  const inputClass =
    'w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800'
  const labelClass = 'mb-0.5 block text-[10px] font-semibold text-slate-500'

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onCancel} />
      <div className="absolute inset-x-0 top-0 max-h-[85vh] overflow-y-auto border-b border-slate-300 bg-white shadow-xl">
        <div className="mx-auto max-w-5xl space-y-3 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          {rawDraft !== null ? (
            <textarea
              value={rawDraft}
              onChange={(event) => setRawDraft(event.target.value)}
              rows={4}
              spellCheck={false}
              className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs leading-relaxed text-slate-800"
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                <div>
                  <label className={labelClass}>
                    month<span className="text-red-400">*</span>
                  </label>
                  <select
                    value={month}
                    onChange={(event) => {
                      setTouched(true)
                      setMonth(event.target.value)
                    }}
                    className={inputClass}
                  >
                    {monthOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    type<span className="text-red-400">*</span>
                  </label>
                  <select
                    value={type}
                    onChange={(event) => switchType(event.target.value)}
                    className={inputClass}
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                {(TYPE_FIELDS[type] ?? []).map((spec) => (
                  <FormField
                    key={spec.key}
                    spec={spec}
                    value={values[spec.key] ?? ''}
                    onChange={(value) => setField(spec.key, value)}
                    inputClass={inputClass}
                    labelClass={labelClass}
                    monthOptions={monthOptions}
                    idOptions={
                      spec.kind === 'grantId'
                        ? grants.map((g) => ({ id: g.id, name: g.name }))
                        : spec.kind === 'personId'
                          ? people.map((p) => ({ id: p.id, name: p.name }))
                          : []
                    }
                  />
                ))}
              </div>
              {extras.length > 0 && (
                <p className="text-[10px] text-slate-400">
                  kept as-is: {extras.map(([key]) => key).join(', ')}
                </p>
              )}
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setError(onSave(rawDraft !== null ? rawDraft : currentLine()))}
              className="rounded border border-slate-900 bg-slate-900 px-3 py-1 font-medium text-white hover:bg-slate-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            {rawDraft === null ? (
              <button
                type="button"
                onClick={() => setRawDraft(!touched && initialRaw ? initialRaw : currentLine())}
                title="Edit the raw pipe-delimited line"
                className="rounded border border-slate-200 px-3 py-1 text-slate-500 hover:bg-slate-100"
              >
                raw
              </button>
            ) : (
              <button
                type="button"
                onClick={backToForm}
                title="Parse the line back into form fields"
                className="rounded border border-slate-200 px-3 py-1 text-slate-500 hover:bg-slate-100"
              >
                form
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => setError(onDelete())}
                className="ml-auto rounded border border-red-200 px-3 py-1 text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Carry values whose key also exists in the new type's fields across a type
// switch (month/grantId/personId/name usually survive).
function pickShared(prev: Record<string, string>, nextType: string): Record<string, string> {
  const keep: Record<string, string> = {}
  for (const spec of TYPE_FIELDS[nextType] ?? []) {
    if (prev[spec.key]) keep[spec.key] = prev[spec.key]
  }
  return keep
}

const NEW_ID_SENTINEL = '__new__'

// Dropdown of known ids with a "+ new id..." escape into a free-text input;
// the ▾ button returns to the dropdown.
function IdPicker({
  value,
  onChange,
  options,
  inputClass,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ id: string; name: string }>
  inputClass: string
}) {
  const [manual, setManual] = useState(
    () => value !== '' && !options.some((option) => option.id === value),
  )

  if (manual) {
    return (
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          placeholder="type a new id"
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
        <button
          type="button"
          title="Choose an existing id instead"
          onClick={() => setManual(false)}
          className="shrink-0 rounded border border-slate-300 px-1.5 text-xs text-slate-500 hover:bg-slate-100"
        >
          ▾
        </button>
      </div>
    )
  }

  return (
    <select
      value={options.some((option) => option.id === value) ? value : ''}
      onChange={(event) => {
        if (event.target.value === NEW_ID_SENTINEL) {
          setManual(true)
          onChange('')
        } else {
          onChange(event.target.value)
        }
      }}
      className={inputClass}
    >
      <option value=""></option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.id} ({option.name})
        </option>
      ))}
      <option value={NEW_ID_SENTINEL}>+ new id…</option>
    </select>
  )
}

function FormField({
  spec,
  value,
  onChange,
  inputClass,
  labelClass,
  monthOptions,
  idOptions,
}: {
  spec: FieldSpec
  value: string
  onChange: (value: string) => void
  inputClass: string
  labelClass: string
  monthOptions: string[]
  idOptions: Array<{ id: string; name: string }>
}) {
  return (
    <div>
      <label className={labelClass}>
        {spec.key}
        {spec.required && <span className="text-red-400">*</span>}
      </label>
      {spec.kind === 'select' ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          <option value=""></option>
          {(spec.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : spec.kind === 'month' ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          <option value=""></option>
          {monthOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : spec.kind === 'grantId' || spec.kind === 'personId' ? (
        <IdPicker value={value} onChange={onChange} options={idOptions} inputClass={inputClass} />
      ) : (
        <input
          type="text"
          inputMode={spec.kind === 'number' ? 'decimal' : undefined}
          value={value}
          placeholder={spec.hint}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}
    </div>
  )
}

export function EventList({
  year,
  selectedGrantId,
  selectedGrantName,
  onClearGrant,
  onHoverEvent,
}: EventListProps = {}) {
  const rawEvents = useStore((s) => s.rawEvents)
  const eventLineNumbers = useStore((s) => s.eventLineNumbers)
  const sourceText = useStore((s) => s.sourceText)
  const dirty = useStore((s) => s.dirty)
  const editEventLine = useStore((s) => s.editEventLine)
  const addEventLine = useStore((s) => s.addEventLine)
  const deleteEventLine = useStore((s) => s.deleteEventLine)
  const [typeFilter, setTypeFilter] = useState('all')
  // Index into rawEvents being edited, or 'new' for the add form.
  const [editing, setEditing] = useState<number | 'new' | null>(null)

  const yearStr = year != null ? String(year) : null
  const sourceLines = useMemo(() => sourceText.split('\n'), [sourceText])

  const types = useMemo(() => {
    const set = new Set<string>()
    for (const e of rawEvents) if (e.type) set.add(String(e.type))
    return [...set].sort()
  }, [rawEvents])

  const filtered = useMemo(() => {
    return rawEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event: e }) => {
        if (selectedGrantId && e.grantId !== selectedGrantId) return false
        if (yearStr && String(e.month ?? '').slice(0, 4) !== yearStr) return false
        if (typeFilter !== 'all' && e.type !== typeFilter) return false
        return true
      })
  }, [rawEvents, selectedGrantId, yearStr, typeFilter])

  // New events default to the current month when browsing the current year,
  // else to January of the displayed year.
  const defaultMonth =
    yearStr && !currentMonth().startsWith(yearStr) ? `${yearStr}-01` : currentMonth()

  return (
    <aside className="flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white/95 shadow-sm backdrop-blur lg:w-72 lg:shrink-0">
      <div className="border-b border-slate-200 bg-slate-100 px-3 py-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
          <span>
            Events
            {dirty && (
              <span className="ml-1.5 font-normal text-amber-600" title="In-page edits are not saved to disk until you Export">
                edited
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(editing === 'new' ? null : 'new')}
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-normal text-slate-600 hover:bg-slate-50"
            >
              + Add
            </button>
            <span className="font-normal text-slate-500">
              {filtered.length}
              {filtered.length !== rawEvents.length ? ` / ${rawEvents.length}` : ''}
            </span>
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
          filtered.map(({ event, index }) => (
            <EventLine
              key={index}
              event={event}
              onEdit={() => setEditing(index)}
              onHover={(e) =>
                onHoverEvent?.(
                  e ? { month: String(e.month), grantId: e.grantId, type: e.type } : null,
                )
              }
            />
          ))
        )}
      </div>

      {editing === 'new' && (
        <EventForm
          title="Add event"
          initialEvent={null}
          defaultMonth={defaultMonth}
          onSave={(line) => {
            const error = addEventLine(line)
            if (!error) setEditing(null)
            return error
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {typeof editing === 'number' && (
        <EventForm
          title="Edit event"
          initialEvent={rawEvents[editing] ?? null}
          initialRaw={sourceLines[eventLineNumbers[editing]] ?? ''}
          defaultMonth={defaultMonth}
          onSave={(line) => {
            const error = editEventLine(editing, line)
            if (!error) setEditing(null)
            return error
          }}
          onCancel={() => setEditing(null)}
          onDelete={() => {
            const error = deleteEventLine(editing)
            if (!error) setEditing(null)
            return error
          }}
        />
      )}
    </aside>
  )
}
