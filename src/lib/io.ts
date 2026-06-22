// YAML event import for the read-only simulator.

import YAML from 'yaml'
import { z } from 'zod'
import type {
  Allocation,
  AppData,
  BalanceReset,
  Expense,
  Grant,
  Person,
  SalaryRate,
} from '../types'
import { SCHEMA_VERSION } from '../types'
import { maxMonth, minMonth, monthRange, monthToIndex } from './months'

const month = z.string().regex(/^\d{4}-\d{2}$/)
const accountType = z.enum(['flexible', 'regular', 'supplemental'])

const GRANT_COLORS = [
  '#2563eb',
  '#16a34a',
  '#db2777',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
  '#4f46e5',
  '#0f766e',
  '#be123c',
  '#a16207',
]

const settingsSchema = z.object({
  startMonth: month.optional(),
  endMonth: month.optional(),
})

const personRef = z.object({
  personId: z.string().optional(),
  name: z.string().optional(),
  role: z.string().optional(),
})

const grantRef = z.object({
  grantId: z.string().optional(),
  name: z.string().optional(),
})

const salaryRateEventSchema = personRef.extend({
  type: z.literal('salary_rate'),
  month,
  annualSalary: z.number(),
})

const startGrantEventSchema = z.object({
  type: z.literal('start_grant'),
  month,
  grantId: z.string().optional(),
  name: z.string(),
  sponsor: z.string().optional(),
  accountType: accountType.optional(),
  nextReportMonth: month.optional(),
  info: z.string().optional(),
  endMonth: month.optional(),
  color: z.string().optional(),
  budget: z.number().optional(),
  budgetStartMonth: month.optional(),
  fringeRate: z.number().optional(),
})

const coverPersonEventSchema = personRef.extend({
  type: z.literal('cover_person'),
  month,
  grantId: z.string().optional(),
  grantName: z.string().optional(),
  effort: z.number(),
  capAtTotal: z.number().optional(),
  startMonth: month,
  endMonth: month,
  annualSalary: z.number().optional(),
})

const grantRenewEventSchema = grantRef.extend({
  type: z.literal('grant_renew'),
  month,
  name: z.string().optional(),
  sponsor: z.string().optional(),
  accountType: accountType.optional(),
  nextReportMonth: month.optional(),
  info: z.string().optional(),
  amount: z.string().optional(), // "1000" (reset), "+1000" (add), "-1000" (subtract)
  renewalId: z.string().optional(),
  description: z.string().optional(),
})

const terminatePersonnelEventSchema = personRef.extend({
  type: z.literal('terminate_personnel'),
  month,
})

const oneOffExpenditureEventSchema = grantRef.extend({
  type: z.literal('one_off_expenditure'),
  month,
  expenseId: z.string().optional(),
  amount: z.number(),
  description: z.string().optional(),
})

const endGrantEventSchema = grantRef.extend({
  type: z.literal('end_grant'),
  month,
})

const eventSchema = z.discriminatedUnion('type', [
  salaryRateEventSchema,
  startGrantEventSchema,
  grantRenewEventSchema,
  coverPersonEventSchema,
  terminatePersonnelEventSchema,
  oneOffExpenditureEventSchema,
  endGrantEventSchema,
])

const eventFileSchema = z.object({
  schemaVersion: z.number(),
  settings: settingsSchema.optional().default({}),
  events: z.array(eventSchema),
})

type EventFile = z.infer<typeof eventFileSchema>
type CoverPersonEvent = Extract<EventFile['events'][number], { type: 'cover_person' }>
type CappedCoverPersonEvent = CoverPersonEvent & { capAtTotal: number }

