import { useCallback, useMemo } from 'react'
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
import { currentMonth, monthRange } from '../lib/months'
import { buildAllocMap, getEffort, personMonthTotal } from '../lib/totals'

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Person = ReturnType<typeof useStore.getState>['people'][number]
type Grant = ReturnType<typeof useStore.getState>['grants'][number]
type Allocations = ReturnType<typeof useStore.getState>['allocations']

const SENIORITY_ORDER = ['wz', 'hf', 'hx', 'cc', 'dg', 'sl']

export function EffortCharts({
  people,
  grants,
  allocations,
  year,
  selectedGrantId,
  hoveredLabel,
  onHoverLabel,
}: {
  people: Person[]
  grants: Grant[]
  allocations: Allocations
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

  const visiblePeople = useMemo(() => {
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

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold">Effort allocation</h2>
      </div>

      {visiblePeople.length === 0 ? (
        <p className="text-sm text-slate-400">No effort allocated in {year}.</p>
      ) : (
        <div className="space-y-2">
          {visiblePeople.map((person, index) => (
            <PersonEffortChart
              key={person.id}
              person={person}
              grants={visibleGrants}
              allocations={allocations}
              allocMap={allocMap}
              months={windowMonths}
              selectedGrantId={selectedGrantId}
              showXAxisLabels={index === 0}
              hoveredLabel={hoveredLabel}
              onHoverLabel={onHoverLabel}
            />
          ))}
        </div>
      )}
    </section>
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
  showXAxisLabels,
  hoveredLabel,
  onHoverLabel,
}: {
  person: Person
  grants: Grant[]
  allocations: Allocations
  allocMap: ReturnType<typeof buildAllocMap>
  months: string[]
  selectedGrantId: string | null
  showXAxisLabels: boolean
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
    <section className="rounded-md border border-slate-200 bg-white p-2">
      <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
        <h3 className="font-semibold">{person.name}</h3>
        <div className="flex shrink-0 items-center gap-2 text-[10px] tabular-nums text-slate-400">
          {hoveredMonthName && (
            <span className="text-slate-400">{hoveredMonthName}</span>
          )}
          {hoveredItems.map(({ grant, effort }) => (
            <span key={grant.id} className="flex items-center gap-0.5">
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-sm"
                style={{ background: grant.color ?? '#2563eb' }}
              />
              {round(effort)}%
            </span>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            syncId="budget-month"
            margin={{ top: showXAxisLabels ? 24 : 8, right: 24, bottom: 4, left: 48 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              orientation="top"
              tick={showXAxisLabels ? { fill: '#64748b', fontSize: 9 } : false}
              axisLine={showXAxisLabels}
              tickLine={showXAxisLabels}
              height={showXAxisLabels ? 18 : 0}
              interval={0}
              tickFormatter={(label) => MONTH_ABBR[Number(label) - 1] ?? label}
            />
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
