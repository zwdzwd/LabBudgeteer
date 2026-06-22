import { useState } from 'react'
import { useStore } from '../store/useStore'
import { exportEventsTXT } from '../lib/io'

interface EventEditorProps {
  isOpen: boolean
  onToggle: () => void
}

export function EventEditor({ isOpen, onToggle }: EventEditorProps) {
  const { rawEvents, updateRawEvents, settings } = useStore()
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [newEventOpen, setNewEventOpen] = useState(false)

  const handleDownload = () => {
    const appData = useStore.getState()
    const txt = exportEventsTXT(appData, settings.startMonth, settings.endMonth)
    const blob = new Blob([txt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'budget_events.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddEvent = (event: any) => {
    const newEvents = [...rawEvents, event]
    updateRawEvents(newEvents)
    setNewEventOpen(false)
  }

  const handleUpdateEvent = (idx: number, event: any) => {
    const newEvents = [...rawEvents]
    newEvents[idx] = event
    updateRawEvents(newEvents)
    setEditingIdx(null)
  }

  const handleDeleteEvent = (idx: number) => {
    const newEvents = rawEvents.filter((_, i) => i !== idx)
    updateRawEvents(newEvents)
  }

  return (
    <>
      {/* Slide-out Panel */}
      <div
        className={`fixed left-0 top-0 h-screen w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 z-[85] overflow-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-50 border-b p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Events</h2>
            <button
              onClick={onToggle}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
            >
              Download .txt
            </button>
            <button
              onClick={() => setNewEventOpen(true)}
              className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
            >
              Add Event
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-2">
          {newEventOpen && (
            <EventForm
              isNew
              event={{}}
              onSave={handleAddEvent}
              onCancel={() => setNewEventOpen(false)}
            />
          )}

          {rawEvents.length === 0 ? (
            <div className="text-gray-500 text-sm py-8 text-center">No events loaded</div>
          ) : (
            rawEvents.map((event, idx) => (
              <div key={idx}>
                {editingIdx === idx ? (
                  <EventForm
                    event={event}
                    onSave={(updated) => handleUpdateEvent(idx, updated)}
                    onCancel={() => setEditingIdx(null)}
                  />
                ) : (
                  <EventRow
                    event={event}
                    idx={idx}
                    onEdit={() => setEditingIdx(idx)}
                    onDelete={() => handleDeleteEvent(idx)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-[84]"
          onClick={onToggle}
        />
      )}
    </>
  )
}

function EventRow({
  event,
  idx,
  onEdit,
  onDelete,
}: {
  event: any
  idx: number
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="p-3 bg-gray-50 rounded border-l-4 border-blue-500 space-y-2">
      <div className="text-xs font-mono text-gray-700 font-bold">
        {event.month} | {event.type}
      </div>
      <div className="text-sm text-gray-800 line-clamp-2">
        {event.name || event.grantId || event.personId || `(Event ${idx + 1})`}
      </div>
      <div className="text-xs text-gray-600 space-y-1">
        {event.grantId && <div>Grant: {event.grantId}</div>}
        {event.personId && <div>Person: {event.personId}</div>}
        {event.effort && <div>Effort: {event.effort}%</div>}
        {event.amount && <div>Amount: {event.amount}</div>}
        {event.annualSalary && <div>Salary: ${event.annualSalary}</div>}
      </div>
      <div className="flex gap-2 pt-2">
        <button
          onClick={onEdit}
          className="flex-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex-1 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function EventForm({
  event,
  isNew,
  onSave,
  onCancel,
}: {
  event: any
  isNew?: boolean
  onSave: (e: any) => void
  onCancel: () => void
}) {
  const [data, setData] = useState(event)

  const handleChange = (key: string, value: any) => {
    setData({ ...data, [key]: value || undefined })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(data)
      }}
      className="p-3 bg-blue-50 rounded border border-blue-200 space-y-2"
    >
      <div>
        <label className="block text-xs font-bold mb-1 text-gray-700">Month *</label>
        <input
          type="text"
          placeholder="YYYY-MM"
          value={data.month || ''}
          onChange={(e) => handleChange('month', e.target.value)}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-bold mb-1 text-gray-700">Type *</label>
        <select
          value={data.type || ''}
          onChange={(e) => handleChange('type', e.target.value)}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          required
        >
          <option value="">Select type</option>
          <option>start_grant</option>
          <option>end_grant</option>
          <option>grant_renew</option>
          <option>cover_person</option>
          <option>salary_rate</option>
          <option>terminate_personnel</option>
          <option>one_off_expenditure</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-bold mb-1 text-gray-700">Grant ID</label>
          <input
            type="text"
            value={data.grantId || ''}
            onChange={(e) => handleChange('grantId', e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 text-gray-700">Person ID</label>
          <input
            type="text"
            value={data.personId || ''}
            onChange={(e) => handleChange('personId', e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold mb-1 text-gray-700">Name</label>
        <input
          type="text"
          value={data.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-bold mb-1 text-gray-700">Effort %</label>
          <input
            type="number"
            value={data.effort || ''}
            onChange={(e) => handleChange('effort', e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 text-gray-700">Amount</label>
          <input
            type="text"
            value={data.amount || ''}
            onChange={(e) => handleChange('amount', e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-bold mb-1 text-gray-700">Start Month</label>
          <input
            type="text"
            placeholder="YYYY-MM"
            value={data.startMonth || ''}
            onChange={(e) => handleChange('startMonth', e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 text-gray-700">End Month</label>
          <input
            type="text"
            placeholder="YYYY-MM"
            value={data.endMonth || ''}
            onChange={(e) => handleChange('endMonth', e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold mb-1 text-gray-700">Annual Salary</label>
        <input
          type="number"
          value={data.annualSalary || ''}
          onChange={(e) => handleChange('annualSalary', e.target.value ? parseFloat(e.target.value) : undefined)}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-bold mb-1 text-gray-700">Description</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
        >
          {isNew ? 'Add' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 bg-gray-400 text-white text-xs font-medium rounded hover:bg-gray-500"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
