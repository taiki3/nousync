export async function getUserIdFromRequest(req: any): Promise<string> {
  const auth = req.headers?.authorization || ''
  if (!auth.startsWith('Bearer ')) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  }
  const accessToken = auth.substring('Bearer '.length)
  const supabaseUrl = process.env.SUPABASE_URL
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !apiKey) {
    throw Object.assign(new Error('Server auth config missing'), { statusCode: 500 })
  }

  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey,
    },
  })

  if (!resp.ok) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  }

  const payload = (await resp.json()) as { id?: string }
  if (!payload?.id) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  }
  return payload.id
}
