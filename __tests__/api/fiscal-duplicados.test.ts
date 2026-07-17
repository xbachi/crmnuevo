/**
 * @jest-environment node
 *
 * POST /api/fiscal/duplicados/scan — duplicados difusos.
 *
 * La regla dura que fija este test: el scan MARCA y ENCOLA, nunca borra ni anula.
 * Y marca el más NUEVO, no el viejo: el viejo es el que se queda (es el que ya
 * pudo entrar en un trimestre declarado).
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
import { POST } from '@/app/api/fiscal/duplicados/scan/route'

const mockQuery = pool.query as unknown as jest.Mock
const mockConnect = pool.connect as unknown as jest.Mock

interface Registrada {
  sql: string
  params: unknown[]
}

/** Un par real: misma factura de mecauto, re-escaneada 2 días después. */
const PAR = {
  viejo_id: 100,
  viejo_num: 'A-1',
  viejo_archivo: 'mecauto-a1.pdf',
  viejo_fecha: '2026-05-10',
  nuevo_id: 205,
  nuevo_num: 'A-1',
  nuevo_archivo: 'mecauto-a1-copia.pdf',
  nuevo_fecha: '2026-05-12',
  proveedor: 'mecauto',
  importe: '121.00',
}

function mockClient() {
  const registradas: Registrada[] = []
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      registradas.push({ sql, params: params ?? [] })
      if (/to_regclass\('public\.revision_items'\)/.test(sql)) return { rows: [{ t: 'revision_items' }] }
      if (/to_regclass\('public\.fiscal_audit_log'\)/.test(sql)) return { rows: [{ t: 'fiscal_audit_log' }] }
      if (/UPDATE facturas_registro/.test(sql)) return { rows: [{ id: params?.[0] }], rowCount: 1 }
      if (/INSERT INTO revision_items/.test(sql)) return { rows: [{ id: 1 }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    }),
    release: jest.fn(),
  }
  mockConnect.mockResolvedValue(client)
  return { client, registradas }
}

function req(url: string): NextRequest {
  return { url, headers: { get: () => null }, json: async () => ({}) } as unknown as NextRequest
}

const hizo = (r: Registrada[], re: RegExp) => r.some((x) => re.test(x.sql))

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.ADMIN_SECRET
  delete process.env.N8N_INVOICE_WEBHOOK_SECRET
})

describe('POST /api/fiscal/duplicados/scan', () => {
  it('marca el MÁS NUEVO apuntando al viejo, encola en revisión y no borra nada', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PAR] }) // el self-join
    const { registradas } = mockClient()

    const res = await POST(req('http://localhost/api/fiscal/duplicados/scan?anio=2026'))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pares).toBe(1)
    expect(json.marcadas).toBe(1)
    expect(json.encoladas).toBe(1)

    // Se marca el nuevo (205) apuntando al viejo (100). El viejo NO se toca.
    const upd = registradas.find((r) => /UPDATE facturas_registro/.test(r.sql))!
    expect(upd.params).toEqual([205, 100])
    expect(registradas.filter((r) => /UPDATE facturas_registro/.test(r.sql))).toHaveLength(1)

    // Regla dura del proyecto: nada se borra ni se anula.
    expect(hizo(registradas, /DELETE FROM facturas_registro/)).toBe(false)
    expect(hizo(registradas, /estado = 'anulada'/)).toBe(false)

    // Encolado con dedup_key estable → re-escanear no duplica el aviso.
    const ins = registradas.find((r) => /INSERT INTO revision_items/.test(r.sql))!
    expect(ins.sql).toMatch(/ON CONFLICT \(dedup_key\) DO NOTHING/)
    expect(ins.params[2]).toBe('fiscal-dup:100:205')

    // El título lo lee un humano: proveedor, importe, fechas y los dos archivos.
    const titulo = String(ins.params[0])
    expect(titulo).toMatch(/mecauto/)
    expect(titulo).toMatch(/121,00 €/)
    expect(titulo).toMatch(/2026-05-10/)
    expect(titulo).toMatch(/2026-05-12/)
    expect(titulo).toMatch(/mecauto-a1\.pdf/)
    expect(titulo).toMatch(/mecauto-a1-copia\.pdf/)

    // Audit del marcado.
    const audit = registradas.find((r) => /INSERT INTO fiscal_audit_log/.test(r.sql))!
    expect(audit.params[1]).toBe(205)
    expect(audit.params[5]).toBe('uid:9')
    expect(hizo(registradas, /COMMIT/)).toBe(true)
  })

  it('dryRun=1 → devuelve los pares sin escribir nada', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PAR] })

    const res = await POST(req('http://localhost/api/fiscal/duplicados/scan?anio=2026&dryRun=1'))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.dryRun).toBe(true)
    expect(json.pares).toBe(1)
    expect(json.marcadas).toBe(0)
    expect(json.items[0].nuevo.id).toBe(205)
    expect(json.items[0].importe).toBe(121) // NUMERIC → number, no "121.00"
    // Ni siquiera abre transacción.
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('sin pares → no toca nada', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const { registradas } = mockClient()

    const res = await POST(req('http://localhost/api/fiscal/duplicados/scan'))

    const json = await res.json()
    expect(json.pares).toBe(0)
    expect(json.marcadas).toBe(0)
    expect(hizo(registradas, /UPDATE facturas_registro/)).toBe(false)
  })

  it('anio inválido → 400 sin consultar', async () => {
    const res = await POST(req('http://localhost/api/fiscal/duplicados/scan?anio=abc'))
    expect(res.status).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('el self-join excluye hashes iguales y filas ya marcadas', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    await POST(req('http://localhost/api/fiscal/duplicados/scan'))

    const sql = String(mockQuery.mock.calls[0][0])
    // El md5 ya caza el duplicado exacto: acá sólo interesan bytes distintos.
    expect(sql).toMatch(/hash_contenido IS DISTINCT FROM/)
    // Re-escanear no re-marca cadenas de duplicados.
    expect(sql).toMatch(/a\.duplicado_de IS NULL/)
    expect(sql).toMatch(/b\.duplicado_de IS NULL/)
  })
})

