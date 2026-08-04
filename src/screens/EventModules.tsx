import { useEffect, useState } from 'react'
import { Blocks, Loader2 } from 'lucide-react'
import { ModuleWorkspace } from '../components/modules/ModuleWorkspace'
import { useAuth } from '../context/authState'
import { loadLocations } from '../lib/productionConfig'
import type { Location, Session } from '../types'

export function EventModules({ event }: { event: Session | null }) {
  const { sessionToken, isManager } = useAuth()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    loadLocations()
      .then(result => { if (active) setLocations(result) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load rooms.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (!event || !sessionToken) return null

  return (
    <div className="fade-in min-h-full bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-4 py-5 md:px-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-700">
            <Blocks className="h-3.5 w-3.5" /> Event Modules
          </div>
          <h1 className="mt-3 text-2xl font-bold text-gray-950">{event.name}</h1>
          <p className="mt-1 text-sm text-gray-500">Live production documents owned by this Event.</p>
        </div>
      </div>
      <div className="mx-auto max-w-[1600px] p-3 md:p-6">
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Event workspace…
          </div>
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : (
          <ModuleWorkspace
            sessionToken={sessionToken}
            isManager={isManager}
            locations={locations}
            event={event}
          />
        )}
      </div>
    </div>
  )
}
