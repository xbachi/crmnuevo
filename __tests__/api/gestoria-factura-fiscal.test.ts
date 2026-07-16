/**
 * @jest-environment node
 *
 * POST /api/gestoria/factura — capa fiscal sobre el registro unificado.
 *
 * Este endpoint alimenta todo el sistema (n8n le manda cada factura de proveedor
 * que llega por email). El test que más importa es el primero: el body viejo de
 * n8n debe seguir haciendo EXACTAMENTE lo de siempre.
 *
 * pg va mockeado (unit, sin DB).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))

import { POST } from '@/app/api/gestoria/factura/route'
import { pool } from '@/lib/direct-database'
import { resetEsquemaCache } from '@/lib/facturaEsquema'

const mockQuery = pool.query as unknown as jest.Mock
const mockConnect = pool.connect as unknown as jest.Mock

const SECRET = 'test-secret'
process.env.N8N_INVOICE_WEBHOOK_SECRET = SECRET

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/gestoria/factura',
    headers: { get: (k: string) => (k.toLowerCase() === 'x-webhook-secret' ? SECRET : null) },
    json: async () => body,
  } as unknown as NextRequest
}

const PROV_AUTO = {
  id: 7,
  nif: 'B12345674', // CIF válido
  pais: 'ES',
  tipo_operacion_defecto: 'interior',
  deducible_defecto: 'si',
  subcategoria_defecto: 'suministros',
  validacion_auto: true,
}

interface Escenario {
  /** false = migraciones fiscales sin aplicar (to_regclass → null). */
  esquema?: boolean
  proveedor?: typeof PROV_AUTO | null
  /** null = el INSERT choca por hash (duplicado). */
  insertId?: number | null
  existente?: Record<string, unknown> | null
  /** líneas ya existentes en la fila duplicada (para el enriquecimiento). */
  lineasExistentes?: number
}

const clientQueries: string[] = []
let clientReleased = 0

/** Mock de pool.query + pool.connect que despacha por el SQL. */
function setup(e: Escenario = {}) {
  const {
    esquema = true,
    proveedor = null,
    insertId = 1,
    existente = null,
    lineasExistentes = 0,
  } = e

  mockQuery.mockReset()
  mockConnect.mockReset()
  clientQueries.length = 0
  clientReleased = 0
  resetEsquemaCache()

  const dispatch = async (sql: string): Promise<{ rows: unknown[] }> => {
    // periodoLock: sin tabla periodos_contables → todo abierto
    if (sql.includes("to_regclass('public.periodos_contables')")) return { rows: [{ t: null }] }
    // detección del esquema fiscal
    if (sql.includes("to_regclass('public.proveedores')")) {
      return esquema
        ? { rows: [{ prov: 'proveedores', lin: 'facturas_registro_lineas', estado: 1 }] }
        : { rows: [{ prov: null, lin: null, estado: 0 }] }
    }
    // fiscalAudit: sin tabla → no-op
    if (sql.includes("to_regclass('public.fiscal_audit_log')")) return { rows: [{ t: null }] }
    if (sql.includes('FROM proveedores')) return { rows: proveedor ? [proveedor] : [] }
    if (sql.includes('INSERT INTO facturas_registro_lineas')) return { rows: [] }
    if (sql.includes('INSERT INTO facturas_registro')) return { rows: insertId != null ? [{ id: insertId }] : [] }
    if (sql.includes('count(*)::int AS n FROM facturas_registro_lineas')) return { rows: [{ n: lineasExistentes }] }
    if (sql.includes('FROM facturas_registro WHERE hash_contenido')) return { rows: existente ? [existente] : [] }
    if (sql.includes('FROM facturas_registro WHERE id')) return { rows: existente ? [existente] : [] }
    if (sql.includes('UPDATE facturas_registro')) return { rows: [] }
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] }
    throw new Error(`SQL inesperado en test: ${sql}`)
  }

  mockQuery.mockImplementation(dispatch)
  mockConnect.mockImplementation(async () => ({
    query: jest.fn(async (sql: string) => {
      clientQueries.push(sql)
      return dispatch(sql)
    }),
    release: jest.fn(() => {
      clientReleased++
    }),
  }))
}

const allQueries = (): string[] => [...mockQuery.mock.calls.map(([sql]) => String(sql)), ...clientQueries]
const insertCabecera = () => {
  const call = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO facturas_registro\n'))
  if (call) return call
  return null
}
/** El INSERT de cabecera, venga por pool o por client (con líneas va en transacción). */
const sqlInsertCabecera = () =>
  allQueries().find((sql) => sql.includes('INSERT INTO facturas_registro') && !sql.includes('_lineas')) ?? ''