/** Parse + validate imported YAML. Throws with a friendly message on failure. */
export function parseImportedYAML(text: string): AppData {
  let raw: unknown
  try {
    raw = YAML.parse(text)
  } catch {
    throw new Error('File is not valid YAML.')
  }

  const result = eventFileSchema.safeParse(raw)
  if (!result.success) {
    throw new Error('File does not look like a LabBudgeteer YAML event file.')
  }
  if (result.data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Event file is from a newer version (v${result.data.schemaVersion}). Please update the app.`,
    )
  }
  return compileEvents(result.data)
}

function compileEvents(file: EventFile): AppData {
  const people = new Map<string, Person>()
  const personNameToId = new Map<string, string>()
  const grants = new Map<string, Grant>()
  const grantNameToId = new Map<string, string>()
  const allocations = new Map<string, Allocation>()
  const expenses: Expense[] = []
  const balanceResets: BalanceReset[] = []
  const salaryRates: SalaryRate[] = []
  const endByGrant = new Map<string, string>()
  const terminationByPerson = new Map<string, string>()
  const cappedCoverageEvents: CappedCoverPersonEvent[] = []

  for (const event of file.events) {
    if (event.type !== 'end_grant') continue
    const key = event.grantId ?? (event.name ? slugId(event.name, 'grant') : undefined)
    if (key) endByGrant.set(key, event.month)
  }

  for (const event of file.events) {
    if (event.type === 'salary_rate') {
      const person = ensurePerson(people, personNameToId, event)
      person.annualSalary = event.annualSalary
      salaryRates.push({
        personId: person.id,
        month: event.month,
        annualSalary: event.annualSalary,
      })
      continue
    }

    if (event.type === 'start_grant') {
      const id = event.grantId ?? slugId(event.name, 'grant')
      const endMonth = event.endMonth ?? endByGrant.get(id) ?? event.month
      const colorIndex = grants.size % GRANT_COLORS.length
      const grant: Grant = {
        id,
        name: event.name,
        sponsor: event.sponsor,
        accountType: event.accountType,
        nextReportMonth: event.nextReportMonth,
        reportMonths: event.nextReportMonth ? [event.nextReportMonth] : undefined,
        info: event.info,
        startMonth: event.month,
        endMonth,
        color: event.color ?? GRANT_COLORS[colorIndex],
        budget: event.budget,
        budgetStartMonth: event.budgetStartMonth,
        fringeRate: event.fringeRate,
      }
      grants.set(id, grant)
      grantNameToId.set(event.name, id)
      continue
    }

    if (event.type === 'grant_renew') {
      const grantId = resolveGrantId(grants, grantNameToId, event)
      const grant = grants.get(grantId)
      if (!grant) throw new Error(`Unknown grant in renew event: ${grantId}.`)

      const updated: Grant = {
        ...grant,
        name: event.name ?? grant.name,
        sponsor: event.sponsor ?? grant.sponsor,
        accountType: event.accountType ?? grant.accountType,
        nextReportMonth: event.nextReportMonth ?? grant.nextReportMonth,
        reportMonths: event.nextReportMonth
          ? appendUniqueMonth(grant.reportMonths, event.nextReportMonth)
          : grant.reportMonths,
        info: event.info ?? grant.info,
      }
      grants.set(grantId, updated)
      if (event.name) grantNameToId.set(event.name, grantId)

      if (event.amount) {
        const amountStr = event.amount.trim()
        let operation: 'reset' | 'add' | 'subtract' = 'reset'
        let numAmount = parseFloat(amountStr)

        if (amountStr.startsWith('+')) {
          operation = 'add'
          numAmount = parseFloat(amountStr.slice(1))
        } else if (amountStr.startsWith('-')) {
          operation = 'subtract'
          numAmount = parseFloat(amountStr.slice(1))
        }

        if (Number.isFinite(numAmount)) {
          balanceResets.push({
            id: event.renewalId ?? `renewal-${String(balanceResets.length + 1).padStart(3, '0')}`,
            grantId,
            month: event.month,
            amount: numAmount,
            operation,
            description: event.description,
          })
        }
      }
      continue
    }

    if (event.type === 'cover_person') {
      if (event.capAtTotal != null) {
        cappedCoverageEvents.push({ ...event, capAtTotal: event.capAtTotal })
        continue
      }

      const grantId = resolveGrantId(grants, grantNameToId, {
        grantId: event.grantId,
        name: event.grantName,
      })
      const grant = grants.get(grantId)
      if (!grant) throw new Error(`Unknown grant in coverage event: ${grantId}.`)

      const person = ensurePerson(people, personNameToId, event)
      if (event.annualSalary != null) {
        person.annualSalary = event.annualSalary
        salaryRates.push({
          personId: person.id,
          month: event.startMonth,
          annualSalary: event.annualSalary,
        })
      }

      const start = maxMonth(event.startMonth, grant.startMonth)
      const end = minMonth(event.endMonth, grant.endMonth)
      for (const m of monthRange(start, end)) {
        if (!Number.isFinite(event.effort) || event.effort <= 0) continue
        const key = `${person.id}|${grantId}|${m}`
        allocations.set(key, {
          personId: person.id,
          grantId,
          month: m,
          effort: event.effort,
        })
      }
      continue
    }

    if (event.type === 'terminate_personnel') {
      const personId = resolvePersonId(people, personNameToId, event)
      terminationByPerson.set(personId, event.month)
      const person = people.get(personId)
      if (person) person.terminationMonth = event.month
      const cutoff = monthToIndex(event.month)
      for (const [key, allocation] of allocations) {
        if (allocation.personId === personId && monthToIndex(allocation.month) >= cutoff) {
          allocations.delete(key)
        }
      }
      continue
    }

    if (event.type === 'one_off_expenditure') {
      const grantId = resolveGrantId(grants, grantNameToId, event)
      expenses.push({
        id: event.expenseId ?? `expense-${String(expenses.length + 1).padStart(3, '0')}`,
        grantId,
        month: event.month,
        amount: event.amount,
        description: event.description,
      })
      continue
    }

    if (event.type === 'end_grant') {
      const grantId = resolveGrantId(grants, grantNameToId, event)
      const grant = grants.get(grantId)
      if (grant) grants.set(grantId, { ...grant, endMonth: event.month })
      const cutoff = monthToIndex(event.month)
      for (const [key, allocation] of allocations) {
        if (allocation.grantId === grantId && monthToIndex(allocation.month) > cutoff) {
          allocations.delete(key)
        }
      }
    }
  }

  for (const event of cappedCoverageEvents) {
    const grantId = resolveGrantId(grants, grantNameToId, {
      grantId: event.grantId,
      name: event.grantName,
    })
    const grant = grants.get(grantId)
    if (!grant) throw new Error(`Unknown grant in capped coverage event: ${grantId}.`)

    const person = ensurePerson(people, personNameToId, event)
    if (event.annualSalary != null) {
      person.annualSalary = event.annualSalary
      salaryRates.push({
        personId: person.id,
        month: event.startMonth,
        annualSalary: event.annualSalary,
      })
    }

    const start = maxMonth(event.startMonth, grant.startMonth)
    const end = minMonth(event.endMonth, grant.endMonth)
    for (const m of monthRange(start, end)) {
      const terminationMonth = terminationByPerson.get(person.id)
      if (terminationMonth && monthToIndex(m) >= monthToIndex(terminationMonth)) continue
      const otherEffort = allocationTotalExcludingGrant(allocations, person.id, grantId, m)
      const effort = Math.min(event.effort, Math.max(0, event.capAtTotal - otherEffort))
      const key = `${person.id}|${grantId}|${m}`
      if (!Number.isFinite(effort) || effort <= 0) {
        allocations.delete(key)
        continue
      }
      allocations.set(key, {
        personId: person.id,
        grantId,
        month: m,
        effort,
      })
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    people: sortPeople([...people.values()]),
    grants: sortGrants([...grants.values()]),
    allocations: sortAllocations([...allocations.values()]),
    expenses: sortExpenses(expenses),
    balanceResets: sortBalanceResets(balanceResets),
    salaryRates: sortSalaryRates(salaryRates),
    settings: file.settings,
  }
}

function allocationTotalExcludingGrant(
  allocations: Map<string, Allocation>,
  personId: string,
  grantId: string,
  month: string,
): number {
  let total = 0
  for (const allocation of allocations.values()) {
    if (
      allocation.personId === personId &&
      allocation.month === month &&
      allocation.grantId !== grantId
    ) {
      total += allocation.effort
    }
  }
  return total
}

function ensurePerson(
  people: Map<string, Person>,
  nameToId: Map<string, string>,
  ref: { personId?: string; name?: string; role?: string },
): Person {
  const id = ref.personId ?? (ref.name ? nameToId.get(ref.name) ?? slugId(ref.name, 'person') : '')
  if (!id) throw new Error('Person event needs either personId or name.')
  const existing = people.get(id)
  if (existing) {
    if (ref.name) existing.name = ref.name
    if (ref.role) existing.role = ref.role
    return existing
  }
  const person = { id, name: ref.name ?? id, role: ref.role }
  people.set(id, person)
  if (person.name) nameToId.set(person.name, id)
  return person
}

function resolvePersonId(
  people: Map<string, Person>,
  nameToId: Map<string, string>,
  ref: { personId?: string; name?: string },
): string {
  if (ref.personId && people.has(ref.personId)) return ref.personId
  if (ref.name && nameToId.has(ref.name)) return nameToId.get(ref.name) as string
  throw new Error(`Unknown person in event: ${ref.personId ?? ref.name ?? '(missing)'}.`)
}

function resolveGrantId(
  grants: Map<string, Grant>,
  nameToId: Map<string, string>,
  ref: { grantId?: string; name?: string },
): string {
  if (ref.grantId && grants.has(ref.grantId)) return ref.grantId
  if (ref.name && nameToId.has(ref.name)) return nameToId.get(ref.name) as string
  throw new Error(`Unknown grant in event: ${ref.grantId ?? ref.name ?? '(missing)'}.`)
}

function slugId(name: string, fallback: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || fallback
}

function sortPeople(people: Person[]): Person[] {
  return people.slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

function sortGrants(grants: Grant[]): Grant[] {
  return grants
    .slice()
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.name.localeCompare(b.name))
}

function sortAllocations(allocations: Allocation[]): Allocation[] {
  return allocations
    .slice()
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        a.personId.localeCompare(b.personId) ||
        a.grantId.localeCompare(b.grantId),
    )
}

function sortExpenses(expenses: Expense[]): Expense[] {
  return expenses
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month) || a.grantId.localeCompare(b.grantId))
}

function sortBalanceResets(resets: BalanceReset[]): BalanceReset[] {
  return resets
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month) || a.grantId.localeCompare(b.grantId))
}

function sortSalaryRates(rates: SalaryRate[]): SalaryRate[] {
  return rates
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month) || a.personId.localeCompare(b.personId))
}

function appendUniqueMonth(months: string[] | undefined, month: string): string[] {
  const next = new Set(months ?? [])
  next.add(month)
  return [...next].sort()
}
