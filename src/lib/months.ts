// Helpers for "YYYY-MM" month strings. Kept dependency-free and pure.

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Validate a "YYYY-MM" string. */
export function isMonth(s: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(s)) return false
  const m = Number(s.slice(5))
  return m >= 1 && m <= 12
}

/** Convert "YYYY-MM" to a comparable integer (year*12 + monthIndex). */
export function monthToIndex(s: string): number {
  const year = Number(s.slice(0, 4))
  const month = Number(s.slice(5)) - 1
  return year * 12 + month
}

/** Inverse of monthToIndex. */
export function indexToMonth(idx: number): string {
  const year = Math.floor(idx / 12)
  const month = idx % 12
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`
}

/** Add n months (n may be negative). */
export function addMonth(s: string, n: number): string {
  return indexToMonth(monthToIndex(s) + n)
}

/** Inclusive ordered list of months from start..end. Empty if start > end. */
export function monthRange(start: string, end: string): string[] {
  const a = monthToIndex(start)
  const b = monthToIndex(end)
  if (a > b) return []
  const out: string[] = []
  for (let i = a; i <= b; i++) out.push(indexToMonth(i))
  return out
}

/** True if month is within [start, end] inclusive. */
export function inRange(month: string, start: string, end: string): boolean {
  const m = monthToIndex(month)
  return m >= monthToIndex(start) && m <= monthToIndex(end)
}

/** Pretty label, e.g. "2026-01" -> "Jan 2026". */
export function formatMonth(s: string): string {
  const year = s.slice(0, 4)
  const month = Number(s.slice(5)) - 1
  return `${MONTH_NAMES[month] ?? '???'} ${year}`
}

/** Short label, e.g. "2026-01" -> "Jan '26". */
export function formatMonthShort(s: string): string {
  const year = s.slice(2, 4)
  const month = Number(s.slice(5)) - 1
  return `${MONTH_NAMES[month] ?? '???'} '${year}`
}

/** Current month as "YYYY-MM" using local time. */
export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** min of two months. */
export function minMonth(a: string, b: string): string {
  return monthToIndex(a) <= monthToIndex(b) ? a : b
}

/** max of two months. */
export function maxMonth(a: string, b: string): string {
  return monthToIndex(a) >= monthToIndex(b) ? a : b
}

/** The next month after the current one. */
export function nextMonth(): string {
  return indexToMonth(monthToIndex(currentMonth()) + 1)
}

/**
 * First future month within a visible window, used to shade the projection
 * region of a chart. Returns null when the whole window is in the past.
 */
export function projectionStartForYear(months: string[]): string | null {
  if (months.length === 0) return null
  const current = currentMonth()
  if (monthToIndex(months[months.length - 1]) <= monthToIndex(current)) return null
  if (monthToIndex(months[0]) > monthToIndex(current)) return months[0]
  return nextMonth()
}
