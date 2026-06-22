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
  type: z.literal('personnel_salary_rate'),
  month,
  annualSalary: z.number(),
})

const startGrantEventSchema = z.object({
  type: z.literal('grant_start'),
  month,
  grantId: z.string().optional(),
  name: z.string(),
  grtNumber: z.string().optional(),
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
  type: z.literal('personnel_cover'),
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
  grtNumber: z.string().optional(),
  sponsor: z.string().optional(),
  accountType: accountType.optional(),
  nextReportMonth: month.optional(),
  info: z.string().optional(),
  amount: z.string().optional(), // "1000" (reset), "+1000" (add), "-1000" (subtract)
  renewalId: z.string().optional(),
  description: z.string().optional(),
})

const terminatePersonnelEventSchema = personRef.extend({
  type: z.literal('personnel_terminate'),
  month,
})

const oneOffExpenditureEventSchema = grantRef.extend({
  type: z.literal('grant_cost'),
  month,
  expenseId: z.string().optional(),
  amount: z.number(),
  description: z.string().optional(),
})

const endGrantEventSchema = grantRef.extend({
  type: z.literal('grant_end'),
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
type CoverPersonEvent = Extract<EventFile['events'][number], { type: 'personnel_cover' }>
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

/** Parse + validate imported TXT (pipe-delimited). Throws with a friendly message on failure. */
export function parseImportedTXT(text: string): AppData {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))

  if (lines.length < 2) throw new Error('File is too short.')

  let schemaVersion = SCHEMA_VERSION
  let settings: z.infer<typeof settingsSchema> = {}
  let eventStartIdx = 0

  // Parse metadata
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('schemaVersion:')) {
      schemaVersion = parseInt(line.split(':')[1].trim())
      eventStartIdx = i + 1
    } else if (line.startsWith('settings:')) {
      const settingsStr = line.split(':').slice(1).join(':').trim()
      const pairs = settingsStr.split(' ')
      for (const pair of pairs) {
        const [k, v] = pair.split('=')
        if (k === 'startMonth' || k === 'endMonth') {
          settings[k] = v
        }
      }
      eventStartIdx = i + 1
    } else if (line.startsWith('month |')) {
      eventStartIdx = i + 1
      break
    }
  }

  if (schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Event file is from a newer version (v${schemaVersion}). Please update the app.`,
    )
  }

  // Parse events
  const events: Record<string, unknown>[] = []
  for (let i = eventStartIdx; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const parts = line.split('|').map(p => p.trim())
    if (parts.length < 2) continue

    const event: Record<string, unknown> = {
      month: parts[0],
      type: parts[1],
    }

    // Everything after type is key:value details, including the optional
    // grantId / personId keys (no longer fixed positional columns).
    const detailsStr = parts.slice(2).join('|').trim()
    Object.assign(event, parseDetailsPairs(detailsStr))

    events.push(event)
  }

  // Keep raw events for editing
  lastParsedEvents = events

  const eventFile: EventFile = { schemaVersion, settings, events: events as any }
  const result = eventFileSchema.safeParse(eventFile)
  if (!result.success) {
    console.error('Validation errors:', result.error.errors)
    throw new Error('File events do not match schema.')
  }

  return compileEvents(result.data)
}

function parseDetailsPairs(detailsStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let current = ''
  let inQuotes = false

  const commit = (token: string) => {
    // Split on the FIRST colon only, so values may contain colons.
    const idx = token.indexOf(':')
    if (idx <= 0) return
    const k = token.slice(0, idx)
    const v = token.slice(idx + 1)
    if (k && v) result[k] = parseValue(v)
  }

  for (let i = 0; i < detailsStr.length; i++) {
    const char = detailsStr[i]
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        commit(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current) commit(current)

  return result
}

function parseValue(val: string): unknown {
  const trimmed = val.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }
  if (trimmed === '') return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (!isNaN(Number(trimmed))) {
    return Number(trimmed)
  }
  return trimmed
}

/** Convert AppData + events back to TXT format for export. */
export function exportEventsTXT(
  appData: AppData,
  startMonth?: string,
  endMonth?: string,
): string {
  const lines: string[] = []

  // Metadata
  lines.push(`schemaVersion: ${appData.schemaVersion}`)
  if (appData.settings.startMonth || appData.settings.endMonth || startMonth || endMonth) {
    const settings = []
    if (appData.settings.startMonth || startMonth) settings.push(`startMonth=${startMonth || appData.settings.startMonth}`)
    if (appData.settings.endMonth || endMonth) settings.push(`endMonth=${endMonth || appData.settings.endMonth}`)
    lines.push(`settings: ${settings.join(' ')}`)
  }
  lines.push('')

  // Reconstruct events from appData
  const eventMap = new Map<string, any>()

  // Add salary rates
  for (const sr of appData.salaryRates) {
    const key = `${sr.month}|personnel_salary_rate|${sr.personId}`
    eventMap.set(key, {
      month: sr.month,
      type: 'personnel_salary_rate',
      personId: sr.personId,
      annualSalary: sr.annualSalary,
    })
  }

  // Add grants
  for (const grant of appData.grants) {
    const startKey = `${grant.startMonth}|grant_start|${grant.id}`
    const startEvent: any = {
      month: grant.startMonth,
      type: 'grant_start',
      grantId: grant.id,
      name: grant.name,
    }
    if (grant.accountType) startEvent.accountType = grant.accountType
    if (grant.sponsor) startEvent.sponsor = grant.sponsor
    if (grant.nextReportMonth) startEvent.nextReportMonth = grant.nextReportMonth
    if (grant.info) startEvent.info = grant.info
    if (grant.budget) startEvent.budget = grant.budget
    if (grant.budgetStartMonth) startEvent.budgetStartMonth = grant.budgetStartMonth
    eventMap.set(startKey, startEvent)

    if (grant.endMonth) {
      const endKey = `${grant.endMonth}|grant_end|${grant.id}`
      eventMap.set(endKey, {
        month: grant.endMonth,
        type: 'grant_end',
        grantId: grant.id,
        name: grant.name,
      })
    }
  }

  // Add allocations
  for (const alloc of appData.allocations) {
    const key = `${alloc.month}|personnel_cover|${alloc.grantId}|${alloc.personId}`
    eventMap.set(key, {
      month: alloc.month,
      type: 'personnel_cover',
      grantId: alloc.grantId,
      personId: alloc.personId,
      effort: alloc.effort,
    })
  }

  // Add expenses
  for (const exp of appData.expenses) {
    const key = `${exp.month}|grant_cost|${exp.grantId}|${exp.id}`
    eventMap.set(key, {
      month: exp.month,
      type: 'grant_cost',
      grantId: exp.grantId,
      amount: exp.amount,
      description: exp.description,
    })
  }

  // Add balance resets
  for (const reset of appData.balanceResets) {
    const key = `${reset.month}|grant_renew|${reset.grantId}|${reset.id}`
    eventMap.set(key, {
      month: reset.month,
      type: 'grant_renew',
      grantId: reset.grantId,
      amount: reset.operation === 'reset' ? reset.amount : (reset.operation === 'add' ? `+${reset.amount}` : `-${reset.amount}`),
      renewalId: reset.id,
      description: reset.description,
    })
  }

  // Header
  lines.push('month | type | details')

  // Sort and output events
  const sorted = Array.from(eventMap.values()).sort((a, b) => {
    const monthCmp = a.month.localeCompare(b.month)
    if (monthCmp !== 0) return monthCmp
    return a.type.localeCompare(b.type)
  })

  for (const event of sorted) {
    const month = event.month
    const type = event.type

    // grantId / personId lead the details as plain keys, then everything else.
    const details: string[] = []
    if (event.grantId) details.push(`grantId:${event.grantId}`)
    if (event.personId) details.push(`personId:${event.personId}`)
    for (const [k, v] of Object.entries(event)) {
      if (['month', 'type', 'grantId', 'personId'].includes(k)) continue
      const val = typeof v === 'string' && (v.includes(' ') || v.includes(':')) ? `"${v}"` : v
      details.push(`${k}:${val}`)
    }

    lines.push(`${month} | ${type} | ${details.join(' ')}`)
  }

  return lines.join('\n')
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
    if (event.type !== 'grant_end') continue
    const key = event.grantId ?? (event.name ? slugId(event.name, 'grant') : undefined)
    if (key) endByGrant.set(key, event.month)
  }

  for (const event of file.events) {
    if (event.type === 'personnel_salary_rate') {
      const person = ensurePerson(people, personNameToId, event)
      person.annualSalary = event.annualSalary
      salaryRates.push({
        personId: person.id,
        month: event.month,
        annualSalary: event.annualSalary,
      })
      continue
    }

    if (event.type === 'grant_start') {
      const id = event.grantId ?? slugId(event.name, 'grant')
      const endMonth = event.endMonth ?? endByGrant.get(id) ?? event.month
      const colorIndex = grants.size % GRANT_COLORS.length
      const grant: Grant = {
        id,
        name: event.name,
        grtNumber: event.grtNumber,
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
        grtNumber: event.grtNumber ?? grant.grtNumber,
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

    if (event.type === 'personnel_cover') {
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

    if (event.type === 'personnel_terminate') {
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

    if (event.type === 'grant_cost') {
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

    if (event.type === 'grant_end') {
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

// Store raw events for the editor
let lastParsedEvents: Record<string, any>[] = []

export function getLastParsedEvents(): Record<string, any>[] {
  return lastParsedEvents
}

/** Parse TXT and keep track of raw events for editing. */
export function parseImportedTXTWithEvents(text: string): { appData: AppData; events: Record<string, any>[] } {
  const appData = parseImportedTXT(text)
  const events = [...lastParsedEvents]
  return { appData, events }
}
