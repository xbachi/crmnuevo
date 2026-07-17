/**
 * @jest-environment node
 *
 * PATCH /api/fiscal/registro/[id] y POST .../validar — guards fiscales.
 *
 * Lo que se protege acá es el punto donde un número entra al 303. Los dos casos
 * que más importan: que no se pueda validar algo que no cuadra (así entraron los
 * importes de 47.104 € y 156.372 € del extractor) y que una factura ya declarada
 * no se toque sin dejar rastro.
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
import { PATCH } from '@/app/api/fiscal/registro/[id]/route'
import { POST as validar } from '@/app/api/fiscal/registro/[id]/validar/route'

const mockConnect = pool.connect as unknown as jest.Mock

type Handler = [RegExp, (params: unknown[]) => { rows: unknown[]; rowCount?: number }]

interface Registrada {
  sql: string
  params: unknown[]
}

/** Fila base: una factura normal, pendiente de validar, que cuadra a 121 €. */
const ROW = {
  id: 1,
  estado: 'pendiente-validar',
  proveedor: 'mecauto',
  proveedor_id: 3,
  categoria: 'coche-servicio',
  numero_factura: 'A-1',
  importe: '121.00', // pg devuelve NUMERIC como string
  fecha_factura: '2026-05-10',
  fecha_operacion: null,
  anio: 2026,
  trimestre: 2,
  mes: 5,
  anio_declarado: 2026,
  trimestre_declarado: 2,
  matricula: '1234ABC',
  nombre_archivo: 'mecauto-a1.pdf',
  ruta: null,
  nif_proveedor: 'B12345674', // CIF válido
  nif_valido: true,
  tipo_operacion: 'interior',
  deducible: 'si',
  deducible_pct: null,
  subcategoria_gasto: null,
  base_total: '100.00',
  cuota_iva_total: '21.00',
  datos_incompletos: false,
  posible_duplicado: false,
  duplicado_de: null,
  tardia: false,
  extraccion_metodo: 'llm',
  extraccion_confianza: '0.90',
  extraccion_raw: { importe: '121,00' },
}

/**
 * Mock de pool.connect que despacha por el SQL. Devuelve las queries ejecutadas
 * para poder afirmar sobre COMMIT/ROLLBACK y sobre el audit.
 */
function mockClient(row: Record<string, unknown>, extra: Handler[] = []) {
  const registradas: Registrada[] = []

  const handlers: Handler[] = [
    ...extra,
    [/SELECT \* FROM facturas_registro WHERE id = \$1 FOR UPDATE/, () => ({ rows: [row] })],
    [/SELECT id, nombre FROM proveedores/, () => ({ rows: [{ id: 3, nombre: 'mecauto' }] })],
    [/SELECT pais FROM proveedores/, () => ({ rows: [{ pais: 'ES' }] })],
    // Migración de períodos aplicada, nada cerrado.
    [/to_regclass\('public\.periodos_contables'\)/, () => ({ rows: [{ t: 'periodos_contables' }] })],
    [/FROM periodos_contables/, () => ({ rows: [] })],
    [/to_regclass\('public\.fiscal_audit_log'\)/, () => ({ rows: [{ t: 'fiscal_audit_log' }] })],
    [/FROM facturas_registro_lineas/, () => ({ rows: [] })],
    // El UPDATE de /validar va en varias líneas → \s+, no un espacio literal.
    [
      /UPDATE facturas_registro\s+SET estado = 'validada'/,
      (p) => ({ rows: [{ ...row, estado: 'validada', validada_por: p[1], datos_incompletos: false }] }),
    ],
    [/UPDATE facturas_registro\s+SET/, () => ({ rows: [{ ...row }] })],
  ]

  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      registradas.push({ sql, params: params ?? [] })
      for (const [re, fn] of handlers) {
        if (re.test(sql)) return fn(params ?? [])
      }
      return { rows: [], rowCount: 0 }
    }),
    release: jest.fn(),
  }
  mockConnect.mockResolvedValue(client)
  return { client, registradas }
}

function req(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/fiscal/registro/1',
    headers: { get: () => null },
    json: async () => body,
  } as unknown as NextRequest
}

const ctx = { params: Promise.resolve({ id: '1' }) }

const sqls = (r: Registrada[]) => r.map((x) => x.sql)
const hizo = (r: Registrada[], re: RegExp) => sqls(r).some((s) => re.test(s))

beforeEach(() => jest.clearAllMocks())

