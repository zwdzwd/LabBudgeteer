import { useMemo, useState } from 'react'
import { formatMonth, isMonth, monthRange, monthToIndex } from '../lib/months'
import { effortOverRange } from '../lib/totals'
import { useStore } from '../store/useStore'

type Person = ReturnType<typeof useStore.getState>['people'][number]
type Grant = ReturnType<typeof useStore.getState>['grants'][number]
type Allocations = ReturnType<typeof useStore.getState>['allocations']

// Panel that sums person-months per person and grant over a picked month
// range. Person-months = sum of monthly effort / 100, all months weighted
// equally; effort is the salary share recorded in the event file.
export function EffortRangeSummary({
  people,
  grants,
  allocations,
  selectedGrantId,
  year,
}: {
  people: Person[]
  grants: Grant[]
  allocations: Allocations
  selectedGrantId: string | null
  year: number
}) {
  const [start, setStart] = useState(`${year}-01`)
  const [end, setEnd] = useState(`${year}-12`)

  // Prefill ranges relative to the chart year: fiscal year (Jul-Jun), academic
  // year (Sep-Aug), fiscal quarters, and calendar year.
  const presets = useMemo(() => {
    const yy = String(year).slice(2)
    return [
      { label: `FY${yy}`, start: `${year - 1}-07`, end: `${year}-06` },
      { label: `AY${yy}`, start: `${year - 1}-09`, end: `${year}-08` },
      { label: 'Q1', start: `${year - 1}-07`, end: `${year - 1}-09` },
      { label: 'Q2', start: `${year - 1}-10`, end: `${year - 1}-12` },
      { label: 'Q3', start: `${year}-01`, end: `${year}-03` },
      { label: 'Q4', start: `${year}-04`, end: `${year}-06` },
      { label: `CY${yy}`, start: `${year}-01`, end: `${year}-12` },
    ]
  }, [year])

  const valid = isMonth(start) && isMonth(end) && monthToIndex(start) <= monthToIndex(end)
  const nMonths = valid ? monthRange(start, end).length : 0

  const byPerson = useMemo(
    () => (valid ? effortOverRange(allocations, start, end, selectedGrantId) : new Map<string, Map<string, number>>()),
    [allocations, start, end, selectedGrantId, valid],
  )

  const grantsById = useMemo(() => new Map(grants.map((g) => [g.id, g])), [grants])
  const rows = useMemo(
    () =>
      people
        .filter((person) => byPerson.has(person.id))
        .map((person) => {
          const cells = [...(byPerson.get(person.id) ?? new Map<string, number>())]
            .map(([grantId, personMonths]) => ({ grant: grantsById.get(grantId), grantId, personMonths }))
            .sort((a, b) => b.personMonths - a.personMonths)
          const total = cells.reduce((sum, cell) => sum + cell.personMonths, 0)
          return { person, cells, total }
        }),
    [byPerson, grantsById, people],
  )

  const selectedGrantName = selectedGrantId ? grantsById.get(selectedGrantId)?.name ?? null : null

  return (
    <section className="rounded-md border border-slate-200 bg-white p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {presets.map((preset) => {
          const active = preset.start === start && preset.end === end
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setStart(preset.start)
                setEnd(preset.end)
              }}
              title={`${formatMonth(preset.start)} – ${formatMonth(preset.end)}`}
              aria-pressed={active}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition ${
                active
                  ? 'border-slate-400 bg-slate-200 text-slate-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-slate-500">
          From
          <input
            type="month"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="rounded border border-slate-200 px-1.5 py-0.5 tabular-nums text-slate-700"
          />
        </label>
        <label className="flex items-center gap-1 text-slate-500">
          to
          <input
            type="month"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="rounded border border-slate-200 px-1.5 py-0.5 tabular-nums text-slate-700"
          />
        </label>
        {valid && (
          <span className="text-slate-400">
            {nMonths} month{nMonths === 1 ? '' : 's'}, {formatMonth(start)} – {formatMonth(end)}
            {selectedGrantName ? `, ${selectedGrantName} only` : ''}
          </span>
        )}
      </div>

      {!valid ? (
        <p className="mt-2 text-slate-400">Pick a valid range (start month must not be after end month).</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-slate-400">No effort allocated in this range.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-[24rem] border-collapse tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-4 font-semibold">Person</th>
                <th className="py-1 pr-4 font-semibold">Grant</th>
                <th className="py-1 pr-4 text-right font-semibold">Avg effort</th>
                <th className="py-1 text-right font-semibold">Person-months</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, cells, total }) => (
                [
                  ...cells.map(({ grant, grantId, personMonths }, index) => (
                    <tr key={`${person.id}|${grantId}`} className="border-b border-slate-100">
                      <td className="py-1 pr-4 font-medium text-slate-700">
                        {index === 0 ? person.name : ''}
                      </td>
                      <td className="py-1 pr-4 text-slate-600">
                        <span className="flex items-center gap-1">
                          <span
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-sm"
                            style={{ background: grant?.color ?? '#94a3b8' }}
                          />
                          {grant?.name ?? grantId}
                        </span>
                      </td>
                      <td className="py-1 pr-4 text-right text-slate-600">
                        {round1((personMonths / nMonths) * 100)}%
                      </td>
                      <td className="py-1 text-right text-slate-600">{round2(personMonths)}</td>
                    </tr>
                  )),
                  cells.length > 1 && (
                    <tr key={`${person.id}|total`} className="border-b border-slate-200">
                      <td className="py-1 pr-4" />
                      <td className="py-1 pr-4 font-semibold text-slate-700">Total</td>
                      <td className="py-1 pr-4 text-right font-semibold text-slate-700">
                        {round1((total / nMonths) * 100)}%
                      </td>
                      <td className="py-1 text-right font-semibold text-slate-700">{round2(total)}</td>
                    </tr>
                  ),
                ]
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            Person-months = sum of monthly effort / 100 over the {nMonths}-month range; avg effort
            = person-months / {nMonths} months. Effort is the salary share in the event file, so a
            part-time appointment reads as its salary share, not FTE.
          </p>
        </div>
      )}
    </section>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
