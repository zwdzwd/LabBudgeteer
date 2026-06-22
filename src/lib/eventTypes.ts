// Shared color per event type, used by the event viewer (type label) and the
// balance chart (highlight circle edge) so they stay visually consistent.
export const EVENT_TYPE_COLORS: Record<string, string> = {
  grant_start: '#16a34a', // green
  grant_end: '#dc2626', // red
  grant_renew: '#db2777', // pink
  personnel_cover: '#2563eb', // blue
  personnel_terminate: '#ea580c', // orange
  personnel_salary_rate: '#7c3aed', // purple
  grant_cost: '#0891b2', // cyan
}

const DEFAULT_EVENT_COLOR = '#64748b' // slate

export function eventTypeColor(type: string | undefined | null): string {
  if (!type) return DEFAULT_EVENT_COLOR
  return EVENT_TYPE_COLORS[type] ?? DEFAULT_EVENT_COLOR
}