const BODY_VIEJO = {
  proveedor: 'Movistar',
  categoria: 'gestoria',
  hashContenido: 'abc123',
  numeroFactura: 'F-2026-001',
  importe: '121,00',
  fechaFactura: '2026-05-10',
  nombreArchivo: 'movistar-mayo.pdf',
}

const LINEAS_OK = [{ tipoLinea: 'iva', tipoIva: 21, base: 100, cuota: 21 }]

describe('POST /api/gestoria/factura — contrato viejo intacto', () => {
  it('body sin campos fiscales → INSERT viejo (13 params) y la respuesta de siempre', async () => {
    setup({ esquema: false })
    const res = await POST(makeReq(BODY_VIEJO))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json).toMatchObject({
      ok: true,
      duplicado: false,
      id: 1,
      periodo: { anio: 2026, trimestre: 2, mes: 5 },
      destino: { tipo: 'gestoria-mes', ruta: 'GESTORIA/2026/2do trimestre/Facturas/mayo' },
    })

    const [sql, params] = insertCabecera()!
    expect(sql).not.toContain('estado')
    expect(sql).not.toContain('base_total')
    expect(params).toHaveLength(13)
    expect(params.slice(0, 6)).toEqual(['movistar', 'gestoria', 'F-2026-001', 'abc123', 121, '2026-05-10'])
    // sin líneas → sin transacción
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('con el esquema aplicado pero sin datos fiscales → estado registrada y sin líneas', async () => {
    setup({ esquema: true })
    const res = await POST(makeReq(BODY_VIEJO))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json).toMatchObject({ ok: true, duplicado: false, id: 1 })
    expect(json.fiscal).toMatchObject({
      estado: 'registrada',
      baseTotal: null,
      cuotaTotal: null,
      lineas: 0,
      nifValido: null,
      proveedorId: null,
      errores: [],
    })
    expect(mockConnect).not.toHaveBeenCalled()
    expect(allQueries().some((s) => s.includes('INSERT INTO facturas_registro_lineas'))).toBe(false)
  })

  it('el 409 de PERIODO_CERRADO se mantiene exactamente igual', async () => {
    setup({ esquema: true })
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('public.periodos_contables')")) return { rows: [{ t: 'periodos_contables' }] }
      if (sql.includes('FROM periodos_contables')) return { rows: [{ '?column?': 1 }] }
      throw new Error(`SQL inesperado: ${sql}`)
    })
    const res = await POST(makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.code).toBe('PERIODO_CERRADO')
    expect(json.periodo).toEqual({ anio: 2026, trimestre: 2, mes: 5 })
  })

  it('las validaciones de entrada de siempre siguen respondiendo 400', async () => {
    setup()
    expect((await POST(makeReq({ ...BODY_VIEJO, proveedor: '' }))).status).toBe(400)
    expect((await POST(makeReq({ ...BODY_VIEJO, categoria: 'inventada' }))).status).toBe(400)
    expect((await POST(makeReq({ ...BODY_VIEJO, hashContenido: '' }))).status).toBe(400)
  })
})

describe('POST /api/gestoria/factura — migración sin aplicar', () => {
  it('to_regclass → null: INSERT viejo aunque el body traiga toda la capa fiscal', async () => {
    setup({ esquema: false })
    const res = await POST(
      makeReq({ ...BODY_VIEJO, nifProveedor: 'B12345674', lineas: LINEAS_OK, extraccion: { metodo: 'llm', confianza: 0.99 } })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, duplicado: false, id: 1 })

    const [sql, params] = insertCabecera()!
    expect(params).toHaveLength(13)
    expect(sql).not.toContain('base_total')
    // no se consulta proveedores ni se insertan líneas
    expect(allQueries().some((s) => s.includes('FROM proveedores'))).toBe(false)
    expect(allQueries().some((s) => s.includes('INSERT INTO facturas_registro_lineas'))).toBe(false)
    expect(mockConnect).not.toHaveBeenCalled()
  })
})

