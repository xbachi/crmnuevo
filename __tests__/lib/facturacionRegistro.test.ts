/**
 * Cadena de integridad "Verifactu-lite" (pendiente de homologación).
 * Verifica el hash determinista, la verificación de cadena y el encadenado
 * de appendRegistro con un client mockeado.
 */
import type { PoolClient } from 'pg'
import {
  computeHash,
  buildQrPayload,
  verifyChainRows,
  appendRegistro,
  type FacturacionRegistroRow,
  type RegistroHashFields,
} from '@/lib/facturacionRegistro'

const CAMPOS_BASE: RegistroHashFields = {
  nifEmisor: 'B75939868',
  numeroSerie: 'F-2026-4236',
  fechaExpedicion: '2026-07-11',
  tipoRegistro: 'alta',
  importeTotal: '12500.00',
}

describe('computeHash — huella SHA-256 determinista', () => {
  it('mismo input produce siempre el mismo hash (hex de 64 chars)', () => {
    const a = computeHash(CAMPOS_BASE, null)
    const b = computeHash({ ...CAMPOS_BASE }, null)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('cambiar cualquier campo o el hash anterior cambia la huella', () => {
    const base = computeHash(CAMPOS_BASE, null)
    expect(computeHash({ ...CAMPOS_BASE, importeTotal: '12500.01' }, null)).not.toBe(base)
    expect(computeHash({ ...CAMPOS_BASE, tipoRegistro: 'anulacion' }, null)).not.toBe(base)
    expect(computeHash({ ...CAMPOS_BASE, numeroSerie: 'F-2026-4237' }, null)).not.toBe(base)
    expect(computeHash(CAMPOS_BASE, 'a'.repeat(64))).not.toBe(base)
  })

  it('primer eslabón: hash_anterior null equivale a cadena vacía', () => {
    expect(computeHash(CAMPOS_BASE, null)).toBe(computeHash(CAMPOS_BASE, ''))
  })
})

describe('buildQrPayload — URL de validación AEAT (pre-producción)', () => {
  it('formatea fecha DD-MM-YYYY y codifica los parámetros', () => {
    const url = buildQrPayload({
      nifEmisor: 'B75939868',
      numeroSerie: 'F-2026-4236',
      fechaExpedicion: '2026-07-11',
      importeTotal: '12500.00',
    })
    expect(url).toBe(
      'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B75939868&numserie=F-2026-4236&fecha=11-07-2026&importe=12500.00'
    )
  })
})

function buildChain(): FacturacionRegistroRow[] {
  const defs = [
    { numeroSerie: 'F-2026-0001', fecha: '2026-01-10', importe: '1000.00', tipo: 'alta' as const },
    { numeroSerie: 'F-2026-0002', fecha: '2026-02-15', importe: '2500.50', tipo: 'alta' as const },
    { numeroSerie: 'F-2026-0001', fecha: '2026-01-10', importe: '1000.00', tipo: 'anulacion' as const },
  ]
  const rows: FacturacionRegistroRow[] = []
  let prev: string | null = null
  defs.forEach((d, i) => {
    const hash = computeHash(
      {
        nifEmisor: 'B75939868',
        numeroSerie: d.numeroSerie,
        fechaExpedicion: d.fecha,
        tipoRegistro: d.tipo,
        importeTotal: d.importe,
      },
      prev
    )
    rows.push({
      id: i + 1,
      invoice_id: i + 1,
      tipo_registro: d.tipo,
      numero_serie: d.numeroSerie,
      fecha_expedicion: d.fecha,
      nif_emisor: 'B75939868',
      importe_total: d.importe,
      hash_anterior: prev,
      hash_actual: hash,
      qr_payload: null,
      metadata: null,
      created_at: '2026-07-11T00:00:00Z',
    })
    prev = hash
  })
  return rows
}

describe('verifyChainRows — verificación de la cadena', () => {
  it('cadena de 3 registros bien encadenados verifica OK', () => {
    expect(verifyChainRows(buildChain())).toEqual([])
  })

  it('cadena vacía verifica OK', () => {
    expect(verifyChainRows([])).toEqual([])
  })

  it('alterar el importe de un registro rompe desde ese punto en adelante', () => {
    const rows = buildChain()
    rows[1].importe_total = '9999.99' // manipulación
    const roturas = verifyChainRows(rows)
    expect(roturas.map((r) => r.id)).toEqual([2, 3])
    expect(roturas[0].encontrado).toBe(rows[1].hash_actual)
    expect(roturas[0].esperado).not.toBe(roturas[0].encontrado)
  })

  it('quitar un eslabón intermedio rompe la verificación', () => {
    const rows = buildChain()
    const truncada = [rows[0], rows[2]] // se "borró" el eslabón 2
    const roturas = verifyChainRows(truncada)
    expect(roturas.map((r) => r.id)).toEqual([3])
  })
})

describe('appendRegistro — encadena hash_anterior dentro del tx del caller', () => {
  // Fija el NIF para que el hash esperado no dependa del .env local.
  beforeAll(() => {
    process.env.EMPRESA_NIF = 'B75939868'
  })

  function mockClient(lastHash: string | null) {
    const query = jest
      .fn()
      // 1) pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [] })
      // 2) SELECT último eslabón FOR UPDATE
      .mockResolvedValueOnce({
        rows: lastHash ? [{ hash_actual: lastHash }] : [],
      })
      // 3) INSERT ... RETURNING *
      .mockImplementationOnce((_sql: string, params: unknown[]) =>
        Promise.resolve({ rows: [{ id: 99, hash_actual: params[7] }] })
      )
    return { query } as unknown as PoolClient & { query: jest.Mock }
  }

  it('usa el hash del último eslabón como hash_anterior', async () => {
    const lastHash = computeHash(CAMPOS_BASE, null)
    const client = mockClient(lastHash)

    await appendRegistro(client, {
      tipoRegistro: 'alta',
      invoiceId: 42,
      numeroSerie: 'F-2026-4300',
      fechaExpedicion: '2026-07-11',
      importeTotal: 9990, // number → "9990.00"
      metadata: { origen: 'test' },
    })

    const insertParams = (client.query as jest.Mock).mock.calls[2][1]
    // (invoice_id, tipo, numero, fecha, nif, importe, hash_anterior, hash_actual, qr, metadata)
    expect(insertParams[0]).toBe(42)
    expect(insertParams[3]).toBe('2026-07-11')
    expect(insertParams[5]).toBe('9990.00')
    expect(insertParams[6]).toBe(lastHash)
    expect(insertParams[7]).toBe(
      computeHash(
        {
          nifEmisor: 'B75939868',
          numeroSerie: 'F-2026-4300',
          fechaExpedicion: '2026-07-11',
          tipoRegistro: 'alta',
          importeTotal: '9990.00',
        },
        lastHash
      )
    )
  })

  it('primer eslabón: hash_anterior null cuando la cadena está vacía', async () => {
    const client = mockClient(null)
    await appendRegistro(client, {
      tipoRegistro: 'alta',
      invoiceId: null,
      numeroSerie: 'F-2026-0001',
      fechaExpedicion: new Date('2026-01-10T12:00:00Z'), // Date → YYYY-MM-DD
      importeTotal: '1000',
    })
    const insertParams = (client.query as jest.Mock).mock.calls[2][1]
    expect(insertParams[3]).toBe('2026-01-10')
    expect(insertParams[6]).toBeNull()
    expect(insertParams[7]).toBe(
      computeHash(
        {
          nifEmisor: 'B75939868',
          numeroSerie: 'F-2026-0001',
          fechaExpedicion: '2026-01-10',
          tipoRegistro: 'alta',
          importeTotal: '1000.00',
        },
        null
      )
    )
  })
})
