/**
 * Una venta B2B tiene que tener el MISMO efecto sobre el vehículo que una
 * retail: se vende → VENDIDO; se anula → vuelve a stock. Hasta el fix, el
 * flujo B2B no tocaba "Vehiculo" y el coche seguía figurando en stock (KPI de
 * vendidos, "Ventas por mes" y stock-aging leen Vehiculo.estado).
 */

import fs from 'fs'
import path from 'path'

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))

import {
  marcarVehiculoVendido,
  liberarVehiculoVendido,
  type Queryable,
} from '@/lib/vehiculoVenta'
import {
  ventaB2BVigenteSql,
  vehiculoTieneOtraVentaB2BVigente,
  liberarVehiculoDeVentaB2B,
  marcarVehiculoDeVentaB2BVendido,
} from '@/lib/b2b-database'

type Row = Record<string, unknown>

/** Fake Queryable: responde por substring del SQL y registra lo ejecutado. */
function fakeDb(handlers: Array<[string, Row[]]>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const db: Queryable = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      for (const [match, rows] of handlers) {
        if (sql.includes(match)) return { rows: rows as never[], rowCount: rows.length }
      }
      return { rows: [] as never[], rowCount: 0 }
    }),
  }
  const updates = () => calls.filter((c) => c.sql.includes('UPDATE "Vehiculo"'))
  return { db, calls, updates }
}

describe('marcarVehiculoVendido', () => {
  it('marca VENDIDO un coche que estaba publicado', async () => {
    const { db, updates } = fakeDb([
      ['SELECT estado', [{ estado: 'PUBLICADO', dealActivoId: null }]],
    ])

    const r = await marcarVehiculoVendido(db, 7, { origen: 'test' })

    expect(r).toBe('marcado')
    expect(updates()).toHaveLength(1)
    expect(updates()[0].sql).toContain("estado = 'VENDIDO'")
    expect(updates()[0].params).toEqual([7])
  })

  it('es idempotente: si ya está VENDIDO no vuelve a escribir', async () => {
    const { db, updates } = fakeDb([
      ['SELECT estado', [{ estado: 'vendido', dealActivoId: 3 }]], // casing sucio real
    ])

    const r = await marcarVehiculoVendido(db, 7, { origen: 'test' })

    expect(r).toBe('ya-vendido')
    expect(updates()).toHaveLength(0)
  })

  it('no escribe si el vehículo no existe', async () => {
    const { db, updates } = fakeDb([['SELECT estado', []]])
    expect(await marcarVehiculoVendido(db, 99, { origen: 'test' })).toBe(
      'sin-vehiculo'
    )
    expect(updates()).toHaveLength(0)
  })
})

describe('liberarVehiculoVendido', () => {
  it('devuelve el coche a DISPONIBLE al anularse la venta', async () => {
    const { db, updates } = fakeDb([
      ['SELECT estado', [{ estado: 'VENDIDO', dealActivoId: null }]],
    ])

    const r = await liberarVehiculoVendido(db, 7, { origen: 'test' })

    expect(r).toBe('liberado')
    expect(updates()).toHaveLength(1)
    expect(updates()[0].sql).toContain("estado = 'DISPONIBLE'")
  })

  it('idempotente: si no estaba vendido, no toca nada', async () => {
    const { db, updates } = fakeDb([
      ['SELECT estado', [{ estado: 'PUBLICADO', dealActivoId: null }]],
    ])
    expect(await liberarVehiculoVendido(db, 7, { origen: 'test' })).toBe(
      'no-estaba-vendido'
    )
    expect(updates()).toHaveLength(0)
  })

  it('NO libera un coche que reclama un deal retail', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, updates } = fakeDb([
      ['SELECT estado', [{ estado: 'VENDIDO', dealActivoId: 42 }]],
    ])

    expect(await liberarVehiculoVendido(db, 7, { origen: 'test' })).toBe(
      'reclamado-por-deal'
    )
    expect(updates()).toHaveLength(0)
    warn.mockRestore()
  })
})

describe('liberarVehiculoDeVentaB2B', () => {
  it('no libera si el coche tiene OTRA venta B2B vigente', async () => {
    const { db, updates } = fakeDb([
      ['EXISTS', [{ existe: true }]],
      ['SELECT estado', [{ estado: 'VENDIDO', dealActivoId: null }]],
    ])

    await liberarVehiculoDeVentaB2B(db, {
      vehiculoId: 7,
      ventaId: 1,
      origen: 'test',
    })

    expect(updates()).toHaveLength(0)
  })

  it('libera si la venta anulada era la única vigente', async () => {
    const { db, updates } = fakeDb([
      ['EXISTS', [{ existe: false }]],
      ['SELECT estado', [{ estado: 'VENDIDO', dealActivoId: null }]],
    ])

    await liberarVehiculoDeVentaB2B(db, {
      vehiculoId: 7,
      ventaId: 1,
      origen: 'test',
    })

    expect(updates()).toHaveLength(1)
    expect(updates()[0].sql).toContain("estado = 'DISPONIBLE'")
  })

  it('venta sin vehículo asociado: no hace ninguna query', async () => {
    const { db, calls } = fakeDb([])
    await liberarVehiculoDeVentaB2B(db, {
      vehiculoId: null,
      ventaId: 1,
      origen: 'test',
    })
    await marcarVehiculoDeVentaB2BVendido(db, { vehiculoId: null, origen: 't' })
    expect(calls).toHaveLength(0)
  })

  it('un fallo de DB no rompe al caller (best-effort)', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    const db: Queryable = {
      query: jest.fn(async () => {
        throw new Error('DB caída')
      }),
    }
    await expect(
      liberarVehiculoDeVentaB2B(db, { vehiculoId: 7, ventaId: 1, origen: 't' })
    ).resolves.toBeUndefined()
    await expect(
      marcarVehiculoDeVentaB2BVendido(db, { vehiculoId: 7, origen: 't' })
    ).resolves.toBeUndefined()
    err.mockRestore()
  })
})

describe('criterio de venta B2B vigente (anti-backfill de ventas anuladas)', () => {
  it('excluye ANULADO y las ventas cuya única factura quedó RECTIFIED/VOIDED', () => {
    const sql = ventaB2BVigenteSql('vb')
    expect(sql).toContain("vb.status <> 'ANULADO'")
    expect(sql).toContain("i.status IN ('ISSUED', 'IMPORTED', 'PDF_PENDING')")
    expect(sql).toContain("i.status IN ('RECTIFIED', 'VOIDED')")
    expect(sql).toContain("i.invoice_type <> 'RECTIFYING'")
  })

  it('vehiculoTieneOtraVentaB2BVigente excluye la propia venta', async () => {
    const { db, calls } = fakeDb([['EXISTS', [{ existe: false }]]])
    await vehiculoTieneOtraVentaB2BVigente(db, 7, 33)
    expect(calls[0].params).toEqual([7, 33])
    expect(calls[0].sql).toContain('vb.id <> $2')
    expect(calls[0].sql).toContain("vb.status <> 'ANULADO'")
  })

  it('el backfill usa EXACTAMENTE el mismo predicado (no puede driftear)', () => {
    const script = fs.readFileSync(
      path.join(process.cwd(), 'scripts/backfill-vehiculos-vendidos-b2b.js'),
      'utf8'
    )
    const m = script.match(/const VIGENTE = `([\s\S]*?)`/)
    expect(m).not.toBeNull()

    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    expect(norm(m![1])).toBe(norm(ventaB2BVigenteSql('vb')))
  })
})