/**
 * Estos cuatro casos son la regla de negocio, no un detalle de la query.
 *
 * Contexto que se pierde si no queda escrito: esto es una compraventa de coches y
 * los proveedores de servicio cobran PRECIO ESTÁNDAR POR COCHE. Tres limpiezas de
 * world detailing a 90,75 € el mismo día son tres coches, no un duplicado. La
 * primera versión del scan devolvía 56 pares casi todos falsos: una bandeja que
 * grita siempre deja de mirarse, y acá un falso positivo cuesta más que un falso
 * negativo (el duplicado EXACTO ya lo ataja el UNIQUE de hash_contenido).
 *
 * Se comprueba contra el SQL real de la query, que es donde vive la regla.
 */
describe('POST /api/fiscal/duplicados/scan — evidencia de facturas distintas', () => {
  /** Corre el scan y devuelve el WHERE/JOIN real que se mandó a pg. */
  async function sqlDelScan(): Promise<string> {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    await POST(req('http://localhost/api/fiscal/duplicados/scan'))
    return String(mockQuery.mock.calls[0][0]).replace(/--[^\n]*/g, '') // sin comentarios
  }

  it('descarta el par si ambos tienen número de factura y son distintos', async () => {
    const sql = await sqlDelScan()
    // 26/39 vs 26/41 (world detailing) = dos comprobantes correlativos. Un
    // comprobante re-emitido conserva su número → ese caso lo caza el UNIQUE
    // parcial (proveedor, numero_factura), no esta heurística.
    expect(sql).toMatch(
      /NULLIF\(a\.numero_factura, ''\) IS NULL\s*OR NULLIF\(b\.numero_factura, ''\) IS NULL\s*OR a\.numero_factura = b\.numero_factura/
    )
  })

  it('descarta el par si ambos tienen matrícula y son distintas', async () => {
    const sql = await sqlDelScan()
    // Mercedes 7185LGN vs Dacia 6351LRG a 48,40 € el mismo día = dos coches.
    expect(sql).toMatch(
      /NULLIF\(a\.matricula, ''\) IS NULL\s*OR NULLIF\(b\.matricula, ''\) IS NULL\s*OR a\.matricula = b\.matricula/
    )
  })

  it('con matrículas distintas → 0 pares (tres limpiezas de 90,75 € el mismo día)', async () => {
    // La query ya no los devuelve: el filtro vive en SQL.
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const { registradas } = mockClient()

    const res = await POST(req('http://localhost/api/fiscal/duplicados/scan?anio=2026'))

    const json = await res.json()
    expect(json.pares).toBe(0)
    expect(json.marcadas).toBe(0)
    expect(hizo(registradas, /UPDATE facturas_registro/)).toBe(false)
  })

  it('mismo número y hash distinto → 1 par (re-escaneo del mismo comprobante)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PAR] }) // A-1 vs A-1, mismo importe y coche
    const { registradas } = mockClient()

    const res = await POST(req('http://localhost/api/fiscal/duplicados/scan?anio=2026'))

    const json = await res.json()
    expect(json.pares).toBe(1)
    expect(json.marcadas).toBe(1)
    const upd = registradas.find((r) => /UPDATE facturas_registro/.test(r.sql))!
    expect(upd.params).toEqual([205, 100]) // marca el nuevo, apunta al viejo
  })

  it('sin número ni matrícula, mismo importe y fecha → 1 par (sigue siendo sospechoso)', async () => {
    // Sin evidencia de que sean distintas, el par sobrevive: es justo el caso que
    // esta heurística existe para cubrir (el hash no lo caza).
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...PAR, viejo_num: null, nuevo_num: null, viejo_archivo: null, nuevo_archivo: null }],
    })
    mockClient()

    const res = await POST(req('http://localhost/api/fiscal/duplicados/scan?anio=2026'))

    const json = await res.json()
    expect(json.pares).toBe(1)
    expect(json.marcadas).toBe(1)
    // El título aguanta los nulls sin romperse: lo lee un humano.
    expect(json.items[0].titulo).toMatch(/sin nombre/)
  })
})
