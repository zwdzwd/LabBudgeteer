import { useMemo } from 'react'
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
import { currentMonth, formatMonth, monthRange } from '../lib/months'
import { buildAllocMap, getEffort, personMonthTotal } from '../lib/totals'
import { annualSalaryAt } from '../lib/calc'
import { money } from '../lib/format'

/** X-axis tick: just the month number, e.g. "2024-10" -> "10". */
function monthTickLabel(month: string): string {
  return String(Number(month.slice(5)))
}

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
}: {
  people: Person[]
  grants: Grant[]
  allocations: Allocations
  salaryRates: SalaryRates
  year: number
  selectedGrantId: string | null
}) {
  const allocMap = useMemo(() => buildAllocMap(allocations), [allocations])
  const orderedPeople = useMemo(() => orderPeopleForEffort(people), [people])
  const windowMonths = useMemo(() => monthRange(`${year}-01`, `${year}-12`), [year])
  const visibleGrants = useMemo(
    () => grants.filter((grant) => selectedGrantId == null || grant.id === selectedGrantId),
    [grants, selectedGrantId],
  )

  // Only show a person whose effort is non-zero somewhere in the visible year,
  // so e.g. departed staff drop off once the year has no allocations for them.
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 2xl:grid-cols-8">
          {visiblePeople.map((person) => (
            <PersonEffortChart
              key={person.id}
              person={person}
              grants={visibleGrants}
              allocations={allocations}
              allocMap={allocMap}
              salaryRates={salaryRates}
              months={windowMonths}
              selectedGrantId={selectedGrantId}
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
  salaryRates,
  months,
  selectedGrantId,
}: {
  person: Person
  grants: Grant[]
  allocations: Allocations
  allocMap: ReturnType<typeof buildAllocMap>
  salaryRates: SalaryRates
  months: string[]
  selectedGrantId: string | null
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
          label: monthTickLabel(month),
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

  return (
    <section className="rounded-md border border-slate-200 bg-white p-2">
      <div className="mb-1 px-1">
        <h3 className="font-semibold">{person.name}</h3>
      </div>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} syncId="budget-month" margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10 }}
              interval={0}
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
                x={monthTickLabel(currentMonth())}
                stroke="#64748b"
                strokeDasharray="3 3"
              />
            )}
            <Tooltip
              content={
                <EffortTooltip
                  grants={grantsForPerson}
                  person={person}
                  salaryRates={salaryRates}
                />
              }
            />
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

type TooltipPayload = {
  payload?: EffortRow
}

function EffortTooltip({
  active,
  payload,
  grants,
  person,
  salaryRates,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  grants: Grant[]
  person: Person
  salaryRates: SalaryRates
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!row) return null
  const items = grants
    .map((grant) => ({ grant, effort: row.details[grant.id] ?? 0 }))
    .filter((item) => item.effort > 0)
  const annualSalary = annualSalaryAt(person, row.month, salaryRates)

  return (
    <div className="rounded-md border border-slate-200 bg-white/45 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <div className="font-semibold text-slate-900">{formatMonth(row.month)}</div>
      <div className="text-slate-500">Total: {round(row.total)}%</div>
      <div className="mb-2 text-slate-500">
        Salary rate: {annualSalary > 0 ? `${money(annualSalary)}/yr` : '—'}
      </div>
      {items.length === 0 ? (
        <div className="text-slate-400">No effort assigned.</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map(({ grant, effort }) => (
            <li key={grant.id} className="flex justify-between gap-4 tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: grant.color ?? '#2563eb' }}
                />
                {grant.name}
              </span>
              <span className="font-medium text-slate-900">{round(effort)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
