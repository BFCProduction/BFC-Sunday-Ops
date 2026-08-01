export interface MondaySyncResult {
  itemId: string | null
  status: 'synced'
  alreadySynced: boolean
}

function getFunctionUrl(name: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
}

export async function syncIssueToMonday(
  sessionToken: string,
  issueId: string,
): Promise<MondaySyncResult> {
  const response = await fetch(getFunctionUrl('push-monday-issue'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'x-session-token': sessionToken,
    },
    body: JSON.stringify({ issue_id: issueId }),
  })

  const payload = await response.json().catch(() => ({})) as {
    error?: string
    itemId?: string | null
    status?: string
    alreadySynced?: boolean
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your Sunday Ops session has expired. Sign in again before retrying.')
    }
    throw new Error(payload.error || `Monday.com sync failed with status ${response.status}.`)
  }

  return {
    itemId: typeof payload.itemId === 'string' ? payload.itemId : null,
    status: 'synced',
    alreadySynced: payload.alreadySynced === true,
  }
}
