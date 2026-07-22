import { useCallback, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useStore } from '../store/useStore'
import { annualSalaryAt } from '../lib/calc'
import { money } from '../lib/format'
import { currentMonth, formatMonth, monthRange, monthToIndex } from '../lib/months'
import { buildAllocMap, getEffort, personMonthTotal } from '../lib/totals'
import { EffortRangeSummary } from './EffortRangeSummary'

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Person = ReturnType<typeof useStore.getState>['people'][number]
type Grant = ReturnType<typeof useStore.getState>['grants'][number]
type Allocations = ReturnType<typeof useStore.getState>['allocations']
type SalaryRates = ReturnType<typeof useStore.getState>['salaryRates']

const SENIORITY_ORDER = ['wz', 'hf', 'hx', 'cc', 'dg', 'sl']

export function EffortCharts({
  people,
  grants,
  allocations,
  salaryRates,
  year,
  selectedGrantId,
  hoveredLabel,
  onHoverLabel,
}: {
  people: Person[]
  grants: Grant[]
  allocations: Allocations
  salaryRates: SalaryRates
  year: number
  selectedGrantId: string | null
  hoveredLabel: string | null
  onHoverLabel: (label: string | null) => void
}) {
  const allocMap = useMemo(() => buildAllocMap(allocations), [allocations])
  const orderedPeople = useMemo(() => orderPeopleForEffort(people), [people])
  const windowMonths = useMemo(() => monthRange(`${year}-01`, `${year}-12`), [year])
  const visibleGrants = useMemo(
    () => grants.filter((grant) => selectedGrantId == null || grant.id === selectedGrantId),
    [grants, selectedGrantId],
  )

  // People with any effort in the selected year/grant — the candidates the
  // filter chips toggle. Default is to show all of them.
  const peopleThisYear = useMemo(() => {
    const yearPrefix = `${year}-`
    const active = new Set<string>()
    for (const allocation of allocations) {
      if (
        allocation.effort > 0 &&
        allocation.month.startsWith(yearPrefix) &&
        (selectedGrantId == null || allocation.grantId === selectedGrantId)
      ) {
        active.add(allocation.personId)
      }
    }
    return orderedPeople.filter((person) => active.has(person.id))
  }, [allocations, orderedPeople, selectedGrantId, year])

  const [rangeOpen, setRangeOpen] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
  const togglePerson = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const shownPeople = useMemo(
    () => peopleThisYear.filter((person) => !hiddenIds.has(person.id)),
    [peopleThisYear, hiddenIds],
  )

  return (
    <section className="space-y-2">
      {shownPeople.length > 0 && (
        <SalaryRateLine
          people={shownPeople}
          months={windowMonths}
          salaryRates={salaryRates}
          hoveredLabel={hoveredLabel}
        />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-semibold">Effort allocation</h2>
        <button
          type="button"
          onClick={() => setRangeOpen((open) => !open)}
          aria-pressed={rangeOpen}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${
            rangeOpen
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Sum calculator
        </button>
        {peopleThisYear.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            {peopleThisYear.map((person) => {
              const shown = !hiddenIds.has(person.id)
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => togglePerson(person.id)}
                  aria-pressed={shown}
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${
                    shown
                      ? 'border-slate-400 bg-slate-200 text-slate-800 hover:bg-slate-300'
                      : 'border-slate-200 bg-white text-slate-300 hover:text-slate-500'
                  }`}
                >
                  {person.name}
                </button>
              )
            })}
            {hiddenIds.size > 0 && (
              <button
                type="button"
                onClick={() => setHiddenIds(new Set())}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:underline"
              >
                Show all
              </button>
            )}
            {shownPeople.length > 0 && (
              <button
                type="button"
                onClick={() => setHiddenIds(new Set(peopleThisYear.map((person) => person.id)))}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:underline"
              >
                Hide all
              </button>
            )}
          </div>
        )}
      </div>

      {rangeOpen && (
        <EffortRangeSummary
          people={orderedPeople}
          grants={grants}
          allocations={allocations}
          selectedGrantId={selectedGrantId}
          year={year}
        />
      )}

      {peopleThisYear.length === 0 ? (
        <p className="text-sm text-slate-400">No effort allocated in {year}.</p>
      ) : shownPeople.length === 0 ? (
        <p className="text-sm text-slate-400">All people hidden — select someone above.</p>
      ) : (
        <div className="space-y-1">
          {shownPeople.map((person) => (
            <PersonEffortChart
              key={person.id}
              person={person}
              grants={visibleGrants}
              allocations={allocations}
              allocMap={allocMap}
              months={windowMonths}
              selectedGrantId={selectedGrantId}
              hoveredLabel={hoveredLabel}
              onHoverLabel={onHoverLabel}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Single text line above the effort charts: each shown person's annualized
 * salary rate (independent of effort allocation). Follows the month hovered
 * in the charts below; otherwise shows the current month, clamped to the
 * visible year. A person drops out at their termination month.
 */
function SalaryRateLine({
  people,
  months,
  salaryRates,
  hoveredLabel,
}: {
  people: Person[]
  months: string[]
  salaryRates: SalaryRates
  hoveredLabel: string | null
}) {
  const month = useMemo(() => {
    if (hoveredLabel) {
      const match = months.find((m) => String(Number(m.slice(5))) === hoveredLabel)
      if (match) return match
    }
    const current = currentMonth()
    if (months.includes(current)) return current
    return monthToIndex(current) < monthToIndex(months[0]) ? months[0] : months[months.length - 1]
  }, [hoveredLabel, months])

  const rates = useMemo(
    () =>
      people
        .filter(
          (person) =>
            !person.terminationMonth ||
            monthToIndex(month) < monthToIndex(person.terminationMonth),
        )
        .map((person) => ({ person, salary: annualSalaryAt(person, month, salaryRates) }))
        .filter((rate) => rate.salary > 0),
    [month, people, salaryRates],
  )

  if (rates.length === 0) return null

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <h3 className="text-[11px] font-semibold text-slate-700">Annualized salary rate</h3>
      <span className="text-[10px] tabular-nums text-slate-400">{formatMonth(month)}</span>
      {rates.map(({ person, salary }) => (
        <span key={person.id} className="text-[10px] tabular-nums text-slate-500">
          {person.name}{' '}
          <span className="font-semibold text-slate-600">{money(salary)}/yr</span>
        </span>
      ))}
    </div>
  )
}

function orderPeopleForEffort(people: Person[]): Person[] {
  const rank = new Map(SENIORITY_ORDER.map((id, index) => [id, index]))
  return [...people].sort(
    (a, b) =>
      (rank.get(a.id) ?? 100) - (rank.get(b.id) ?? 100) ||
      a.name.localeCompare(b.name),
  )
}

function PersonEffortChart({
  person,
  grants,
  allocations,
  allocMap,
  months,
  selectedGrantId,
  hoveredLabel,
  onHoverLabel,
}: {
  person: Person
  grants: Grant[]
  allocations: Allocations
  allocMap: ReturnType<typeof buildAllocMap>
  months: string[]
  selectedGrantId: string | null
  hoveredLabel: string | null
  onHoverLabel: (label: string | null) => void
}) {
  const grantsForPerson = useMemo(() => {
    const ids = new Set<string>()
    for (const allocation of allocations) {
      if (allocation.personId === person.id) ids.add(allocation.grantId)
    }
    return grants.filter((grant) => ids.has(grant.id))
  }, [allocations, grants, person.id])

  const chartData = useMemo(
    () =>
      months.map((month) => {
        const row: EffortRow = {
          month,
          label: String(Number(month.slice(5))),
          total:
            selectedGrantId == null
              ? personMonthTotal(allocations, person.id, month)
              : getEffort(allocMap, person.id, selectedGrantId, month),
          details: {},
        }
        for (const grant of grantsForPerson) {
          const effort = getEffort(allocMap, person.id, grant.id, month)
          row[grant.id] = effort
          if (effort > 0) row.details[grant.id] = effort
        }
        return row
      }),
    [allocMap, allocations, grantsForPerson, months, person.id, selectedGrantId],
  )

  const currentYearMatches =
    months.length > 0 && currentMonth().slice(0, 4) === months[0].slice(0, 4)

  const handleMouseMove = useCallback(
    (state: any) => {
      onHoverLabel(state?.isTooltipActive ? (state.activeLabel ?? null) : null)
    },
    [onHoverLabel],
  )

  const handleMouseLeave = useCallback(() => onHoverLabel(null), [onHoverLabel])

  const hoveredRow = hoveredLabel ? chartData.find((r) => r.label === hoveredLabel) : null
  const hoveredItems = hoveredRow
    ? grantsForPerson
        .map((g) => ({ grant: g, effort: hoveredRow.details[g.id] ?? 0 }))
        .filter((item) => item.effort > 0)
    : []
  const hoveredMonthName = hoveredLabel
    ? (MONTH_ABBR[Number(hoveredLabel) - 1] ?? hoveredLabel)
    : null

  return (
    <section className="rounded-md border border-slate-200 bg-white p-1.5">
      <div className="flex items-baseline gap-2 px-1">
        <h3 className="shrink-0 text-[11px] font-semibold text-slate-700">{person.name}</h3>
        {hoveredMonthName && (
          <div className="pointer-events-none flex min-w-0 items-center gap-2 overflow-hidden text-[10px] tabular-nums text-slate-400">
            <span className="text-slate-400">{hoveredMonthName}</span>
            {hoveredItems.map(({ grant, effort }) => (
              <span key={grant.id} className="flex shrink-0 items-center gap-0.5">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-sm"
                  style={{ background: grant.color ?? '#2563eb' }}
                />
                <span className="max-w-[7rem] truncate text-slate-500">{grant.name}</span>
                {round(effort)}%
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ width: '100%', height: 46 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            syncId="budget-month"
            margin={{ top: 2, right: 24, bottom: 4, left: 48 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickFormatter={(value) => `${value}%`}
              width={40}
              domain={[0, (max: number) => Math.max(120, Math.ceil(max / 25) * 25)]}
              ticks={[0, 50, 100]}
            />
            {currentYearMatches && (
              <ReferenceLine
                x={String(Number(currentMonth().slice(5)))}
                stroke="#64748b"
                strokeDasharray="3 3"
              />
            )}
            <Tooltip cursor={{ fill: '#e2e8f0', fillOpacity: 0.6 }} content={() => null} />
            <ReferenceLine y={100} stroke="#16a34a" strokeDasharray="4 4" />
            {grantsForPerson.map((grant) => (
              <Bar
                key={grant.id}
                dataKey={grant.id}
                stackId="effort"
                name={grant.name}
                fill={grant.color ?? '#2563eb'}
                maxBarSize={42}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

type EffortRow = {
  month: string
  label: string
  total: number
  details: Record<string, number>
  [grantId: string]: string | number | Record<string, number>
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
