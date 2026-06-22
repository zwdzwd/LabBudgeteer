// Core domain types for the monthly personnel effort tracker.
// A "month" is always represented as a "YYYY-MM" string.

export type Person = {
  id: string
  name: string
  role?: string
  annualSalary?: number // optional; enables dollar tracking
  terminationMonth?: string // "YYYY-MM"; effort is not projected at/after this month
}

export type SalaryRate = {
  personId: string
  month: string // "YYYY-MM"; effective from this month forward
  annualSalary: number
}

export type Grant = {
  id: string
  name: string
  grtNumber?: string // institutional award/tracking number, e.g. "GRT-00002468"
  sponsor?: string
  accountType?: 'flexible' | 'regular' | 'supplemental'
  nextReportMonth?: string // "YYYY-MM"
  reportMonths?: string[]
  info?: string
  startMonth: string // "YYYY-MM"
  endMonth: string // "YYYY-MM"
  color?: string
  // Dollar tracking (optional). budget is the ending balance for budgetStartMonth;
  // the app burns it down from salary charges + expenses starting the next month.
  budget?: number
  budgetStartMonth?: string // "YYYY-MM"; defaults to startMonth
  fringeRate?: number // e.g. 0.30; defaults to 0
}

// A one-off, non-salary ledger entry against a grant.
// amount > 0 reduces the remaining balance (a cost);
// amount < 0 increases it (a supplement / award increase).
export type Expense = {
  id: string
  grantId: string
  month: string // "YYYY-MM"
  amount: number
  description?: string
}

// A balance reset establishes a grant's ending balance for a month-end checkpoint.
// Charges begin in the following month.
// operation: 'reset' sets balance to amount; 'add'/'subtract' adjusts the current balance.
export type BalanceReset = {
  id: string
  grantId: string
  month: string // "YYYY-MM"
  amount: number
  operation: 'reset' | 'add' | 'subtract' // defaults to 'reset' for backwards compat
  description?: string
}

// Sparse effort cell. We only store non-zero allocations.
// effort is a percentage in [0, 100].
export type Allocation = {
  personId: string
  grantId: string
  month: string // "YYYY-MM"
  effort: number
}

export type Settings = {
  // Optional manual override for the visible grid range.
  // When unset, the range is derived from the grants.
  startMonth?: string // "YYYY-MM"
  endMonth?: string // "YYYY-MM"
}

export const SCHEMA_VERSION = 9

export type AppData = {
  schemaVersion: number
  people: Person[]
  grants: Grant[]
  allocations: Allocation[]
  expenses: Expense[]
  balanceResets: BalanceReset[]
  salaryRates: SalaryRate[]
  settings: Settings
}
