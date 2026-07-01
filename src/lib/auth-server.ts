/**
 * Auth server-side: scrypt para passwords + HMAC signed tokens en cookies.
 * Sin dependencias externas — usa Node `crypto` built-in.
 *
 * Tokens: formato "<base64url(payload)>.<base64url(hmac)>", el payload es
 * un JSON con { uid, role, exp }. Validación = recompute HMAC + verificar exp.
 *
 * SESSION_SECRET viene de env var. En dev usa un default fijo (no prod-safe);
 * el deploy real DEBE setearla.
 */

import crypto from 'crypto'
import { pool } from '@/lib/direct-database'

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'dev-only-INSECURE-set-SESSION_SECRET-in-prod'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 días
export const SESSION_COOKIE = 'sc_session'

// ----------------------------------------------------------------------------
// Password hashing (scrypt)
// ----------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 }

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_OPTS)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    const got = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_OPTS)
    return crypto.timingSafeEqual(got, expected)
  } catch {
    return false
  }
}

// ----------------------------------------------------------------------------
// Signed session tokens (HMAC-SHA256, JWT-like)
// ----------------------------------------------------------------------------

interface SessionPayload {
  uid: number
  role: 'admin' | 'asesor'
  exp: number // unix seconds
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}
function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64')
}
function sign(payloadB64: string): string {
  return b64urlEncode(
    crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest()
  )
}

export function createSessionToken(uid: number, role: 'admin' | 'asesor'): string {
  const payload: SessionPayload = {
    uid,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const p = b64urlEncode(Buffer.from(JSON.stringify(payload)))
  const sig = sign(p)
  return `${p}.${sig}`
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes('.')) return null
  const [p, sig] = token.split('.', 2)
  if (!p || !sig) return null
  const expected = sign(p)
  // Constant-time compare
  if (sig.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(b64urlDecode(p).toString('utf8')) as SessionPayload
    if (!payload.uid || !payload.role || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ----------------------------------------------------------------------------
// User lookup
// ----------------------------------------------------------------------------

export interface DbUser {
  id: number
  email: string
  password_hash: string
  role: 'admin' | 'asesor'
  display_name: string | null
  active: boolean
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const { rows } = await pool.query<DbUser>(
    `SELECT id, email, password_hash, role, display_name, active
       FROM users WHERE LOWER(email) = LOWER($1) AND active = TRUE LIMIT 1`,
    [email]
  )
  return rows[0] ?? null
}

export async function findUserById(id: number): Promise<DbUser | null> {
  const { rows } = await pool.query<DbUser>(
    `SELECT id, email, password_hash, role, display_name, active
       FROM users WHERE id = $1 AND active = TRUE LIMIT 1`,
    [id]
  )
  return rows[0] ?? null
}

export async function recordLogin(id: number): Promise<void> {
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [id])
}

/**
 * Helper para leer la sesión desde un Request (server-side).
 * Devuelve null si la cookie no existe o el token es inválido/expirado.
 */
export function readSessionFromRequest(
  req: { cookies: { get: (name: string) => { value: string } | undefined } }
): SessionPayload | null {
  const cookie = req.cookies.get(SESSION_COOKIE)
  return verifySessionToken(cookie?.value)
}
