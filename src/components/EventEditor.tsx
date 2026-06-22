import { useStore } from '../store/useStore'

interface EventEditorProps {
  isOpen: boolean
  onToggle: () => void
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  start_grant: 'bg-blue-100 border-blue-300',
  end_grant: 'bg-red-100 border-red-300',
  grant_renew: 'bg-purple-100 border-purple-300',
  cover_person: 'bg-green-100 border-green-300',
  salary_rate: 'bg-yellow-100 border-yellow-300',
  terminate_personnel: 'bg-orange-100 border-orange-300',
  one_off_expenditure: 'bg-pink-100 border-pink-300',
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  start_grant: '📊',
  end_grant: '🔚',
  grant_renew: '🔄',
  cover_person: '👤',
  salary_rate: '💰',
  terminate_personnel: '🚪',
  one_off_expenditure: '💸',
}

function getRelevantFields(event: any): Record<string, any> {
  const type = event.type
  const fields: Record<string, any> = {}

  // Common fields
  if (event.name) fields.name = event.name
  if (event.description) fields.description = event.description

  // Type-specific fields
  switch (type) {
    case 'start_grant':
      if (event.grantId) fields.grantId = event.grantId
      if (event.accountType) fields.accountType = event.accountType
      if (event.endMonth) fields.endMonth = event.endMonth
      if (event.budget) fields.budget = event.budget
      if (event.nextReportMonth) fields.nextReportMonth = event.nextReportMonth
      break

    case 'end_grant':
      if (event.grantId) fields.grantId = event.grantId
      break

    case 'grant_renew':
      if (event.grantId) fields.grantId = event.grantId
      if (event.amount) fields.amount = event.amount
      if (event.nextReportMonth) fields.nextReportMonth = event.nextReportMonth
      break

    case 'cover_person':
      if (event.grantId) fields.grantId = event.grantId
      if (event.personId) fields.personId = event.personId
      if (event.effort) fields.effort = `${event.effort}%`
      if (event.startMonth) fields.startMonth = event.startMonth
      if (event.endMonth) fields.endMonth = event.endMonth
      if (event.capAtTotal) fields.capAtTotal = `${event.capAtTotal}%`
      break

    case 'salary_rate':
      if (event.personId) fields.personId = event.personId
      if (event.annualSalary) fields.annualSalary = `$${event.annualSalary.toLocaleString()}`
      break

    case 'terminate_personnel':
      if (event.personId) fields.personId = event.personId
      break

    case 'one_off_expenditure':
      if (event.grantId) fields.grantId = event.grantId
      if (event.amount) fields.amount = event.amount
      break
  }

  return fields
}

export function EventEditor({ isOpen, onToggle }: EventEditorProps) {
  const { rawEvents } = useStore()

  return (
    <>
      {/* Slide-out Panel */}
      <div
        className={`fixed left-0 top-0 h-screen w-full max-w-2xl bg-white shadow-2xl transform transition-transform duration-300 z-[85] overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Events</h2>
            <p className="text-sm text-slate-300 mt-1">{rawEvents.length} event{rawEvents.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={onToggle}
            className="text-white hover:text-slate-300 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {rawEvents.length === 0 ? (
            <div className="text-gray-500 text-center py-12">
              <p className="text-lg font-medium mb-2">No events loaded</p>
              <p className="text-sm">Open a .txt file to view events</p>
            </div>
          ) : (
            rawEvents.map((event, idx) => (
              <EventCard key={idx} event={event} idx={idx} />
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

function EventCard({ event, idx }: { event: any; idx: number }) {
  const type = event.type
  const colors = EVENT_TYPE_COLORS[type] || 'bg-gray-100 border-gray-300'
  const icon = EVENT_TYPE_ICONS[type] || '📋'
  const fields = getRelevantFields(event)

  return (
    <div className={`p-4 rounded-lg border-2 ${colors} transition-all hover:shadow-md`}>
      {/* Header with icon and type */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <div>
          <div className="font-mono text-sm font-bold text-gray-900">
            {event.month}
          </div>
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            {type.replace(/_/g, ' ')}
          </div>
        </div>
      </div>

      {/* Fields Grid */}
      <div className="space-y-2">
        {Object.entries(fields).map(([key, value]) => {
          const displayKey = key.replace(/([A-Z])/g, ' $1').trim()
          return (
            <div
              key={key}
              className="flex justify-between items-start gap-3 text-sm"
            >
              <span className="font-medium text-gray-700 min-w-max">
                {displayKey}:
              </span>
              <span className="text-gray-900 text-right break-words max-w-xs">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Index badge */}
      <div className="mt-3 text-xs text-gray-600 opacity-60">
        Event #{idx + 1}
      </div>
    </div>
  )
}
