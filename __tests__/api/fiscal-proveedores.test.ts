/**
 * @jest-environment node
 *
 * Maestro de proveedores: listado, edición (NIF) y fusión.
 *
 * Los dos comportamientos que hay que fijar: un NIF inválido se GUARDA con aviso
 * (bloquear obligaría a inventar un NIF falso para poder guardar el resto de la
 * ficha), y la fusión NUNCA borra el origen (FKs + histórico ante inspección).
 *
 * pg mockeado (unit, sin DB).
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))
jest.mock('@/lib/apiAuth', () => ({
  requireApiSession: jest.fn(() => ({ session: { uid: 9, role: 'admin' } })),
  requireAdminSession: jest.fn(() => ({ session: { uid: 9, role: 'admin' } })),
}))

import type { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { GET } from '@/app/api/fiscal/proveedores/route'
import { PATCH } from '@/app/api/fiscal/proveedores/[id]/route'
import { POST as merge } from '@/app/api/fiscal/proveedores/[id]/merge/route'

const mockQuery = pool.query as unknown as jest.Mock
const mockConnect = pool.connect as unknown as jest.Mock

type Handler = [RegExp, (params: unknown[]) => { rows: unknown[]; rowCount?: number }]
interface Registrada {
  sql: string
  params: unknown[]
}

const PROV = {
  id: 3,
  nombre: 'mecauto',
  nif: null,
  nif_valido: null,
  pais: 'ES',
  aliases: ['mecauto sl'],
  iban: null,
  categoria_defecto: 'coche-servicio',
  tipo_operacion_defecto: 'interior',
  deducible_defecto: 'si',
  subcategoria_defecto: null,
  validacion_auto: false,
  plantilla_extraccion: null,
  activo: true,
}

function mockClient(handlers: Handler[]) {
  const registradas: Registrada[] = []
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      registradas.push({ sql, params: params ?? [] })
      for (const [re, fn] of handlers) if (re.test(sql)) return fn(params ?? [])
      return { rows: [], rowCount: 0 }
    }),
    release: jest.fn(),
  }
  mockConnect.mockResolvedValue(client)
  return { client, registradas }
}

function req(body: Record<string, unknown> = {}, url = 'http://localhost/api/fiscal/proveedores'): NextRequest {
  return { url, headers: { get: () => null }, json: async () => body } as unknown as NextRequest
}

const hizo = (r: Registrada[], re: RegExp) => r.some((x) => re.test(x.sql))

beforeEach(() => jest.clearAllMocks())

describe('GET /api/fiscal/proveedores', () => {
  it('devuelve el conteo de facturas y marca los que no tienen NIF', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { ...PROV, facturas: '37' }, // COUNT viene como string desde pg
        { ...PROV, id: 4, nombre: 'movistar', nif: 'A82018474', nif_valido: true, facturas: '12' },
      ],
    })

    const res = await GET(req())
    expect(res.status).toBe(200)
    const json = await res.json()

    // El conteo tiene que ser number, no "37": la UI hace cuentas con esto.
    expect(json.proveedores[0].facturas).toBe(37)
    expect(json.proveedores[0].sinNif).toBe(true)
    expect(json.proveedores[1].sinNif).toBe(false)
    expect(json.proveedores[1].nifValido).toBe(true)

    // Una sola query (LEFT JOIN + GROUP BY), no N+1: el pool tiene 1 conexión.
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][0]).toMatch(/LEFT JOIN facturas_registro/)
  })
})

describe('PATCH /api/fiscal/proveedores/[id]', () => {
  const ctx = { params: Promise.resolve({ id: '3' }) }

  it('NIF inválido → se guarda igual con nif_valido=false y devuelve aviso', async () => {
    const { registradas } = mockClient([
      [/SELECT \* FROM proveedores WHERE id = \$1 FOR UPDATE/, () => ({ rows: [PROV] })],
      [/to_regclass\('public\.fiscal_audit_log'\)/, () => ({ rows: [{ t: 'fiscal_audit_log' }] })],
      [/UPDATE proveedores SET/, () => ({ rows: [{ ...PROV, nif: 'B12345678', nif_valido: false }] })],
    ])

    // B12345678: el dígito de control correcto para 1234567 es 4, no 8.
    const res = await PATCH(req({ nif: 'B12345678' }), ctx)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.proveedor.nifValido).toBe(false)
    expect(json.aviso).toMatch(/no supera la validación/i)
    expect(hizo(registradas, /COMMIT/)).toBe(true)

    // Se persistió el NIF, marcado como no válido.
    const upd = registradas.find((r) => /UPDATE proveedores SET/.test(r.sql))!
    expect(upd.params).toContain('B12345678')
    expect(upd.params).toContain(false)
  })

  it('NIF válido → nif_valido=true, normalizado y sin aviso', async () => {
    mockClient([
      [/SELECT \* FROM proveedores WHERE id = \$1 FOR UPDATE/, () => ({ rows: [PROV] })],
      [/to_regclass\('public\.fiscal_audit_log'\)/, () => ({ rows: [{ t: 'fiscal_audit_log' }] })],
      [/UPDATE proveedores SET/, (p) => ({ rows: [{ ...PROV, nif: p[1], nif_valido: p[2] }] })],
    ])

    const res = await PATCH(req({ nif: 'b-12.345.674' }), ctx)

    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.proveedor.nif).toBe('B12345674') // normalizado
    expect(json.proveedor.nifValido).toBe(true)
    expect(json.aviso).toBeUndefined()
  })

  it('colisión de NIF (23505) → 409 nombrando al proveedor que ya lo tiene', async () => {
    mockClient([
      [/SELECT \* FROM proveedores WHERE id = \$1 FOR UPDATE/, () => ({ rows: [PROV] })],
      [/to_regclass\('public\.fiscal_audit_log'\)/, () => ({ rows: [{ t: 'fiscal_audit_log' }] })],
      [
        /UPDATE proveedores SET/,
        () => {
          const e = new Error('duplicate key') as Error & { code: string }
          e.code = '23505'
          throw e
        },
      ],
    ])
    // La búsqueda del culpable va por pool, fuera de la tx abortada.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 8, nombre: 'movistar' }] })

    const res = await PATCH(req({ nif: 'A82018474' }), ctx)

    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.code).toBe('NIF_DUPLICADO')
    expect(json.proveedor).toEqual({ id: 8, nombre: 'movistar' })
    expect(json.error).toMatch(/movistar/)
  })

  it('un *_defecto fuera del CHECK → 400 sin tocar la fila', async () => {
    const { registradas } = mockClient([
      [/SELECT \* FROM proveedores WHERE id = \$1 FOR UPDATE/, () => ({ rows: [PROV] })],
    ])

    const res = await PATCH(req({ deducibleDefecto: 'quizas' }), ctx)

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/deducibleDefecto inválido/)
    expect(hizo(registradas, /UPDATE proveedores SET/)).toBe(false)
  })
})

describe('POST /api/fiscal/proveedores/[id]/merge', () => {
  const ctx = { params: Promise.resolve({ id: '3' }) }

  const ORIGEN = { ...PROV, id: 5, nombre: 'Mecauto Talleres', aliases: ['mecauto taller'], activo: true }

  it('mueve las facturas, absorbe los alias y DESACTIVA el origen (no lo borra)', async () => {
    const { registradas } = mockClient([
      [/SELECT \* FROM proveedores WHERE id IN/, () => ({ rows: [PROV, ORIGEN] })],
      [/UPDATE facturas_registro SET proveedor_id/, () => ({ rows: [], rowCount: 12 })],
      [/to_regclass\('public\.fiscal_audit_log'\)/, () => ({ rows: [{ t: 'fiscal_audit_log' }] })],
      [/UPDATE proveedores SET aliases/, (p) => ({ rows: [{ ...PROV, aliases: p[1] }] })],
    ])

    const res = await merge(req({ origenId: 5 }), ctx)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.facturasMovidas).toBe(12)
    expect(hizo(registradas, /COMMIT/)).toBe(true)

    // Las facturas se reapuntan al destino.
    const mov = registradas.find((r) => /UPDATE facturas_registro SET proveedor_id/.test(r.sql))!
    expect(mov.params).toEqual([3, 'mecauto', 5])

    // El origen se desactiva; JAMÁS se borra.
    expect(hizo(registradas, /UPDATE proveedores SET activo = false/)).toBe(true)
    expect(hizo(registradas, /DELETE FROM proveedores/)).toBe(false)

    // El nombre del origen y sus alias quedan como alias del destino, sin duplicar.
    expect(json.destino.aliases).toEqual(
      expect.arrayContaining(['mecauto sl', 'Mecauto Talleres', 'mecauto taller'])
    )
    expect(json.destino.aliases).not.toContain('mecauto') // no es alias de sí mismo

    // Audit en AMBAS fichas.
    const audits = registradas.filter((r) => /INSERT INTO fiscal_audit_log/.test(r.sql))
    expect(audits).toHaveLength(2)
    expect(audits.map((a) => a.params[1]).sort()).toEqual([3, 5])
    for (const a of audits) {
      expect(a.params[2]).toBe('editar')
      expect(a.params[4]).toBe('fusión de proveedores')
      expect(a.params[5]).toBe('uid:9')
    }
  })

  it('fusionar consigo mismo → 400 sin abrir transacción', async () => {
    const res = await merge(req({ origenId: 3 }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/consigo mismo/)
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('origen inexistente → 404 y ROLLBACK', async () => {
    const { registradas } = mockClient([
      [/SELECT \* FROM proveedores WHERE id IN/, () => ({ rows: [PROV] })],
    ])

    const res = await merge(req({ origenId: 99 }), ctx)

    expect(res.status).toBe(404)
    expect(hizo(registradas, /ROLLBACK/)).toBe(true)
    expect(hizo(registradas, /UPDATE facturas_registro/)).toBe(false)
  })
})
