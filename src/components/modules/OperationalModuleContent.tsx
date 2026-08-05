import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchModuleContent, prepareModuleIntercom, type ModuleContentResponse } from '../../lib/moduleContent'
import type { ModuleInstance, Session, Workbook } from '../../types'
import { Card } from '../ui/Card'
import { CrewTab } from '../workbook/CrewTab'
import { IntercomGrid } from '../workbook/IntercomGrid'
import { SuppliesTab } from '../workbook/SuppliesTab'

interface OperationalModuleContentProps {
  module: ModuleInstance
  contextLabel: string
  sessionToken: string
  isAdmin: boolean
  event: Session | null
  workbook: Workbook | null
  linkedEvents: Session[]
  onOperationalChanged?: () => Promise<void>
}

function workbookDays(workbook: Workbook | null, event: Session | null) {
  if (event) return [event.date]
  if (!workbook) return []
  const days: string[] = []
  const cursor = new Date(`${workbook.start_date}T12:00:00Z`)
  const end = new Date(`${workbook.end_date}T12:00:00Z`)
  while (cursor <= end && days.length < 370) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function OperationalModuleContent({
  module,
  contextLabel,
  sessionToken,
  isAdmin,
  event,
  workbook,
  linkedEvents,
  onOperationalChanged,
}: OperationalModuleContentProps) {
  const [content, setContent] = useState<ModuleContentResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const editable = module.status === 'active'

  const load = useCallback(async () => {
    setError('')
    const next = module.module_key === 'intercom' && editable
      ? await prepareModuleIntercom(sessionToken, module.id)
      : await fetchModuleContent(sessionToken, module.id)
    setContent(next)
  }, [editable, module.id, module.module_key, sessionToken])

  const reloadAfterChange = useCallback(async () => {
    await load()
    await onOperationalChanged?.()
  }, [load, onOperationalChanged])

  useEffect(() => {
    let active = true
    const request = module.module_key === 'intercom' && editable
      ? prepareModuleIntercom(sessionToken, module.id)
      : fetchModuleContent(sessionToken, module.id)
    request
      .then(next => { if (active) setContent(next) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load module content.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [editable, module.id, module.module_key, sessionToken])

  const days = useMemo(() => workbookDays(workbook, event), [event, workbook])
  const ownerEvents = event ? [event] : linkedEvents
  const pcoSyncWorkbookId = module.event_id ? event?.workbookId ?? null : null

  if (loading) {
    return <Card className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading module content…</Card>
  }
  if (error) return <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
  if (!content) return null

  if (module.module_key === 'crew') {
    return (
      <CrewTab
        moduleId={module.id}
        workbookId={pcoSyncWorkbookId}
        workbookDays={days}
        linkedEvents={ownerEvents}
        users={content.people}
        roles={content.roles}
        crew={content.crew}
        editable={editable}
        isAdmin={isAdmin}
        sessionToken={sessionToken}
        onChanged={reloadAfterChange}
      />
    )
  }

  if (module.module_key === 'supplies') {
    return (
      <SuppliesTab
        moduleId={module.id}
        departments={content.departments}
        supplies={content.supplies}
        editable={editable}
        isAdmin={isAdmin}
        sessionToken={sessionToken}
        onChanged={reloadAfterChange}
      />
    )
  }

  if (module.module_key === 'intercom') {
    return (
      <IntercomGrid
        moduleId={module.id}
        contextLabel={contextLabel}
        users={content.people}
        roles={content.roles}
        crew={content.crew}
        initialData={{ channels: content.intercom_channels, assignments: content.intercom_assignments }}
        packTypes={content.intercom_config.pack_types}
        masterChannels={content.intercom_config.master_channels}
        editable={editable}
        sessionToken={sessionToken}
        onChanged={reloadAfterChange}
      />
    )
  }

  return null
}
