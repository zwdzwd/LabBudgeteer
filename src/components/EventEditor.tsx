import { useState } from 'react'
import type { AppData } from '../types'
import { exportEventsTXT } from '../lib/io'

interface EventEditorProps {
  appData: AppData
  isOpen: boolean
  onToggle: () => void
}

export function EventEditor({ appData, isOpen, onToggle }: EventEditorProps) {
  const [editingEvent, setEditingEvent] = useState<any>(null)

  const handleExport = () => {
    const txt = exportEventsTXT(appData)
    const blob = new Blob([txt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'budget_events.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const allEvents = reconstructEvents()

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="fixed left-4 top-4 z-40 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        title="Toggle event editor"
      >
        {isOpen ? '✕ Close' : '✎ Events'}
      </button>

      {/* Slide-out Panel */}
      <div
        className={`fixed left-0 top-0 h-screen w-96 bg-white shadow-2xl transform transition-transform duration-300 z-30 overflow-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 sticky top-0 bg-gray-50 border-b">
          <h2 className="text-lg font-bold mb-3">Event Editor</h2>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              Export .txt
            </button>
            <button
              onClick={() => setEditingEvent({ new: true })}
              className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Add Event
            </button>
          </div>
        </div>

        <div className="p-4">
          {editingEvent ? (
            <EventForm
              event={editingEvent}
              onSave={() => {
                // TODO: update appData
                setEditingEvent(null)
              }}
              onCancel={() => setEditingEvent(null)}
            />
          ) : (
            <EventTable
              events={allEvents}
              onEdit={(event) => setEditingEvent({ ...event })}
              onDelete={() => {
                // TODO: delete from appData
              }}
            />
          )}
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-20"
          onClick={onToggle}
        />
      )}
    </>
  )
}

function EventTable({
  events,
  onEdit,
  onDelete,
}: {
  events: any[]
  onEdit: (e: any) => void
  onDelete: (e: any) => void
}) {
  return (
    <div className="space-y-2">
      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">No events</p>
      ) : (
        events.map((event, i) => (
          <div
            key={i}
            className="p-3 bg-gray-100 rounded text-sm border-l-4 border-blue-500"
          >
            <div className="font-mono text-xs mb-2 text-gray-700">
              {event.month} | {event.type}
            </div>
            <div className="text-gray-800 mb-2 line-clamp-2">
              {event.name || event.grantId || event.personId || '(unnamed)'}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onEdit(event)}
                className="flex-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(event)}
                className="flex-1 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function EventForm({
  event,
  onSave,
  onCancel,
}: {
  event: any
  onSave: (e: any) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState(event)

  const handleChange = (key: string, value: any) => {
    setFormData({ ...formData, [key]: value })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(formData)
      }}
      className="space-y-3"
    >
      <div>
        <label className="block text-xs font-bold mb-1">Month</label>
        <input
          type="text"
          placeholder="YYYY-MM"
          value={formData.month || ''}
          onChange={(e) => handleChange('month', e.target.value)}
          className="w-full px-2 py-1 border rounded text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Type</label>
        <select
          value={formData.type || ''}
          onChange={(e) => handleChange('type', e.target.value)}
          className="w-full px-2 py-1 border rounded text-sm"
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

      <div>
        <label className="block text-xs font-bold mb-1">Grant ID</label>
        <input
          type="text"
          value={formData.grantId || ''}
          onChange={(e) => handleChange('grantId', e.target.value)}
          className="w-full px-2 py-1 border rounded text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Person ID</label>
        <input
          type="text"
          value={formData.personId || ''}
          onChange={(e) => handleChange('personId', e.target.value)}
          className="w-full px-2 py-1 border rounded text-sm"
        />
      </div>

      <div className="pt-3 flex gap-2">
        <button
          type="submit"
          className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 bg-gray-400 text-white text-sm rounded hover:bg-gray-500"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function reconstructEvents(): any[] {
  // TODO: Reconstruct events from AppData
  // This will show grants, allocations, expenses, etc.
  return []
}
