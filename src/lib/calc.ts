// Dollar calculations: salary charges, expenses, and grant balance burn-down.
// All pure functions over the app data arrays.

import type { Allocation, BalanceReset, Expense, Grant, Person, SalaryRate } from '../types'
import { monthRange, monthToIndex } from './months'

export function annualSalaryAt(
  p: Person | undefined,
  month: string,
  salaryRates: SalaryRate[] = [],
): number {
  if (!p) return 0
  let salary = p.annualSalary ?? 0
  let bestMonth = Number.NEGATIVE_INFINITY
  const target = monthToIndex(month)
  for (const rate of salaryRates) {
    if (rate.personId !== p.id) continue
    const effective = monthToIndex(rate.month)
    if (effective <= target && effective >= bestMonth) {
      salary = rate.annualSalary
      bestMonth = effective
    }
  }
  return salary
}

export function monthlySalary(
  p: Person | undefined,
  month: string,
  salaryRates: SalaryRate[] = [],
): number {
  return annualSalaryAt(p, month, salaryRates) / 12
}

/** Salary dollars charged to a grant in one month (sum over people's effort). */
export function grantSalaryCharge(
  grant: Grant,
  month: string,
  allocations: Allocation[],
  peopleById: Map<string, Person>,
  salaryRates: SalaryRate[] = [],
): number {
  let sum = 0
  for (const a of allocations) {
    if (a.grantId !== grant.id || a.month !== month) continue
    sum += monthlySalary(peopleById.get(a.personId), month, salaryRates) * (a.effort / 100)
  }
  return sum * (1 + (grant.fringeRate ?? 0))
}

/** Net expense dollars hitting a grant in one month (positive = cost). */
export function grantExpenseTotal(
  grantId: string,
  month: string,
  expenses: Expense[],
): number {
  let sum = 0
  for (const e of expenses) {
    if (e.grantId === grantId && e.month === month) sum += e.amount
  }
  return sum
}

export type MonthBalance = {
  month: string
  salary: number
  expense: number
  reset: number
  spend: number // salary + expense charged this month
  remaining: number // balance after this month
}

/** True when a grant has enough info to compute a dollar balance. */
export function grantHasBudget(g: Grant): boolean {
  return typeof g.budget === 'number'
}

/**
 * Burn-down series for a grant, from its budgetStartMonth through `endMonth`
 * (defaults to the grant's endMonth). `budget` is the ending balance for
 * budgetStartMonth, so charges begin in the following month.
 */
export function grantBalanceSeries(
  grant: Grant,
  allocations: Allocation[],
  expenses: Expense[],
  balanceResets: BalanceReset[] = [],
  peopleById: Map<string, Person>,
  salaryRates: SalaryRate[] = [],
  endMonth?: string,
): MonthBalance[] {
  if (!grantHasBudget(grant)) return []
  const start = grant.budgetStartMonth ?? grant.startMonth
  const end = endMonth && monthToIndex(endMonth) < monthToIndex(grant.endMonth)
    ? endMonth
    : grant.endMonth
  const months = monthRange(start, end)
  let remaining = grant.budget as number
  const out: MonthBalance[] = []
  const resetsByMonth = new Map<string, BalanceReset>()
  for (const reset of balanceResets) {
    if (reset.grantId !== grant.id) continue
    resetsByMonth.set(reset.month, reset)
  }
  months.forEach((m, i) => {
    const resetEntry = resetsByMonth.get(m)
    if (resetEntry) {
      const op = resetEntry.operation
      if (op === 'reset') {
        remaining = resetEntry.amount
      } else if (op === 'add') {
        remaining += resetEntry.amount
      } else if (op === 'subtract') {
        remaining -= resetEntry.amount
      }
    }
    // The budget is the ending balance for the baseline month, so burn-down
    // begins the following month.
    if (i === 0) {
      out.push({ month: m, salary: 0, expense: 0, reset: resetEntry?.amount ?? 0, spend: 0, remaining })
      return
    }
    if (resetEntry) {
      out.push({ month: m, salary: 0, expense: 0, reset: resetEntry.amount, spend: 0, remaining })
      return
    }
    const salary = grantSalaryCharge(grant, m, allocations, peopleById, salaryRates)
    const expense = grantExpenseTotal(grant.id, m, expenses)
    const spend = salary + expense
    remaining -= spend
    out.push({ month: m, salary, expense, reset: 0, spend, remaining })
  })
  return out
}
