type GraphToken = {
  accessToken: string
  expiresAt: number
}

let cachedToken: GraphToken | null = null

function requiredEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

export async function getGraphAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - now > 60_000) {
    return cachedToken.accessToken
  }

  const tenantId = requiredEnv('MS_TENANT_ID')
  const clientId = requiredEnv('MS_CLIENT_ID')
  const clientSecret = requiredEnv('MS_CLIENT_SECRET')

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams()
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('grant_type', 'client_credentials')
  body.set('scope', 'https://graph.microsoft.com/.default')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Graph token error ${res.status}: ${txt}`)
  }
  const json = (await res.json()) as {
    access_token: string
    expires_in: number
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  }
  return cachedToken.accessToken
}

export async function graphRequest<T>(
  path: string,
  init?: RequestInit & { isBinary?: boolean }
): Promise<T> {
  const token = await getGraphAccessToken()
  const url = `https://graph.microsoft.com/v1.0${path}`

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Graph request ${path} failed ${res.status}: ${txt}`)
  }

  if (init?.isBinary) {
    return Buffer.from(await res.arrayBuffer()) as unknown as T
  }
  return (await res.json()) as T
}

export function getDriveId() {
  return requiredEnv('MS_GRAPH_DRIVE_ID')
}
