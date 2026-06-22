// Money formatting helpers shared across the dashboard charts.

/** Full dollar amount, e.g. -1234 -> "-$1,234". */
export const money = (n: number): string =>
  (n < 0 ? '-' : '') +
  '$' +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

/** Compact dollar amount for axis ticks, e.g. 1_500_000 -> "$1.5M". */
export const compactMoney = (n: number): string => {
  const sign = n < 0 ? '-' : ''
  const value = Math.abs(n)
  if (value >= 1_000_000) return `${sign}$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${sign}$${Math.round(value / 1_000)}k`
  return `${sign}$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
