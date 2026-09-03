/**
 * Auth helpers Edge-safe (sin pg/fs). Solo verificación de tokens HMAC.
 * El middleware corre en Edge runtime y NO puede importar @/lib/direct-database.
 *
 * `auth-server.ts` reusa estas mismas primitivas via import.
 */

import { getSessionSecret } from '@/lib/sessionSecret'

export const SESSION_COOKIE = 'sc_session'
/** Sesión del portal de inversores: cookie separada, rol 'inversor', y el
 *  middleware solo le permite GET sobre /api/inversores/{su id}/**. */
export const INVERSOR_COOKIE = 'sc_inversor'

export interface SessionPayload {
  uid: number
  role: 'admin' | 'asesor' | 'inversor'
  exp: number // unix seconds
}

function b64urlDecode(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  if (typeof atob !== 'undefined') return atob(s)
  return Buffer.from(s, 'base64').toString('binary')
}

async function hmacSha256(key: string, data: string): Promise<string> {
  // Web Crypto (works in Edge runtime + Node 20+)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const enc = new TextEncoder()
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await globalThis.crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      enc.encode(data)
    )
    const bytes = new Uint8Array(sig)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    // base64url
    if (typeof btoa !== 'undefined') {
      return btoa(bin)
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
    }
    return Buffer.from(bin, 'binary')
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  }
  throw new Error('crypto.subtle not available')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function verifySessionTokenEdge(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token || !token.includes('.')) return null
  const [p, sig] = token.split('.', 2)
  if (!p || !sig) return null
  // Fuera del try: si falta SESSION_SECRET en prod debe fallar fuerte, no como "token inválido".
  const secret = getSessionSecret()
  let expected: string
  try {
    expected = await hmacSha256(secret, p)
  } catch {
    return null
  }
  if (!constantTimeEqual(sig, expected)) return null
  try {
    const payload = JSON.parse(b64urlDecode(p)) as SessionPayload
    if (!payload.uid || !payload.role || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
