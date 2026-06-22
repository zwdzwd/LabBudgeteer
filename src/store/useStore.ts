import { create } from 'zustand'
import type { AppData } from '../types'
import { SCHEMA_VERSION } from '../types'

// Sparse allocation key.
export function allocKey(personId: string, grantId: string, month: string): string {
  return `${personId}|${grantId}|${month}`
}

// The app is a read-only simulator: the YAML event file is the source of truth
// and is reloaded on every page load (see App.tsx). The store holds the compiled
// snapshot plus raw events (if available) for the event viewer.
type State = AppData & {
  rawEvents: Record<string, any>[]
  replaceAll: (data: AppData, rawEvents?: Record<string, any>[]) => void
}

const initialData: AppData = {
  schemaVersion: SCHEMA_VERSION,
  people: [],
  grants: [],
  allocations: [],
  expenses: [],
  balanceResets: [],
  salaryRates: [],
  settings: {},
}

export const useStore = create<State>()((set) => ({
  ...initialData,
  rawEvents: [],
  replaceAll: (data, rawEvents = []) => set(() => ({ ...data, rawEvents })),
}))
