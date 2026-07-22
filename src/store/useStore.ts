import { create } from 'zustand'
import type { AppData } from '../types'
import { SCHEMA_VERSION } from '../types'
import { parseImportedTXTWithEvents } from '../lib/io'

// Sparse allocation key.
export function allocKey(personId: string, grantId: string, month: string): string {
  return `${personId}|${grantId}|${month}`
}

// The event file is the source of truth; the store holds the compiled snapshot
// plus the verbatim source text. The in-page editor mutates the text at the
// line level and recompiles, so a round-trip through Export stays faithful to
// the file except for the edited lines. `dirty` flags in-browser edits that
// have not been exported yet.
type State = AppData & {
  rawEvents: Record<string, any>[]
  eventLineNumbers: number[]
  sourceText: string
  dirty: boolean
  replaceAll: (
    data: AppData,
    rawEvents?: Record<string, any>[],
    lineNumbers?: number[],
    sourceText?: string,
  ) => void
  editEventLine: (eventIndex: number, newLine: string) => string | null
  addEventLine: (line: string) => string | null
  deleteEventLine: (eventIndex: number) => string | null
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

export const useStore = create<State>()((set, get) => {
  // Recompile edited text; on success commit it and return null, on failure
  // leave the store untouched and return the error message.
  function applyEditedText(text: string): string | null {
    try {
      const { appData, events, lineNumbers } = parseImportedTXTWithEvents(text)
      set({
        ...appData,
        rawEvents: events,
        eventLineNumbers: lineNumbers,
        sourceText: text,
        dirty: true,
      })
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid event line.'
    }
  }

  return {
    ...initialData,
    rawEvents: [],
    eventLineNumbers: [],
    sourceText: '',
    dirty: false,
    replaceAll: (data, rawEvents = [], lineNumbers = [], sourceText = '') =>
      set(() => ({
        ...data,
        rawEvents,
        eventLineNumbers: lineNumbers,
        sourceText,
        dirty: false,
      })),
    editEventLine: (eventIndex, newLine) => {
      const { sourceText, eventLineNumbers } = get()
      const lineNo = eventLineNumbers[eventIndex]
      if (lineNo == null) return 'Unknown event line.'
      const lines = sourceText.split('\n')
      lines[lineNo] = newLine.trim()
      return applyEditedText(lines.join('\n'))
    },
    addEventLine: (line) => {
      const { sourceText, rawEvents, eventLineNumbers } = get()
      const trimmed = line.trim()
      const month = trimmed.split('|')[0]?.trim() ?? ''
      const lines = sourceText.split('\n')
      // Insert in chronological position: after the last event whose month is
      // <= the new event's month, else before the first event.
      let insertAt = lines.length
      if (eventLineNumbers.length > 0) {
        insertAt = eventLineNumbers[0]
        for (let i = 0; i < rawEvents.length; i++) {
          if (String(rawEvents[i].month ?? '') <= month) {
            insertAt = eventLineNumbers[i] + 1
          }
        }
      }
      lines.splice(insertAt, 0, trimmed)
      return applyEditedText(lines.join('\n'))
    },
    deleteEventLine: (eventIndex) => {
      const { sourceText, eventLineNumbers } = get()
      const lineNo = eventLineNumbers[eventIndex]
      if (lineNo == null) return 'Unknown event line.'
      const lines = sourceText.split('\n')
      lines.splice(lineNo, 1)
      return applyEditedText(lines.join('\n'))
    },
  }
})