describe('POST /api/gestoria/factura — decisión de estado', () => {
  it('proveedor con validacion_auto + líneas cuadradas + NIF válido → validada', async () => {
    setup({ proveedor: PROV_AUTO })
    const res = await POST(
      makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK, extraccion: { metodo: 'regex', confianza: 0.99, raw: { x: 1 } } })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.fiscal).toMatchObject({
      estado: 'validada',
      baseTotal: 100,
      cuotaTotal: 21,
      mathOk: true,
      nifValido: true,
      proveedorId: 7,
      lineas: 1,
      errores: [],
    })

    // cabecera + líneas van en la MISMA transacción
    expect(clientQueries[0]).toBe('BEGIN')
    expect(clientQueries.at(-1)).toBe('COMMIT')
    expect(clientQueries.some((s) => s.includes('INSERT INTO facturas_registro_lineas'))).toBe(true)
    expect(clientReleased).toBe(1)
  })

  it('los defaults del proveedor se aplican sólo como fallback: el body gana', async () => {
    setup({ proveedor: PROV_AUTO })
    await POST(makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK, tipoOperacion: 'intracomunitaria', subcategoria: 'profesionales' }))
    const sql = sqlInsertCabecera()
    expect(sql).toContain('tipo_operacion')

    const call = mockConnect.mock.results[0].value
    const client = await call
    const insert = client.query.mock.calls.find(([s]: [string]) => s.includes('INSERT INTO facturas_registro\n'))
    const params = insert[1]
    expect(params[19]).toBe('intracomunitaria') // $20 tipo_operacion (body gana)
    expect(params[20]).toBe('si') // $21 deducible (fallback del proveedor)
    expect(params[22]).toBe('profesionales') // $23 subcategoria (body gana)
  })

  it('proveedor desconocido con líneas OK → pendiente-validar aunque la confianza sea 1', async () => {
    setup({ proveedor: null })
    const res = await POST(makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK, extraccion: { confianza: 1 } }))
    const json = await res.json()
    expect(json.fiscal).toMatchObject({ estado: 'pendiente-validar', proveedorId: null, mathOk: true })
  })

  it('proveedor conocido sin validacion_auto y confianza ≥ 0,8 → extraida', async () => {
    setup({ proveedor: { ...PROV_AUTO, validacion_auto: false } })
    const res = await POST(makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK, extraccion: { confianza: 0.85 } }))
    const json = await res.json()
    expect(json.fiscal).toMatchObject({ estado: 'extraida', proveedorId: 7 })
  })

  it('líneas sin importe declarado → el importe lo dan las líneas, y se avisa', async () => {
    setup({ proveedor: PROV_AUTO })
    const body = { ...BODY_VIEJO, importe: undefined, lineas: LINEAS_OK, extraccion: { confianza: 0.99 } }
    const res = await POST(makeReq(body))
    const json = await res.json()
    expect(json.fiscal).toMatchObject({ importe: 121, importeDerivado: true, mathOk: true, estado: 'validada' })
  })
})