describe('POST /api/fiscal/registro/[id]/validar', () => {
  it('sin líneas → 409 MATH_KO: el 303 pide base y cuota, no un total', async () => {
    const { registradas } = mockClient(ROW)

    const res = await validar(req({}), ctx)

    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.code).toBe('MATH_KO')
    expect(json.error).toMatch(/desglose/i)
    // No se valida ni se guarda nada.
    expect(hizo(registradas, /ROLLBACK/)).toBe(true)
    expect(hizo(registradas, /COMMIT/)).toBe(false)
    expect(hizo(registradas, /estado = 'validada'/)).toBe(false)
  })

  it('cuadre KO → 409 MATH_KO y ROLLBACK: no guarda las correcciones a medias', async () => {
    const { registradas } = mockClient(ROW)

    // base 100 al 21% son 21 de cuota, no 5.
    const res = await validar(
      req({ lineas: [{ tipoLinea: 'iva', tipoIva: 21, base: 100, cuota: 5 }] }),
      ctx
    )

    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.code).toBe('MATH_KO')
    expect(json.cuadre.ok).toBe(false)
    expect(json.cuadre.errores.join(' ')).toMatch(/no cuadra/i)
    expect(hizo(registradas, /ROLLBACK/)).toBe(true)
    expect(hizo(registradas, /COMMIT/)).toBe(false)
  })

  it('NIF inválido → 409 NIF_INVALIDO salvo force+motivo', async () => {
    mockClient({ ...ROW, nif_valido: false, nif_proveedor: 'B00000000' })

    const res = await validar(
      req({ lineas: [{ tipoLinea: 'iva', tipoIva: 21, base: 100, cuota: 21 }] }),
      ctx
    )

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('NIF_INVALIDO')
  })

  it('cuadre OK → valida, sella validada_por con el uid y audita con acción validar', async () => {
    const { registradas } = mockClient(ROW)

    const res = await validar(
      req({ lineas: [{ tipoLinea: 'iva', tipoIva: 21, base: 100, cuota: 21 }] }),
      ctx
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.cuadre.ok).toBe(true)
    expect(hizo(registradas, /COMMIT/)).toBe(true)

    const val = registradas.find((r) => /estado = 'validada'/.test(r.sql))
    expect(val).toBeDefined()
    expect(val!.params[1]).toBe('uid:9')

    const audit = registradas.find((r) => /INSERT INTO fiscal_audit_log/.test(r.sql))
    expect(audit).toBeDefined()
    expect(audit!.params[2]).toBe('validar')
    // El insumo para arreglar las plantillas de extracción.
    expect(String(audit!.params[3])).toMatch(/extraccion_raw/)
  })
})

describe('PATCH /api/fiscal/registro/[id]', () => {
  it('sobre una factura declarada sin force → 409 REGISTRO_INMUTABLE', async () => {
    const { registradas } = mockClient({ ...ROW, estado: 'declarada' })

    const res = await PATCH(req({ numeroFactura: 'A-2' }), ctx)

    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.code).toBe('REGISTRO_INMUTABLE')
    expect(json.estado).toBe('declarada')
    expect(hizo(registradas, /UPDATE facturas_registro SET/)).toBe(false)
    expect(hizo(registradas, /COMMIT/)).toBe(false)
  })

  it('sobre una declarada con force+motivo → 200 y audita correccion-post-declaracion', async () => {
    const { registradas } = mockClient({ ...ROW, estado: 'declarada' })

    const res = await PATCH(
      req({ numeroFactura: 'A-2', force: true, motivo: 'la gestoría avisó del número mal' }),
      ctx
    )

    expect(res.status).toBe(200)
    expect(hizo(registradas, /COMMIT/)).toBe(true)

    const audit = registradas.find((r) => /INSERT INTO fiscal_audit_log/.test(r.sql))
    expect(audit).toBeDefined()
    expect(audit!.params[2]).toBe('correccion-post-declaracion')
    expect(audit!.params[4]).toBe('la gestoría avisó del número mal')
    expect(audit!.params[5]).toBe('uid:9')
  })

  it('force sin motivo NO alcanza: sigue siendo 409', async () => {
    mockClient({ ...ROW, estado: 'declarada' })

    const res = await PATCH(req({ numeroFactura: 'A-2', force: true }), ctx)

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('REGISTRO_INMUTABLE')
  })

  it('cuadre KO NO bloquea el guardado: 200 marcando datos_incompletos', async () => {
    const { registradas } = mockClient(ROW)

    const res = await PATCH(
      req({ lineas: [{ tipoLinea: 'iva', tipoIva: 21, base: 100, cuota: 5 }] }),
      ctx
    )

    // El humano está corrigiendo a mano: no se lo corta a mitad.
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.cuadre.ok).toBe(false)
    expect(json.aviso).toMatch(/no cuadra|incompleta/i)
    expect(hizo(registradas, /COMMIT/)).toBe(true)

    const upd = registradas.find((r) => /UPDATE facturas_registro SET/.test(r.sql))
    expect(upd!.sql).toMatch(/datos_incompletos/)
    expect(upd!.params).toContain(true)
  })

  it('un valor fuera del CHECK de la DB → 400 antes de tocar nada', async () => {
    const { registradas } = mockClient(ROW)

    const res = await PATCH(req({ tipoOperacion: 'inventado' }), ctx)

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/tipoOperacion inválido/)
    expect(hizo(registradas, /UPDATE facturas_registro SET/)).toBe(false)
  })

  it('mover la fecha a un período cerrado → 409 PERIODO_CERRADO', async () => {
    const { registradas } = mockClient(ROW, [
      [/FROM periodos_contables/, () => ({ rows: [{ '?column?': 1 }] })],
    ])

    const res = await PATCH(req({ fechaFactura: '2026-01-15' }), ctx)

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('PERIODO_CERRADO')
    expect(hizo(registradas, /UPDATE facturas_registro SET/)).toBe(false)
  })
})
