const FALLBACK_ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'bfcadmin'

function getFunctionUrl(name: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
}

export async function verifyAdminPassword(password: string) {
  try {
    const response = await fetch(getFunctionUrl('admin-session'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    })

    if (response.ok) {
      return true
    }

    if (response.status !== 404) {
      return false
    }
  } catch {
    // Fall back to the existing frontend-only password during local development.
  }

  return password === FALLBACK_ADMIN_PASSWORD
}

export async function requestSummaryEmailAdmin<T>(password: string, method: string, body?: unknown) {
  const response = await fetch(getFunctionUrl('summary-email-admin'), {
    method,
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'x-admin-password': password,
    },
    body: body == null ? undefined : JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed with ${response.status}`)
  }

  return payload as T
}
