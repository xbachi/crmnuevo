/**
 * Acceso a datos del expediente con pool mockeado:
 *  - recalcularExpediente marca 'factura-compra' presente vía facturas_registro
 *    y degrada 'enviado' → 'incompleto' si sigue faltando un requerido.
 *  - crearExpedienteAlEmitir detecta depósito por Vehiculo.tipo.
 */

import type { Pool } from 'pg'
import { crearExpedienteAlEmitir, recalcularExpediente } from '@/lib/expedientes'
import type { ChecklistItem } from '@/lib/expedienteChecklist'

// Dispatcher: primera coincidencia por substring de SQL gana.
function makeDb(handlers: Array<[string, unknown]>) {
  const query = jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    return { rows: [], rowCount: 0 }
  })
  return { db: { query } as unknown as Pool, query }
}

const checklistVat = (presentes: Record<string, boolean>): ChecklistItem[] => [
  { clave: 'factura-venta', label: 'Factura de venta', requerido: true, presente: presentes['factura-venta'] ?? false },
  { clave: 'contrato-venta', label: 'Contrato de venta', requerido: true, presente: presentes['contrato-venta'] ?? false },
  { clave: 'factura-compra', label: 'Factura de compra', requerido: true, presente: presentes['factura-compra'] ?? false },
]

describe('recalcularExpediente', () => {
  it('marca factura-compra presente cuando hay registro coche-compra con la matrícula', async () => {
    const { db, query } = makeDb([
      [
        'FROM expedientes',
        {
          rows: [
            {
              id: 7,
              numero_factura: 'F-2026-005',
              matricula: '1234ABC',
              estado: 'incompleto',
              checklist: checklistVat({ 'factura-venta': true, 'contrato-venta': true }),
            },
          ],
        },
      ],
      // automation_logs: sin fila (compra_adjunta desconocida)
      ['FROM automation_logs', { rows: [] }],
      // facturas_registro: hay factura de compra archivada para esa matrícula
      ['FROM facturas_registro', { rows: [{ '?column?': 1 }] }],
    ])

    const r = await recalcularExpediente(db, 7)

    expect(r).toMatchObject({
      id: 7,
      estadoAntes: 'incompleto',
      estadoDespues: 'completo',
      itemsActualizados: ['factura-compra'],
      cambio: true,
    })
    const update = query.mock.calls.find(([sql]) => sql.includes('UPDATE expedientes'))
    expect(update).toBeDefined()
    const [, params] = update as [string, unknown[]]
    const saved = JSON.parse(params[0] as string) as ChecklistItem[]
    expect(saved.find((i) => i.clave === 'factura-compra')?.presente).toBe(true)
    expect(params[1]).toBe('completo')
  })

  it('degrada enviado → incompleto si al recalcular falta un requerido', async () => {
    const { db } = makeDb([
      [
        'FROM expedientes',
        {
          rows: [
            {
              id: 8,
              numero_factura: 'F-2026-006',
              matricula: '5678DEF',
              estado: 'enviado',
              // contrato-venta faltante (nadie lo marcó y no hay evidencia)
              checklist: checklistVat({ 'factura-venta': true, 'factura-compra': true }),
            },
          ],
        },
      ],
      ['FROM automation_logs', { rows: [{ venta_guardada: true, compra_adjunta: true, contrato_enviado: false }] }],
      ['FROM facturas_registro', { rows: [] }],
    ])

    const r = await recalcularExpediente(db, 8)
    expect(r?.estadoAntes).toBe('enviado')
    expect(r?.estadoDespues).toBe('incompleto')
    expect(r?.cambio).toBe(true)
  })

  it('no toca items marcados a mano aunque no haya evidencia (solo promueve)', async () => {
    const { db, query } = makeDb([
      [
        'FROM expedientes',
        {
          rows: [
            {
              id: 9,
              numero_factura: 'F-2026-007',
              matricula: null,
              estado: 'completo',
              checklist: checklistVat({
                'factura-venta': true,
                'contrato-venta': true,
                'factura-compra': true, // marcado a mano
              }),
            },
          ],
        },
      ],
      ['FROM automation_logs', { rows: [{ venta_guardada: true, compra_adjunta: false, contrato_enviado: true }] }],
    ])

    const r = await recalcularExpediente(db, 9)
    expect(r?.estadoDespues).toBe('completo')
    expect(r?.cambio).toBe(false)
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE expedientes'))).toBe(false)
  })

  it('devuelve null si el expediente no existe', async () => {
    const { db } = makeDb([['FROM expedientes', { rows: [] }]])
    expect(await recalcularExpediente(db, 999)).toBeNull()
  })
})

describe('crearExpedienteAlEmitir', () => {
  it('detecta depósito por Vehiculo.tipo y arma la checklist con contrato-deposito', async () => {
    const { db, query } = makeDb([
      ['FROM "Vehiculo"', { rows: [{ tipo: 'Deposito Venta' }] }],
      ['INSERT INTO expedientes', { rows: [{ id: 42 }] }],
    ])

    const r = await crearExpedienteAlEmitir(db, {
      invoiceType: 'REBU',
      dealId: 10,
      vehiculoId: 55,
      matricula: '9999 zzz',
      numeroFactura: 'R-2026-040',
      invoiceDate: '2026-06-15',
    })

    expect(r).toEqual({ id: 42, tipoOperacion: 'deposito' })
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO expedientes'))
    const [, params] = insert as [string, unknown[]]
    expect(params[0]).toBe('deposito')
    expect(params[4]).toBe('9999ZZZ') // matrícula normalizada
    const checklist = JSON.parse(params[7] as string) as ChecklistItem[]
    expect(checklist.map((i) => i.clave)).toContain('contrato-deposito')
    expect(checklist.every((i) => i.presente === false)).toBe(true)
  })

  it('devuelve null (idempotente) si ya existe expediente para esa factura', async () => {
    const { db } = makeDb([
      ['FROM "Vehiculo"', { rows: [{ tipo: 'Compra' }] }],
      ['INSERT INTO expedientes', { rows: [] }], // ON CONFLICT DO NOTHING
    ])
    const r = await crearExpedienteAlEmitir(db, {
      invoiceType: 'VAT',
      dealId: 11,
      vehiculoId: 56,
      numeroFactura: 'F-2026-020',
    })
    expect(r).toBeNull()
  })
})
