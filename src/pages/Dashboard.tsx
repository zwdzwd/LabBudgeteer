import { useEffect, useMemo, useState } from 'react'
import { GrantBalanceChart } from '../components/GrantBalanceChart'
import { EffortCharts } from '../components/EffortCharts'
import { EventList } from '../components/EventEditor'
import { useStore } from '../store/useStore'
import { grantBalanceSeries, grantHasBudget, type MonthBalance } from '../lib/calc'
import {
  currentMonth,
  maxMonth,
  minMonth,
  monthRange,
  monthToIndex,
} from '../lib/months'

type Grant = ReturnType<typeof useStore.getState>['grants'][number]
type AccountType = NonNullable<Grant['accountType']>
type HoverSnapshot = {
  grant: Grant
  type: AccountType
  left: number
  top: number
}

const ACCOUNT_TYPE_ORDER: AccountType[] = ['regular', 'flexible', 'supplemental']

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  flexible: 'Flexible',
  regular: 'Regular',
  supplemental: 'Supplemental',
}

export function Dashboard({ showEvents = false }: { showEvents?: boolean }) {
  const people = useStore((s) => s.people)
  const grants = useStore((s) => s.grants)
  const allocations = useStore((s) => s.allocations)
  const expenses = useStore((s) => s.expenses)
  const balanceResets = useStore((s) => s.balanceResets)
  const salaryRates = useStore((s) => s.salaryRates)
  const settings = useStore((s) => s.settings)

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const budgeted = useMemo(() => grants.filter(grantHasBudget), [grants])

  // Which grant's curve is isolated in the balance chart; null shows all grants.
  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null)
  const [hoverSnapshot, setHoverSnapshot] = useState<HoverSnapshot | null>(null)
  // Event currently hovered in the viewer, highlighted on the balance chart.
  const [hoveredEvent, setHoveredEvent] = useState<{
    month: string
    grantId?: string | null
    type?: string
  } | null>(null)

  // Full month axis spanning the whole plan, shared by every chart. Prefer the
  // explicit settings window, else derive it from the grants and allocations.
  const months = useMemo(
    () => fullMonthRange(settings, grants, allocations),
    [settings, grants, allocations],
  )
  const firstYear = months.length ? Number(months[0].slice(0, 4)) : new Date().getFullYear()
  const lastYear = months.length ? Number(months[months.length - 1].slice(0, 4)) : firstYear
  const currentYear = Number(currentMonth().slice(0, 4))
  const clampedCurrentYear = Math.min(lastYear, Math.max(firstYear, currentYear))
  const [chartYear, setChartYear] = useState(clampedCurrentYear)
  const [showYearPicker, setShowYearPicker] = useState(false)
  const yearOptions = useMemo(
    () => Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index),
    [firstYear, lastYear],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setShowYearPicker(false)
        setChartYear((year) => Math.max(firstYear, year - 1))
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setShowYearPicker(false)
        setChartYear((year) => Math.min(lastYear, year + 1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [firstYear, lastYear])
  const activeSnapshotGrants = useMemo(
    () => grants.filter((grant) => grantIsActiveInYear(grant, chartYear)),
    [grants, chartYear],
  )

  const seriesByGrant = useMemo(() => {
    const seriesLookup = new Map<string, MonthBalance[]>()
    for (const g of budgeted) {
      const series = grantBalanceSeries(
        g,
        allocations,
        expenses,
        balanceResets,
        peopleById,
        salaryRates,
        months[months.length - 1],
      )
      seriesLookup.set(g.id, series)
    }
    return seriesLookup
  }, [
    budgeted,
    allocations,
    expenses,
    balanceResets,
    peopleById,
    salaryRates,
    months,
  ])

  const grantsByAccountType = useMemo(() => {
    const grouped = new Map<AccountType, Grant[]>(ACCOUNT_TYPE_ORDER.map((type) => [type, []]))
    for (const grant of activeSnapshotGrants) {
      grouped.get(accountType(grant))?.push(grant)
    }
    let startIndex = 0
    return ACCOUNT_TYPE_ORDER.map((type) => {
      const grants = grouped.get(type) ?? []
      const group = { type, grants, startIndex }
      startIndex += grants.length
      return group
    }).filter((group) => group.grants.length > 0)
  }, [activeSnapshotGrants])

  if (people.length === 0 && grants.length === 0) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold">Dashboard</h1>
        <p className="rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No data was loaded from the YAML file.
        </p>
      </div>
    )
  }

  return (
    <div>
      {(grants.length > 0 || people.length > 0) && (
        <div className="sticky top-[33px] z-[70] -mx-5 flex flex-wrap items-center justify-center gap-1.5 border-b border-slate-200 bg-white/95 px-5 py-1.5 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={() => {
              setShowYearPicker(false)
              setChartYear((year) => Math.max(firstYear, year - 1))
            }}
            disabled={chartYear <= firstYear}
            className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowYearPicker((show) => !show)}
              className="rounded border border-slate-200 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 hover:bg-slate-50"
              aria-expanded={showYearPicker}
            >
              {chartYear}
            </button>
            {showYearPicker && (
              <div className="absolute left-0 z-20 mt-1 max-h-56 min-w-full overflow-auto rounded-md border border-slate-200 bg-white/90 p-1 text-sm shadow-lg backdrop-blur-sm">
                {yearOptions.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setChartYear(year)
                      setShowYearPicker(false)
                    }}
                    className={`block w-full rounded px-2 py-1 text-left tabular-nums hover:bg-slate-100 ${
                      year === chartYear ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowYearPicker(false)
              setChartYear(clampedCurrentYear)
            }}
            disabled={chartYear === clampedCurrentYear}
            className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Current
          </button>
          <button
            type="button"
            onClick={() => {
              setShowYearPicker(false)
              setChartYear((year) => Math.min(lastYear, year + 1))
            }}
            disabled={chartYear >= lastYear}
            className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col items-stretch gap-3 lg:flex-row lg:items-stretch">
        {/* 1. Budget snapshot */}
        {activeSnapshotGrants.length > 0 && (
          <aside className="z-[60] max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur lg:sticky lg:top-[70px] lg:max-h-[calc(100vh-76px)] lg:w-64 lg:shrink-0">
            <div className="space-y-2">
              {grantsByAccountType.map(({ type, grants }) => (
                <div key={type}>
                  <div className="mb-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {ACCOUNT_TYPE_LABELS[type]}
                  </div>
                  <div className="space-y-1">
                    {grants.map((grant) => {
                      const selected = selectedGrantId === grant.id
                      const reportMonth = reportMonthForYear(grant, chartYear)
                      return (
                        <button
                          key={grant.id}
                          type="button"
                          onClick={() => setSelectedGrantId(selected ? null : grant.id)}
                          onMouseEnter={(event) =>
                            setHoverSnapshot(snapshotHoverState(event.currentTarget, grant, type))
                          }
                          onMouseLeave={() => setHoverSnapshot(null)}
                          onFocus={(event) =>
                            setHoverSnapshot(snapshotHoverState(event.currentTarget, grant, type))
                          }
                          onBlur={() => setHoverSnapshot(null)}
                          aria-pressed={selected}
                          className={`w-full rounded-md border px-2 py-1.5 text-left transition ${
                            selected
                              ? 'border-slate-500 bg-slate-100 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-sm"
                              style={{ background: grant.color }}
                            />
                            <h3 className="truncate text-xs font-semibold">{grant.name}</h3>
                          </div>
                          {reportMonth && (
                            <div className="mt-0.5 truncate pl-3.5 text-[10px] font-semibold tabular-nums text-slate-700">
                              Report {reportMonth}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="min-w-0 flex-1 space-y-6">
          {/* 2. Grant balance timeline */}
          {budgeted.length > 0 && (
            <GrantBalanceChart
              grants={budgeted}
              seriesByGrant={seriesByGrant}
              allocations={allocations}
              expenses={expenses}
              balanceResets={balanceResets}
              peopleById={peopleById}
              salaryRates={salaryRates}
              selectedGrantId={selectedGrantId}
              onSelectedGrantChange={setSelectedGrantId}
              year={chartYear}
              highlight={hoveredEvent}
            />
          )}

          {/* 3. Effort allocation visualizer */}
          {people.length > 0 && grants.length > 0 && (
            <EffortCharts
              people={people}
              grants={grants}
              allocations={allocations}
              salaryRates={salaryRates}
              year={chartYear}
              selectedGrantId={selectedGrantId}
            />
          )}
        </div>

        {/* 4. Event list */}
        {showEvents && (
          <EventList
            year={chartYear}
            selectedGrantId={selectedGrantId}
            selectedGrantName={
              selectedGrantId ? grants.find((g) => g.id === selectedGrantId)?.name ?? null : null
            }
            onClearGrant={() => setSelectedGrantId(null)}
            onHoverEvent={setHoveredEvent}
          />
        )}
      </div>
      {hoverSnapshot && (
        <div
          className="pointer-events-none fixed z-[90] w-72 rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-left text-xs text-slate-700 shadow-lg backdrop-blur"
          style={{ left: hoverSnapshot.left, top: hoverSnapshot.top }}
        >
          <SnapshotTooltip
            grant={hoverSnapshot.grant}
            type={hoverSnapshot.type}
            year={chartYear}
          />
        </div>
      )}
    </div>
  )
}

function fullMonthRange(
  settings: ReturnType<typeof useStore.getState>['settings'],
  grants: Grant[],
  allocations: ReturnType<typeof useStore.getState>['allocations'],
): string[] {
  if (settings.startMonth && settings.endMonth) {
    return monthRange(settings.startMonth, settings.endMonth)
  }
  const starts: string[] = []
  const ends: string[] = []
  for (const g of grants) {
    starts.push(g.budgetStartMonth ?? g.startMonth)
    ends.push(g.endMonth)
  }
  for (const a of allocations) {
    starts.push(a.month)
    ends.push(a.month)
  }
  if (starts.length === 0) return []
  let start = starts[0]
  let end = ends[0]
  for (const m of starts) start = minMonth(start, m)
  for (const m of ends) end = maxMonth(end, m)
  return monthRange(start, end)
}

function accountType(grant: Grant): AccountType {
  return grant.accountType ?? 'regular'
}

function grantIsActiveInYear(grant: Grant, year: number): boolean {
  const yearStart = monthToIndex(`${year}-01`)
  const yearEnd = monthToIndex(`${year}-12`)
  return monthToIndex(grant.startMonth) <= yearEnd && monthToIndex(grant.endMonth) >= yearStart
}

function reportMonthForYear(grant: Grant, year: number): string | undefined {
  return grant.reportMonths?.find((month) => month.startsWith(`${year}-`))
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

function snapshotHoverState(
  target: HTMLElement,
  grant: Grant,
  type: AccountType,
): HoverSnapshot {
  const rect = target.getBoundingClientRect()
  const width = 288
  const margin = 8
  const centered = rect.left + rect.width / 2 - width / 2
  return {
    grant,
    type,
    left: Math.max(margin, Math.min(centered, window.innerWidth - width - margin)),
    top: rect.bottom + 6,
  }
}

function SnapshotTooltip({
  grant,
  type,
  year,
}: {
  grant: Grant
  type: AccountType
  year: number
}) {
  const reportMonth = reportMonthForYear(grant, year)
  const reportMonths = grant.reportMonths?.join(', ')
  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: grant.color }}
          />
          <span className="truncate">{grant.name}</span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
          {grant.grtNumber ? `${grant.grtNumber} · ${grant.id}` : grant.id}
        </div>
      </div>

      <div className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1">
        <span className="text-slate-400">Type</span>
        <span className="font-medium text-slate-700">{ACCOUNT_TYPE_LABELS[type]}</span>
        <span className="text-slate-400">Period</span>
        <span className="font-medium text-slate-700">
          {grant.startMonth} to {grant.endMonth}
        </span>
        {reportMonth && (
          <>
            <span className="text-slate-400">{year} report</span>
            <span className="font-semibold tabular-nums text-slate-900">{reportMonth}</span>
          </>
        )}
        {reportMonths && (
          <>
            <span className="text-slate-400">Reports</span>
            <span className="font-medium tabular-nums text-slate-700">{reportMonths}</span>
          </>
        )}
      </div>
      {grant.info && (
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 leading-relaxed text-slate-600">
          {grant.info}
        </div>
      )}
    </div>
  )
}

