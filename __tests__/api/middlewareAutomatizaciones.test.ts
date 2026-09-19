/**
 * @jest-environment node
 *
 * Whitelist del middleware: SOLO /api/automatizaciones/worker/* pasa sin
 * sesión (lo valida X-Worker-Secret en el handler); la pantalla del coche
 * sigue exigiendo sesión.
 */
jest.mock('@/lib/auth-edge', () => ({
  SESSION_COOKIE: 'session',
  INVERSOR_COOKIE: 'inversor',
  verifySessionTokenEdge: jest.fn(async () => null),
}))

import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const sinSesion = (path: string) =>
  middleware(new NextRequest(`http://localhost${path}`, { method: 'POST' }))

describe('middleware — automatizaciones', () => {
  it.each([
    '/api/automatizaciones/worker/reclamar',
    '/api/automatizaciones/worker/resultado',
  ])('%s pasa sin sesión', async (path) => {
    const res = await sinSesion(path)
    expect(res.status).not.toBe(401)
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it.each([
    '/api/vehiculos/7/automatizaciones',
    '/api/vehiculos/7/automatizaciones/41/cancelar',
    '/api/automatizaciones',
    '/api/automatizaciones/workers',
  ])('%s exige sesión', async (path) => {
    expect((await sinSesion(path)).status).toBe(401)
  })
})
