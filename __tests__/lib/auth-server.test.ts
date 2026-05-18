/**
 * @jest-environment node
 *
 * Unit tests del módulo de auth (hash + sign + verify).
 * No requiere DB — todo es crypto puro.
 */

import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from '@/lib/auth-server'

describe('auth-server: password hashing (scrypt)', () => {
  it('hash + verify devuelve true con la misma password', () => {
    const stored = hashPassword('CorrectHorseBatteryStaple!')
    expect(verifyPassword('CorrectHorseBatteryStaple!', stored)).toBe(true)
  })

  it('verify devuelve false con password distinta', () => {
    const stored = hashPassword('one-password')
    expect(verifyPassword('one-password!', stored)).toBe(false)
  })

  it('hash de la misma password produce hashes distintos (salt único)', () => {
    const a = hashPassword('same')
    const b = hashPassword('same')
    expect(a).not.toBe(b)
    expect(verifyPassword('same', a)).toBe(true)
    expect(verifyPassword('same', b)).toBe(true)
  })

  it('verify devuelve false con string corrupto', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false)
    expect(verifyPassword('x', 'scrypt:bad:bad')).toBe(false)
  })
})

describe('auth-server: session tokens (HMAC)', () => {
  it('crear + verificar token devuelve el payload', () => {
    const token = createSessionToken(42, 'admin')
    const payload = verifySessionToken(token)
    expect(payload).not.toBeNull()
    expect(payload?.uid).toBe(42)
    expect(payload?.role).toBe('admin')
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('token malformado devuelve null', () => {
    expect(verifySessionToken('garbage')).toBeNull()
    expect(verifySessionToken('a.b')).toBeNull()
    expect(verifySessionToken('')).toBeNull()
    expect(verifySessionToken(null)).toBeNull()
    expect(verifySessionToken(undefined)).toBeNull()
  })

  it('token con firma alterada devuelve null', () => {
    const token = createSessionToken(1, 'asesor')
    const [p] = token.split('.')
    const tampered = `${p}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
    expect(verifySessionToken(tampered)).toBeNull()
  })
})
