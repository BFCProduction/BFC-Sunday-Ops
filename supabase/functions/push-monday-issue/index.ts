import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  buildMondayItemName,
  buildMondayUpdateBody,
  buildMondayColumnValues,
  CLAIMABLE_SYNC_STATUSES,
  isMondaySyncComplete,
  isUuid,
  shouldCreateMondayItem,
  type IssueSeverity,
  type MondaySyncStatus,
} from './logic.ts'

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

const STALE_ATTEMPT_MS = 5 * 60 * 1000

interface IssueRow {
  id: string
  title: string
  description: string
  severity: IssueSeverity
  monday_item_id: string | null
  pushed_to_monday: boolean
  monday_sync_status: MondaySyncStatus
  monday_sync_started_at: string | null
}

interface MondayGraphqlResponse<T> {
  data?: T
  errors?: Array<{ message?: string }>
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonResponse(corsHeaders: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function verifySession(
  supabase: SupabaseClient,
  token: string | null,
): Promise<{ id: string } | null> {
  if (!token) return null

  const now = new Date().toISOString()
  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id')
    .eq('token', token)
    .gt('expires_at', now)
    .maybeSingle()

  if (!session) return null

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('id', session.user_id)
    .maybeSingle()

  if (!user) return null

  supabase
    .from('user_sessions')
    .update({ last_used_at: now })
    .eq('token', token)
    .then(() => {})

  return user
}

async function mondayRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  options?: { idempotencyKey?: string },
) {
  const token = Deno.env.get('MONDAY_API_TOKEN')
  if (!token) throw new Error('Missing MONDAY_API_TOKEN secret')

  const headers: Record<string, string> = {
    'Authorization': token,
    'Content-Type': 'application/json',
  }
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Monday API request failed with status ${response.status}`)
  }

  const payload = await response.json() as MondayGraphqlResponse<T>
  if (payload.errors?.length) {
    const message = payload.errors.map(error => error.message).filter(Boolean).join('; ')
    throw new Error(message || 'Monday API returned an error')
  }
  if (!payload.data) throw new Error('Monday API returned no data')
  return payload.data
}

async function findExistingMondayItemId(
  boardId: number,
  issueIdColumnId: string,
  issueId: string,
) {
  const data = await mondayRequest<{
    items_page_by_column_values: { items: Array<{ id: string }> }
  }>(`
    query FindIssueItem($boardId: ID!, $columns: [ItemsPageByColumnValuesQuery!]!) {
      items_page_by_column_values(board_id: $boardId, limit: 2, columns: $columns) {
        items {
          id
        }
      }
    }
  `, {
    boardId,
    columns: [{
      column_id: issueIdColumnId,
      column_values: [issueId],
    }],
  })

  const items = data.items_page_by_column_values.items
  if (items.length > 1) {
    console.error(`Multiple Monday items already reference Sunday Ops issue ${issueId}`)
  }
  return items[0]?.id ?? null
}

async function markFailed(
  supabase: SupabaseClient,
  issueId: string,
  attemptId: string,
  message: string,
) {
  const { error } = await supabase
    .from('issues')
    .update({
      monday_sync_status: 'failed',
      monday_sync_error: message,
    })
    .eq('id', issueId)
    .eq('monday_sync_attempt_id', attemptId)

  if (error) console.error('Failed to persist Monday sync failure:', error.message)
}

async function persistCreatedItem(
  supabase: SupabaseClient,
  issueId: string,
  attemptId: string,
  itemId: string,
) {
  let lastError = 'The created Monday item id could not be saved.'

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('issues')
      .update({
        pushed_to_monday: true,
        monday_item_id: itemId,
      })
      .eq('id', issueId)
      .eq('monday_sync_attempt_id', attemptId)
      .select('id')
      .maybeSingle()

    if (!error && data) return
    if (error) lastError = error.message
  }

  throw new Error(lastError)
}

Deno.serve(async request => {
  const corsHeaders = getCorsHeaders(request)

  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') {
    return jsonResponse(corsHeaders, 405, { error: 'Method not allowed' })
  }

  let claimedIssueId = ''
  let attemptId = ''
  let supabase: SupabaseClient | null = null

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase function secrets')

    supabase = createClient(supabaseUrl, serviceRoleKey)
    const user = await verifySession(supabase, request.headers.get('x-session-token'))
    if (!user) return jsonResponse(corsHeaders, 401, { error: 'Unauthorized' })

    const body = await request.json().catch(() => ({}))
    const issueId = typeof body?.issue_id === 'string' ? body.issue_id : ''
    if (!issueId || !isUuid(issueId)) {
      return jsonResponse(corsHeaders, 400, { error: 'A valid issue_id is required' })
    }

    const { data: existing, error: issueError } = await supabase
      .from('issues')
      .select('id, title, description, severity, monday_item_id, pushed_to_monday, monday_sync_status, monday_sync_started_at')
      .eq('id', issueId)
      .maybeSingle()

    if (issueError) throw issueError
    if (!existing) return jsonResponse(corsHeaders, 404, { error: 'Issue not found' })

    const issue = existing as IssueRow
    if (isMondaySyncComplete(issue.monday_sync_status)) {
      return jsonResponse(corsHeaders, 200, {
        itemId: issue.monday_item_id,
        status: 'synced',
        alreadySynced: true,
      })
    }

    const staleBefore = new Date(Date.now() - STALE_ATTEMPT_MS).toISOString()
    await supabase
      .from('issues')
      .update({
        monday_sync_status: 'failed',
        monday_sync_error: 'The previous sync attempt timed out. Please retry.',
      })
      .eq('id', issueId)
      .eq('monday_sync_status', 'syncing')
      .lt('monday_sync_started_at', staleBefore)

    attemptId = crypto.randomUUID()
    const now = new Date().toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('issues')
      .update({
        monday_sync_status: 'syncing',
        monday_sync_error: null,
        monday_sync_attempt_id: attemptId,
        monday_sync_started_at: now,
        monday_sync_attempted_at: now,
      })
      .eq('id', issueId)
      .in('monday_sync_status', [...CLAIMABLE_SYNC_STATUSES])
      .select('id, title, description, severity, monday_item_id, pushed_to_monday, monday_sync_status, monday_sync_started_at')
      .maybeSingle()

    if (claimError) throw claimError
    if (!claimed) {
      const { data: current } = await supabase
        .from('issues')
        .select('monday_item_id, pushed_to_monday, monday_sync_status')
        .eq('id', issueId)
        .maybeSingle()

      if (current?.monday_sync_status && isMondaySyncComplete(current.monday_sync_status)) {
        return jsonResponse(corsHeaders, 200, {
          itemId: current.monday_item_id,
          status: 'synced',
          alreadySynced: true,
        })
      }
      return jsonResponse(corsHeaders, 409, {
        error: 'This issue is already syncing with Monday.com.',
        status: current?.monday_sync_status ?? 'syncing',
      })
    }

    claimedIssueId = issueId
    const claimedIssue = claimed as IssueRow

    const mondayToken = Deno.env.get('MONDAY_API_TOKEN')
    const boardIdRaw = Deno.env.get('MONDAY_BOARD_ID')
    const issueIdColumnId = Deno.env.get('MONDAY_ISSUE_ID_COLUMN_ID')
    const boardId = Number(boardIdRaw)
    if (!mondayToken || !boardIdRaw || !Number.isFinite(boardId) || !issueIdColumnId) {
      await markFailed(supabase, issueId, attemptId, 'Monday.com integration is not configured.')
      return jsonResponse(corsHeaders, 503, {
        error: 'Monday.com integration is not configured.',
        status: 'failed',
      })
    }

    const { data: issuePhotos, error: photosError } = await supabase
      .from('issue_photos')
      .select('storage_path')
      .eq('issue_id', issueId)
      .order('uploaded_at', { ascending: true })

    if (photosError) throw photosError
    const photoUrls = ((issuePhotos ?? []) as Array<{ storage_path: string | null }>)
      .map(photo => photo.storage_path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
      .map(path => supabase!.storage.from('issue-photos').getPublicUrl(path).data.publicUrl)

    const statusColumnId = Deno.env.get('MONDAY_STATUS_COLUMN_ID') || undefined
    if (statusColumnId === issueIdColumnId) {
      await markFailed(supabase, issueId, attemptId, 'Monday.com integration is not configured.')
      return jsonResponse(corsHeaders, 503, {
        error: 'Monday.com integration is not configured.',
        status: 'failed',
      })
    }
    const columnValues = buildMondayColumnValues(
      issueIdColumnId,
      issueId,
      statusColumnId,
      claimedIssue.severity,
    )

    let itemId = claimedIssue.monday_item_id
    if (shouldCreateMondayItem(itemId)) {
      itemId = await findExistingMondayItemId(boardId, issueIdColumnId, issueId)

      if (!itemId) {
        const createItemData = await mondayRequest<{ create_item: { id: string } }>(`
          mutation CreateIssueItem($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
            create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
              id
            }
          }
        `, {
          boardId,
          groupId: Deno.env.get('MONDAY_GROUP_ID') || undefined,
          itemName: buildMondayItemName(claimedIssue.title, claimedIssue.severity),
          columnValues,
        }, {
          idempotencyKey: issueId,
        })

        itemId = createItemData.create_item.id
      }
      await persistCreatedItem(supabase, issueId, attemptId, itemId)
    }

    await mondayRequest(`
      mutation CreateIssueUpdate($itemId: ID!, $body: String!) {
        create_update(item_id: $itemId, body: $body) {
          id
        }
      }
    `, {
      itemId,
      body: buildMondayUpdateBody(
        claimedIssue.description,
        claimedIssue.severity,
        claimedIssue.id,
        photoUrls,
      ),
    }, {
      idempotencyKey: `${issueId}-initial-update`,
    })

    const syncedAt = new Date().toISOString()
    const { error: syncedError } = await supabase
      .from('issues')
      .update({
        pushed_to_monday: true,
        monday_item_id: itemId,
        monday_sync_status: 'synced',
        monday_sync_error: null,
        monday_synced_at: syncedAt,
      })
      .eq('id', issueId)
      .eq('monday_sync_attempt_id', attemptId)

    if (syncedError) throw syncedError

    return jsonResponse(corsHeaders, 200, {
      itemId,
      status: 'synced',
      alreadySynced: false,
    })
  } catch (error) {
    console.error('Monday issue sync failed:', error)
    const publicMessage = 'Monday.com follow-up could not be created. Please retry.'
    if (supabase && claimedIssueId && attemptId) {
      await markFailed(supabase, claimedIssueId, attemptId, publicMessage)
    }
    return jsonResponse(corsHeaders, 502, {
      error: publicMessage,
      status: 'failed',
    })
  }
})
