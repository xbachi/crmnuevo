/** @jest-environment node */

import { createSessionToken, SESSION_COOKIE } from '@/lib/auth-server'
import { requireAdminSession, requireApiSession } from '@/lib/apiAuth'

function requestWithToken(token?: string) {
  return {
    cookies: {
      get: (name: string) =>
        name === SESSION_COOKIE && token ? { value: token } : undefined,
    },
  }
}

describe('API authorization', () => {
  it('rechaza una petición sin sesión', () => {
    const auth = requireApiSession(requestWithToken())
    expect(auth.response?.status).toBe(401)
  })

  it('acepta una sesión de asesor para operaciones autenticadas', () => {
    const auth = requireApiSession(
      requestWithToken(createSessionToken(7, 'asesor'))
    )
    expect(auth.session).toMatchObject({ uid: 7, role: 'asesor' })
  })

  it('rechaza al asesor en operaciones administrativas', () => {
    const auth = requireAdminSession(
      requestWithToken(createSessionToken(8, 'asesor'))
    )
    expect(auth.response?.status).toBe(403)
  })

  it('acepta al administrador y conserva su identidad firmada', () => {
    const auth = requireAdminSession(
      requestWithToken(createSessionToken(9, 'admin'))
    )
    expect(auth.session).toMatchObject({ uid: 9, role: 'admin' })
  })
})
