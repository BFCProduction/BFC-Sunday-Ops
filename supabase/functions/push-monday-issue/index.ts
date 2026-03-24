import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushIssuePayload {
  issue_id: string
  title: string
  description: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  photo_urls?: string[]
}

interface MondayGraphqlResponse<T> {
  data?: T
  errors?: Array<{ message?: string }>
}

function buildMondayItemName(title: string, severity: PushIssuePayload['severity']) {
  const trimmed = title.trim().replace(/\s+/g, ' ')
  const snippet = trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed
  return snippet || severity
}

function buildMondayUpdateBody(
  description: string,
  severity: PushIssuePayload['severity'],
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
    photoUrls.forEach((url, i) => lines.push(`${i + 1}. ${url}`))
  }
  return lines.join('\n')
}

async function mondayRequest<T>(query: string, variables: Record<string, unknown>) {
  const token = Deno.env.get('MONDAY_API_TOKEN')
  if (!token) {
    throw new Error('Missing MONDAY_API_TOKEN secret')
  }

  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
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

  if (!payload.data) {
    throw new Error('Monday API returned no data')
  }

  return payload.data
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase function secrets')
    }

    const boardIdRaw = Deno.env.get('MONDAY_BOARD_ID')
    if (!boardIdRaw) {
      throw new Error('Missing MONDAY_BOARD_ID secret')
    }

    const boardId = Number(boardIdRaw)
    if (!Number.isFinite(boardId)) {
      throw new Error('MONDAY_BOARD_ID must be a number')
    }

    const groupId = Deno.env.get('MONDAY_GROUP_ID') || undefined
    const statusColumnId = Deno.env.get('MONDAY_STATUS_COLUMN_ID') || undefined

    const body = await request.json() as PushIssuePayload
    if (!body.issue_id || !body.title?.trim() || !body.description?.trim() || !body.severity) {
      return new Response(JSON.stringify({ error: 'issue_id, title, description, and severity are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    const columnValues = statusColumnId
      ? JSON.stringify({ [statusColumnId]: { label: body.severity } })
      : undefined

    const createItemQuery = `
      mutation CreateIssueItem($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
        create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
          id
        }
      }
    `

    const createItemData = await mondayRequest<{ create_item: { id: string } }>(createItemQuery, {
      boardId,
      groupId,
      itemName: buildMondayItemName(body.title, body.severity),
      columnValues,
    })

    const itemId = createItemData.create_item.id
    const updateBody = buildMondayUpdateBody(body.description, body.severity, body.issue_id, body.photo_urls)

    const createUpdateQuery = `
      mutation CreateIssueUpdate($itemId: ID!, $body: String!) {
        create_update(item_id: $itemId, body: $body) {
          id
        }
      }
    `

    try {
      await mondayRequest(createUpdateQuery, {
        itemId,
        body: updateBody,
      })
    } catch (updateErr) {
      const msg = updateErr instanceof Error ? updateErr.message : String(updateErr)
      console.error('Monday update failed (non-fatal):', msg)
      // Don't throw — item was created, update is best-effort
    }

    const { error: updateIssueError } = await supabase
      .from('issues')
      .update({
        pushed_to_monday: true,
        monday_item_id: itemId,
      })
      .eq('id', body.issue_id)

    if (updateIssueError) {
      console.error('Supabase update failed:', updateIssueError.message)
      // Don't throw — Monday push succeeded, just log the DB sync failure
    }

    return new Response(JSON.stringify({ itemId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
