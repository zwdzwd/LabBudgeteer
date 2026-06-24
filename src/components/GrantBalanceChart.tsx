import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useStore } from '../store/useStore'
import { eventTypeColor } from '../lib/eventTypes'
import { monthlySalary, type MonthBalance } from '../lib/calc'
import { compactMoney, money } from '../lib/format'
import { currentMonth, formatMonth, monthRange } from '../lib/months'

/** X-axis tick: just the month number, e.g. "2024-10" -> "10". */
function monthTickLabel(month: string): string {
  return String(Number(month.slice(5)))
}

type Grant = ReturnType<typeof useStore.getState>['grants'][number]
type Person = ReturnType<typeof useStore.getState>['people'][number]
type Allocations = ReturnType<typeof useStore.getState>['allocations']
type Expenses = ReturnType<typeof useStore.getState>['expenses']
type BalanceResets = ReturnType<typeof useStore.getState>['balanceResets']
type SalaryRates = ReturnType<typeof useStore.getState>['salaryRates']

export function GrantBalanceChart({
  grants,
  seriesByGrant,
  allocations,
  expenses,
  balanceResets,
  peopleById,
  salaryRates,
  selectedGrantId,
  onSelectedGrantChange,
  year,
  highlight,
  onHoverLabel,
}: {
  grants: Grant[]
  seriesByGrant: Map<string, MonthBalance[]>
  allocations: Allocations
  expenses: Expenses
  balanceResets: BalanceResets
  peopleById: Map<string, Person>
  salaryRates: SalaryRates
  selectedGrantId: string | null
  onSelectedGrantChange: (grantId: string | null) => void
  year: number
  highlight?: { month: string; grantId?: string | null; type?: string } | null
  onHoverLabel?: (label: string | null) => void
}) {
  const selectedGrant = selectedGrantId
    ? (grants.find((grant) => grant.id === selectedGrantId) ?? null)
    : null
  const hasSelectedGrant = selectedGrant !== null
  // When a grant is selected, plot only its curve; otherwise plot every grant.
  const visibleGrants = selectedGrant ? [selectedGrant] : grants

  const windowMonths = monthRange(`${year}-01`, `${year}-12`)
  const currentYear = Number(currentMonth().slice(0, 4))

  const chartData = windowMonths.map((month, i) => {
    const row: ChartRow = {
      month,
      label: monthTickLabel(month),
      monthIndex: i + 0.5,
      remaining: {},
    }
    for (const grant of grants) {
      const point = (seriesByGrant.get(grant.id) ?? []).find((entry) => entry.month === month)
      row.remaining[grant.id] = point?.remaining ?? null
    }
    // Detailed salary/expense breakdown is only shown for a single selected grant.
    if (selectedGrant) {
      const point = (seriesByGrant.get(selectedGrant.id) ?? []).find((entry) => entry.month === month)
      row.salary = point?.salary ?? 0
      row.expense = point?.expense ?? 0
      row.spend = point?.spend ?? 0
      row.salaryItems = salaryItemsForMonth(selectedGrant, month, allocations, peopleById, salaryRates)
      row.expenseItems = expensesForMonth(selectedGrant.id, month, expenses)
    }
    return row
  })

  // Resolve the hovered event to a concrete point on a grant line, if it falls
  // within the displayed year and that grant has a value that month.
  const highlightPoint = (() => {
    if (!highlight?.grantId) return null
    const grant = grants.find((g) => g.id === highlight.grantId)
    if (!grant) return null
    if (selectedGrant && selectedGrant.id !== grant.id) return null
    const row = chartData.find((r) => r.month === highlight.month)
    const y = row?.remaining[grant.id]
    if (row == null || y == null) return null
    return { label: row.label, monthIndex: row.monthIndex, y, color: eventTypeColor(highlight.type) }
  })()

  // The plotted line is floored at zero, so flag any grant whose true balance
  // goes negative — the first month it does is when the grant is overspent.
  const overspent = visibleGrants
    .map((grant) => {
      const deficit = (seriesByGrant.get(grant.id) ?? []).find((entry) => entry.remaining < 0)
      return deficit ? { grant, month: deficit.month } : null
    })
    .filter((w): w is { grant: Grant; month: string } => w !== null)

  return (
    <section>
      <h2 className="mb-2 font-semibold">Grant balance trajectory</h2>

      {overspent.length > 0 && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span className="font-semibold">⚠ Overspent:</span>{' '}
          {overspent.map((w, i) => (
            <span key={w.grant.id}>
              {i > 0 && '; '}
              {shortName(w.grant.name)} goes negative in {formatMonth(w.month)}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white p-2">
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              syncId="budget-month"
              margin={{ top: 12, right: 24, bottom: 10, left: 16 }}
              onMouseMove={(state: any) => {
                if (onHoverLabel && state?.isTooltipActive && state.activeLabel != null) {
                  onHoverLabel(String(Math.round(Number(state.activeLabel))))
                }
              }}
              onMouseLeave={() => onHoverLabel?.(null)}
            >
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthIndex"
                type="number"
                domain={[0, 12]}
                ticks={[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5]}
                tickFormatter={(v) => String(Math.round(v))}
                tick={{ fill: '#64748b', fontSize: 11 }}
              />
              {currentYear === year && (
                <ReferenceLine
                  x={Number(currentMonth().slice(5)) - 0.5}
                  stroke="#64748b"
                  strokeDasharray="3 3"
                />
              )}
              <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1} />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={compactMoney}
                width={72}
                domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
              />
          <Tooltip
            content={
              <BalanceTooltip
                grants={visibleGrants}
                selectedGrant={selectedGrant}
                balanceResets={balanceResets}
              />
            }
          />
              {visibleGrants.map((grant) => (
                <Line
                  key={grant.id}
                  type="monotone"
                  dataKey={`remaining.${grant.id}`}
                  name={shortName(grant.name)}
                  stroke={grant.color ?? '#2563eb'}
                  strokeWidth={2.5}
                  dot={(props) => <ReportDot {...props} grant={grant} />}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              {highlightPoint && (
                <ReferenceDot
                  x={highlightPoint.monthIndex}
                  y={highlightPoint.y}
                  r={8}
                  stroke={highlightPoint.color}
                  strokeWidth={3}
                  fill="#fff"
                  fillOpacity={0.85}
                  ifOverflow="extendDomain"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {grants.map((grant) => {
            const selected = selectedGrantId === grant.id
            const dimmed = hasSelectedGrant && !selected
            return (
              <button
                key={grant.id}
                type="button"
                onClick={() => onSelectedGrantChange(selected ? null : grant.id)}
                aria-pressed={selected}
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${
                  selected
                    ? 'border-slate-500 bg-slate-100 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                } ${dimmed ? 'opacity-45' : ''}`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: grant.color ?? '#2563eb' }}
                />
                {shortName(grant.name)}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

type ChartRow = {
  month: string
  label: string
  monthIndex: number
  // Remaining balance per grant id; null where a grant has no data that month.
  remaining: Record<string, number | null>
  // Only populated when a single grant is selected.
  salary?: number
  expense?: number
  reset?: number
  spend?: number
  salaryItems?: SalaryTooltipItem[]
  expenseItems?: ExpenseTooltipItem[]
}

type TooltipPayload = {
  payload?: ChartRow
}

type SalaryTooltipItem = {
  personId: string
  name: string
  effort: number
  amount: number
}

type ExpenseTooltipItem = {
  id: string
  description: string
  amount: number
}

type ReportDotProps = {
  cx?: number
  cy?: number
  payload?: ChartRow
  grant: Grant
}

function ReportDot({ cx, cy, payload, grant }: ReportDotProps) {
  if (cx == null || cy == null || !payload) return null
  if (!grant.reportMonths?.includes(payload.month)) return null
  const color = grant.color ?? '#2563eb'
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill="#fff" stroke={color} strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={3} fill={color} />
    </g>
  )
}

function salaryItemsForMonth(
  grant: Grant,
  month: string,
  allocations: Allocations,
  peopleById: Map<string, Person>,
  salaryRates: SalaryRates,
): SalaryTooltipItem[] {
  const fringeMultiplier = 1 + (grant.fringeRate ?? 0)
  return allocations
    .filter((allocation) => allocation.grantId === grant.id && allocation.month === month)
    .map((allocation) => {
      const person = peopleById.get(allocation.personId)
      return {
        personId: allocation.personId,
        name: person?.name ?? allocation.personId,
        effort: allocation.effort,
        amount:
          monthlySalary(person, month, salaryRates) *
          (allocation.effort / 100) *
          fringeMultiplier,
      }
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
}

function expensesForMonth(
  grantId: string,
  month: string,
  expenses: Expenses,
): ExpenseTooltipItem[] {
  return expenses
    .filter((expense) => expense.grantId === grantId && expense.month === month)
    .map((expense) => ({
      id: expense.id,
      description: expense.description ?? expense.id,
      amount: expense.amount,
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.description.localeCompare(b.description))
}

function BalanceTooltip({
  active,
  payload,
  grants,
  selectedGrant,
  balanceResets,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  grants: Grant[]
  selectedGrant: Grant | null
  balanceResets: BalanceResets
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null

  // Multi-grant view: compact list of each grant's remaining balance.
  if (!selectedGrant) {
    return (
      <div className="rounded-md border border-slate-200 bg-white/45 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
        <div className="mb-2 text-slate-500">{formatMonth(point.month)}</div>
        <ul className="space-y-0.5">
          {grants.map((grant) => {
            const remaining = point.remaining[grant.id]
            if (remaining == null) return null
            return (
              <li key={grant.id} className="flex items-center justify-between gap-4 tabular-nums">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: grant.color ?? '#2563eb' }}
                  />
                  {shortName(grant.name)}
                </span>
                <span className={remaining < 0 ? 'text-red-600' : 'text-slate-800'}>
                  {money(remaining)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const grant = selectedGrant
  const remaining = point.remaining[grant.id]
  const reset = balanceResets.find(
    (entry) => entry.grantId === grant.id && entry.month === point.month,
  )
  return (
    <div className="rounded-md border border-slate-200 bg-white/45 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ background: grant.color ?? '#2563eb' }}
        />
        {shortName(grant.name)}
      </div>
      <div className="mb-2 text-slate-500">{formatMonth(point.month)}</div>
      {remaining == null ? (
        <div className="text-slate-400">No balance data for this month.</div>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 tabular-nums">
            <dt className="text-slate-500">Remaining</dt>
            <dd className="text-right font-medium text-slate-900">{money(remaining)}</dd>
            <dt className="text-slate-500">Salary</dt>
            <dd className="text-right text-slate-700">{money(point.salary ?? 0)}</dd>
            <dt className="text-slate-500">Expenses</dt>
            <dd className="text-right text-slate-700">{money(point.expense ?? 0)}</dd>
            <dt className="text-slate-500">Monthly spend</dt>
            <dd className="text-right text-slate-700">{money(point.spend ?? 0)}</dd>
            <dt className="text-slate-500">Reset</dt>
            <dd className="text-right text-slate-700">{money(reset?.amount ?? point.reset ?? 0)}</dd>
          </dl>
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="mb-1 font-medium text-slate-700">Salary coverage</div>
            {(point.salaryItems?.length ?? 0) === 0 ? (
              <div className="text-slate-400">No salary effort charged.</div>
            ) : (
              <ul className="space-y-0.5">
                {point.salaryItems?.map((item) => (
                  <li key={`${item.personId}-${item.effort}`} className="flex justify-between gap-4 tabular-nums">
                    <span className="text-slate-600">
                      {item.name} ({item.effort}%)
                    </span>
                    <span className="text-slate-800">{money(item.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="mb-1 font-medium text-slate-700">Expense detail</div>
            {(point.expenseItems?.length ?? 0) === 0 ? (
              <div className="text-slate-400">No one-off expenses.</div>
            ) : (
              <ul className="space-y-0.5">
                {point.expenseItems?.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 tabular-nums">
                    <span className="text-slate-600">{item.description}</span>
                    <span className={item.amount < 0 ? 'text-green-700' : 'text-slate-800'}>
                      {money(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Trim the long "Name / GRT-xxxx" grant names for buttons and labels. */
export function shortName(name: string): string {
  return name.split('/')[0].trim()
}
