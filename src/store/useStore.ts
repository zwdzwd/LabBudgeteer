import { create } from 'zustand'
import type { AppData } from '../types'
import { SCHEMA_VERSION } from '../types'

// Sparse allocation key.
export function allocKey(personId: string, grantId: string, month: string): string {
  return `${personId}|${grantId}|${month}`
}

// The app is a read-only simulator: the YAML event file is the source of truth
// and is reloaded on every page load (see App.tsx). The store therefore holds
// only the compiled snapshot plus a single bulk-replace action — there is no
// editing UI and nothing to persist between sessions.
type State = AppData & {
  replaceAll: (data: AppData) => void
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
  replaceAll: (data) => set(() => ({ ...data })),
}))