describe('POST /api/gestoria/factura — un problema fiscal nunca pierde la factura', () => {
  it('cuota que no cuadra → 200 + registrada como pendiente-validar con los errores', async () => {
    setup({ proveedor: PROV_AUTO })
    const res = await POST(
      makeReq({
        ...BODY_VIEJO,
        importe: 112.34,
        lineas: [{ tipoLinea: 'iva', tipoIva: 21, base: 100, cuota: 12.34 }],
        extraccion: { confianza: 0.99 },
      })
    )
    // lo importante: 200, no 500 — la factura entra igual
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, duplicado: false, id: 1 })
    expect(json.fiscal.estado).toBe('pendiente-validar')
    expect(json.fiscal.mathOk).toBe(false)
    expect(json.fiscal.errores[0]).toContain('no cuadra con base 100,00 × 21%')

    const client = await mockConnect.mock.results[0].value
    const insert = client.query.mock.calls.find(([s]: [string]) => s.includes('INSERT INTO facturas_registro\n'))
    expect(insert[1][23]).toBe('pendiente-validar') // $24 estado
    expect(insert[1][24]).toBe(true) // $25 datos_incompletos
  })

  it('el importe fantasma del incidente de julio no pasa como validada', async () => {
    setup({ proveedor: PROV_AUTO })
    const res = await POST(
      makeReq({ ...BODY_VIEJO, importe: 47104, lineas: LINEAS_OK, extraccion: { confianza: 1 } })
    )
    const json = await res.json()
    expect(json.fiscal.estado).toBe('pendiente-validar')
    expect(json.fiscal.errores.join(' ')).toContain('importe declarado 47104,00')
  })

  it('tipoOperacion fuera del CHECK → fallback + error, sin romper el INSERT', async () => {
    setup({ proveedor: null })
    const res = await POST(makeReq({ ...BODY_VIEJO, tipoOperacion: 'inventado' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.fiscal.errores[0]).toContain('tipoOperacion inválido')
    const params = insertCabecera()![1]
    expect(params[19]).toBe('interior')
  })

  it('NIF inválido → nif_valido false + error, la factura se registra igual', async () => {
    setup({ proveedor: null })
    // 12345678 → la letra de control correcta es Z; A es un error de tecleo típico
    const res = await POST(makeReq({ ...BODY_VIEJO, nifProveedor: '12345678A', lineas: LINEAS_OK }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.fiscal.nifValido).toBe(false)
    expect(json.fiscal.errores.some((e: string) => e.includes('NIF'))).toBe(true)
    expect(json.fiscal.estado).toBe('pendiente-validar')
  })

  it('línea con tipoLinea inválido → se descarta, cuadre roto, pendiente-validar (nunca 500)', async () => {
    setup({ proveedor: PROV_AUTO })
    const res = await POST(
      makeReq({ ...BODY_VIEJO, lineas: [{ tipoLinea: 'invento', base: 100 }, { tipoIva: 21, base: 100, cuota: 21 }] })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.fiscal.lineas).toBe(1)
    expect(json.fiscal.estado).toBe('pendiente-validar')
    expect(json.fiscal.errores.some((e: string) => e.includes('tipoLinea inválido'))).toBe(true)
  })
})

describe('POST /api/gestoria/factura — duplicados y enriquecimiento', () => {
  const EXISTENTE_VIEJA = { id: 55, ruta: 'GESTORIA/2026/2do trimestre/Facturas/mayo', nombre_archivo: 'v.pdf', estado: 'registrada', base_total: null }

  it('duplicado por hash sin datos fiscales nuevos → respuesta de siempre, sin tocar nada', async () => {
    setup({ esquema: false, insertId: null, existente: { id: 55, ruta: 'x', nombre_archivo: 'v.pdf' } })
    const res = await POST(makeReq(BODY_VIEJO))
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, duplicado: true, motivo: 'hash', existente: { id: 55 } })
    expect(allQueries().some((s) => s.includes('UPDATE facturas_registro'))).toBe(false)
  })

  it('fila vieja "registrada" sin líneas + datos fiscales nuevos → se enriquece', async () => {
    setup({ proveedor: PROV_AUTO, insertId: null, existente: EXISTENTE_VIEJA, lineasExistentes: 0 })
    const res = await POST(makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK, extraccion: { confianza: 0.99 } }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, duplicado: true, motivo: 'hash' })
    expect(json.fiscal.enriquecido).toBe(true)

    expect(clientQueries).toContain('BEGIN')
    expect(clientQueries).toContain('COMMIT')
    expect(clientQueries.some((s) => s.includes('FOR UPDATE'))).toBe(true)
    expect(clientQueries.some((s) => s.includes('UPDATE facturas_registro'))).toBe(true)
    expect(clientQueries.some((s) => s.includes('INSERT INTO facturas_registro_lineas'))).toBe(true)
  })

  it('fila ya validada → NO se pisa (assertRegistroMutable / estado ≠ registrada)', async () => {
    setup({ proveedor: PROV_AUTO, insertId: null, existente: { ...EXISTENTE_VIEJA, estado: 'validada', base_total: '100.00' } })
    const res = await POST(makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK, extraccion: { confianza: 0.99 } }))
    const json = await res.json()
    expect(json.duplicado).toBe(true)
    expect(json.fiscal.enriquecido).toBe(false)
    expect(allQueries().some((s) => s.includes('UPDATE facturas_registro'))).toBe(false)
  })

  it('fila ya declarada → intocable', async () => {
    setup({ proveedor: PROV_AUTO, insertId: null, existente: { ...EXISTENTE_VIEJA, estado: 'declarada' } })
    const res = await POST(makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK, extraccion: { confianza: 0.99 } }))
    const json = await res.json()
    expect(json.fiscal.enriquecido).toBe(false)
    expect(allQueries().some((s) => s.includes('UPDATE facturas_registro'))).toBe(false)
  })

  it('fila "registrada" que YA tiene líneas → no se duplica el desglose', async () => {
    setup({ proveedor: PROV_AUTO, insertId: null, existente: EXISTENTE_VIEJA, lineasExistentes: 2 })
    const res = await POST(makeReq({ ...BODY_VIEJO, lineas: LINEAS_OK, extraccion: { confianza: 0.99 } }))
    const json = await res.json()
    expect(json.fiscal.enriquecido).toBe(false)
    expect(clientQueries).toContain('ROLLBACK')
    expect(clientQueries.some((s) => s.includes('INSERT INTO facturas_registro_lineas'))).toBe(false)
  })

  it('duplicado por (proveedor, numero_factura) → 23505 sigue respondiendo motivo "numero"', async () => {
    setup({ esquema: false })
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('public.periodos_contables')")) return { rows: [{ t: null }] }
      if (sql.includes("to_regclass('public.proveedores')")) return { rows: [{ prov: null, lin: null, estado: 0 }] }
      if (sql.includes('INSERT INTO facturas_registro')) throw Object.assign(new Error('dup'), { code: '23505' })
      if (sql.includes('WHERE proveedor = $1')) return { rows: [{ id: 99, ruta: 'x', nombre_archivo: 'v.pdf', hash_contenido: 'zzz' }] }
      throw new Error(`SQL inesperado: ${sql}`)
    })
    const res = await POST(makeReq(BODY_VIEJO))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, duplicado: true, motivo: 'numero', existente: { id: 99 } })
  })
})
