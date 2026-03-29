import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
  }
}

function getExpectedPassword() {
  return Deno.env.get('ADMIN_PASSWORD') || Deno.env.get('VITE_ADMIN_PASSWORD') || ''
}

function jsonResponse(corsHeaders: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeRecipient(payload: Record<string, unknown>) {
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const active = typeof payload.active === 'boolean' ? payload.active : true
  const sortOrder = Number.isFinite(payload.sort_order) ? Number(payload.sort_order) : 0

  if (!email) {
    throw new Error('Recipient email is required')
  }

  return {
    name: name || null,
    email,
    active,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  }
}

Deno.serve(async request => {
  const corsHeaders = getCorsHeaders(request)

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const expectedPassword = getExpectedPassword()
    if (!expectedPassword) {
      throw new Error('ADMIN_PASSWORD secret is not configured')
    }

    const providedPassword = request.headers.get('x-admin-password') || ''
    if (!providedPassword || providedPassword !== expectedPassword) {
      return jsonResponse(corsHeaders, 401, { error: 'Unauthorized' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase function secrets')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    if (request.method === 'GET') {
      const [{ data: settings, error: settingsError }, { data: recipients, error: recipientsError }] = await Promise.all([
        supabase.from('report_email_settings').select('*').eq('key', 'default').maybeSingle(),
        supabase.from('report_email_recipients').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      ])

      if (settingsError) throw settingsError
      if (recipientsError) throw recipientsError

      return jsonResponse(corsHeaders, 200, {
        settings: settings || {
          key: 'default',
          enabled: true,
          send_day: 0,
          send_time: '15:00',
          timezone: 'America/Chicago',
          sender_name: 'BFC Sunday Ops',
          reply_to_email: '',
        },
        recipients: recipients || [],
      })
    }

    if (request.method === 'PUT') {
      const body = await request.json().catch(() => ({}))
      const payload = {
        key: 'default',
        enabled: typeof body?.enabled === 'boolean' ? body.enabled : true,
        send_day: Number(body?.send_day ?? 0),
        send_time: typeof body?.send_time === 'string' && body.send_time ? body.send_time : '15:00',
        timezone: typeof body?.timezone === 'string' && body.timezone ? body.timezone : 'America/Chicago',
        sender_name: typeof body?.sender_name === 'string' && body.sender_name.trim()
          ? body.sender_name.trim()
          : 'BFC Sunday Ops',
        reply_to_email: typeof body?.reply_to_email === 'string' && body.reply_to_email.trim()
          ? body.reply_to_email.trim().toLowerCase()
          : null,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('report_email_settings')
        .upsert(payload)
        .select('*')
        .single()

      if (error) throw error

      return jsonResponse(corsHeaders, 200, { settings: data })
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const payload = normalizeRecipient(body)

      const { data, error } = await supabase
        .from('report_email_recipients')
        .insert(payload)
        .select('*')
        .single()

      if (error) throw error

      return jsonResponse(corsHeaders, 200, { recipient: data })
    }

    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}))
      const id = typeof body?.id === 'string' ? body.id : ''
      if (!id) {
        return jsonResponse(corsHeaders, 400, { error: 'Recipient id is required' })
      }

      const payload = normalizeRecipient(body)

      const { data, error } = await supabase
        .from('report_email_recipients')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw error

      return jsonResponse(corsHeaders, 200, { recipient: data })
    }

    if (request.method === 'DELETE') {
      const body = await request.json().catch(() => ({}))
      const id = typeof body?.id === 'string' ? body.id : ''
      if (!id) {
        return jsonResponse(corsHeaders, 400, { error: 'Recipient id is required' })
      }

      const { error } = await supabase
        .from('report_email_recipients')
        .delete()
        .eq('id', id)

      if (error) throw error

      return jsonResponse(corsHeaders, 200, { ok: true })
    }

    return jsonResponse(corsHeaders, 405, { error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(corsHeaders, 500, { error: message })
  }
})
