// Pure helpers for summing effort and flagging months that don't total 100%.

import type { Allocation } from '../types'
import { allocKey } from '../store/useStore'
import { inRange } from './months'

/** Fast lookup map: "person|grant|month" -> effort. */
export function buildAllocMap(allocations: Allocation[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const a of allocations) {
    map.set(allocKey(a.personId, a.grantId, a.month), a.effort)
  }
  return map
}

/** Effort for one cell (0 if absent). */
export function getEffort(
  map: Map<string, number>,
  personId: string,
  grantId: string,
  month: string,
): number {
  return map.get(allocKey(personId, grantId, month)) ?? 0
}

/** Total effort for a person in a given month, summed across all grants. */
export function personMonthTotal(
  allocations: Allocation[],
  personId: string,
  month: string,
): number {
  let sum = 0
  for (const a of allocations) {
    if (a.personId === personId && a.month === month) sum += a.effort
  }
  return sum
}

/**
 * Sum effort per person and grant over an inclusive month range, expressed in
 * person-months (sum of monthly effort / 100). Effort is the salary share
 * recorded in the event file, so a 50% FTE appointment still reads as up to
 * 100 here. Returns personId -> grantId -> person-months, non-zero cells only.
 */
export function effortOverRange(
  allocations: Allocation[],
  start: string,
  end: string,
  grantId?: string | null,
): Map<string, Map<string, number>> {
  const byPerson = new Map<string, Map<string, number>>()
  for (const a of allocations) {
    if (a.effort <= 0 || !inRange(a.month, start, end)) continue
    if (grantId != null && a.grantId !== grantId) continue
    let grants = byPerson.get(a.personId)
    if (!grants) {
      grants = new Map()
      byPerson.set(a.personId, grants)
    }
    grants.set(a.grantId, (grants.get(a.grantId) ?? 0) + a.effort / 100)
  }
  return byPerson
}

export type AllocationStatus = 'empty' | 'ok' | 'under' | 'over'

/** Classify a per-person monthly total. Uses a tiny epsilon for float safety. */
export function statusForTotal(total: number): AllocationStatus {
  if (total <= 0) return 'empty'
  if (Math.abs(total - 100) < 0.001) return 'ok'
  return total < 100 ? 'under' : 'over'
}
