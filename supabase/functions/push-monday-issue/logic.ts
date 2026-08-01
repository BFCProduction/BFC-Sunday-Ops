export type IssueSeverity = 'Low' | 'Medium' | 'High' | 'Critical'
export type MondaySyncStatus = 'not_requested' | 'pending' | 'syncing' | 'synced' | 'failed'

export const CLAIMABLE_SYNC_STATUSES = ['not_requested', 'pending', 'failed'] as const

export function isMondaySyncComplete(status: MondaySyncStatus) {
  return status === 'synced'
}

export function shouldCreateMondayItem(itemId: string | null) {
  return !itemId
}

export function buildMondayColumnValues(
  issueIdColumnId: string,
  issueId: string,
  statusColumnId: string | undefined,
  severity: IssueSeverity,
) {
  const values: Record<string, unknown> = {
    [issueIdColumnId]: issueId,
  }
  if (statusColumnId) values[statusColumnId] = { label: severity }
  return JSON.stringify(values)
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function buildMondayItemName(title: string, severity: IssueSeverity) {
  const trimmed = title.trim().replace(/\s+/g, ' ')
  const snippet = trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed
  return snippet || severity
}

export function buildMondayUpdateBody(
  description: string,
  severity: IssueSeverity,
  issueId: string,
  photoUrls: string[] = [],
) {
  const lines = [
    `Severity: ${severity}`,
    `Issue ID: ${issueId}`,
    '',
    description.trim(),
  ]
  if (photoUrls.length > 0) {
    lines.push('', photoUrls.length === 1 ? 'Photo:' : 'Photos:')
    photoUrls.forEach((url, index) => lines.push(`${index + 1}. ${url}`))
  }
  return lines.join('\n')
}
