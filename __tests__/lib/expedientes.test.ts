/**
 * Acceso a datos del expediente con pool mockeado:
 *  - recalcularExpediente marca 'factura-compra' presente vía facturas_registro
 *    y degrada 'enviado' → 'incompleto' si sigue faltando un requerido.
 *  - crearExpedienteAlEmitir detecta depósito por Vehiculo.tipo.
 */

import type { Pool } from 'pg'
import {
  crearExpedienteAlEmitir,
  recalcularExpediente,
} from '@/lib/expedientes'
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

// Checklist retail-vat vigente: el justificante de compra es un grupo
// "al menos uno" (factura de compra O contrato de compraventa).
const checklistVat = (presentes: Record<string, boolean>): ChecklistItem[] => [
  {
    clave: 'factura-venta',
    label: 'Factura de venta',
    requerido: true,
    presente: presentes['factura-venta'] ?? false,
  },
  // contrato-venta solo es requerido en REBU a particular y depósito
  {
    clave: 'contrato-venta',
    label: 'Contrato de venta',
    requerido: false,
    presente: presentes['contrato-venta'] ?? false,
  },
  {
    clave: 'factura-compra',
    label: 'Factura de compra',
    requerido: true,
    grupo: 'justificante-compra',
    presente: presentes['factura-compra'] ?? false,
  },
  {
    clave: 'contrato-compra',
    label: 'Contrato de compra',
    requerido: true,
    grupo: 'justificante-compra',
    presente: presentes['contrato-compra'] ?? false,
  },
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
              tipo_operacion: 'retail-vat',
              checklist: checklistVat({
                'factura-venta': true,
                'contrato-venta': true,
              }),
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
    const update = query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE expedientes')
    )
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
              tipo_operacion: 'retail-vat',
              // factura-compra faltante (requerida en retail-vat; sin evidencia)
              checklist: checklistVat({
                'factura-venta': true,
                'contrato-venta': true,
              }),
            },
          ],
        },
      ],
      [
        'FROM automation_logs',
        {
          rows: [
            {
              venta_guardada: true,
              compra_adjunta: false,
              contrato_enviado: false,
            },
          ],
        },
      ],
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
              tipo_operacion: 'retail-vat',
              checklist: checklistVat({
                'factura-venta': true,
                'contrato-venta': true,
                'factura-compra': true, // marcado a mano
              }),
            },
          ],
        },
      ],
      [
        'FROM automation_logs',
        {
          rows: [
            {
              venta_guardada: true,
              compra_adjunta: false,
              contrato_enviado: true,
            },
          ],
        },
      ],
    ])

    const r = await recalcularExpediente(db, 9)
    expect(r?.estadoDespues).toBe('completo')
    expect(r?.cambio).toBe(false)
    expect(
      query.mock.calls.some(([sql]) => sql.includes('UPDATE expedientes'))
    ).toBe(false)
  })

  it('promueve items por el snapshot de OneDrive con fuente carpeta-onedrive', async () => {
    const { db, query } = makeDb([
      // orden importa (primera coincidencia gana): las queries del snapshot
      // también contienen "FROM expedientes" como substring.
      ['to_regclass', { rows: [{ reg: 'expedientes_carpetas' }] }],
      [
        'expedientes_carpetas',
        {
          rows: [
            {
              archivos: [
                { nombre: 'Factura-Venta-F-2026-030.pdf' },
                { nombre: 'Factura-Compra-XXXX.pdf' },
              ],
            },
          ],
        },
      ],
      [
        'FROM expedientes',
        {
          rows: [
            {
              id: 12,
              numero_factura: 'F-2026-030',
              matricula: '8061KRN',
              estado: 'incompleto',
              tipo_operacion: 'retail-vat',
              checklist: checklistVat({ 'contrato-venta': true }),
            },
          ],
        },
      ],
      ['FROM automation_logs', { rows: [] }],
      ['FROM facturas_registro', { rows: [] }],
    ])

    const r = await recalcularExpediente(db, 12)

    expect(r?.itemsActualizados?.sort()).toEqual([
      'factura-compra',
      'factura-venta',
    ])
    expect(r?.estadoDespues).toBe('completo')
    const update = query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE expedientes')
    )
    const [, params] = update as [string, unknown[]]
    const saved = JSON.parse(params[0] as string) as ChecklistItem[]
    const fv = saved.find((i) => i.clave === 'factura-venta')
    expect(fv?.presente).toBe(true)
    expect(fv?.nota).toBe('fuente: carpeta-onedrive')
    // el marcado a mano no se toca ni recibe nota
    expect(
      saved.find((i) => i.clave === 'contrato-venta')?.nota
    ).toBeUndefined()
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
    const insert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO expedientes')
    )
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

describe('recalcularExpediente con alias de matrícula', () => {
  it('encuentra la factura de compra archivada bajo la matrícula vieja', async () => {
    const { db, query } = makeDb([
      [
        'FROM expedientes',
        {
          rows: [
            {
              id: 9,
              numero_factura: 'R-2026-027',
              matricula: '5439NNW', // definitiva (el coche ya cambió)
              estado: 'incompleto',
              tipo_operacion: 'retail-vat',
              checklist: checklistVat({ 'factura-venta': true }),
            },
          ],
        },
      ],
      [
        "to_regclass('public.vehiculo_matriculas')",
        { rows: [{ reg: 'vehiculo_matriculas' }] },
      ],
      [
        'JOIN vehiculo_matriculas m2',
        {
          rows: [
            { matricula_norm: '5439NNW', vehiculo_id: 398 },
            { matricula_norm: '5732BDR', vehiculo_id: 398 },
          ],
        },
      ],
      ['FROM automation_logs', { rows: [] }],
      // la factura de compra quedó registrada con la PROVISIONAL
      ['FROM facturas_registro', { rows: [{ '?column?': 1 }] }],
    ])

    const r = await recalcularExpediente(db, 9)

    const registro = query.mock.calls.find((c) =>
      String(c[0]).includes('FROM facturas_registro')
    )!
    expect(registro[1]).toEqual([['5439NNW', '5732BDR']])
    expect(r?.itemsActualizados).toContain('factura-compra')
    expect(r?.estadoDespues).toBe('completo')
  })
})

describe('recalcularExpediente propaga la regla nueva del justificante de compra', () => {
  it('expediente retail-vat viejo (exigía factura-compra) + coche de particular → contrato basta, completo', async () => {
    const { db, query } = makeDb([
      [
        "to_regclass('public.expedientes_carpetas')",
        { rows: [{ reg: 'expedientes_carpetas' }] },
      ],
      [
        'FROM expedientes_carpetas',
        { rows: [{ archivos: [{ nombre: 'CONTRATO COMPRA VENTA.pdf' }] }] },
      ],
      [
        'FROM expedientes',
        {
          rows: [
            {
              id: 33,
              numero_factura: 'F-2026-4233',
              matricula: '3835LWT',
              estado: 'incompleto',
              tipo_operacion: 'retail-vat',
              // checklist GUARDADA con la definición VIEJA: sin contrato-compra
              checklist: [
                {
                  clave: 'factura-venta',
                  label: 'Factura de venta',
                  requerido: true,
                  presente: true,
                },
                {
                  clave: 'contrato-venta',
                  label: 'Contrato de venta',
                  requerido: false,
                  presente: true,
                },
                {
                  clave: 'factura-compra',
                  label: 'Factura de compra',
                  requerido: true,
                  presente: false,
                },
              ],
            },
          ],
        },
      ],
      ['FROM automation_logs', { rows: [] }],
      ['FROM facturas_registro', { rows: [] }], // no hay factura de compra: es de particular
    ])

    const r = await recalcularExpediente(db, 33)

    // El contrato de compraventa (carpeta) satisface el grupo → ya no falta nada.
    expect(r?.estadoDespues).toBe('completo')
    expect(r?.cambio).toBe(true)
    const update = query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE expedientes')
    )!
    const [, params] = update as [string, unknown[]]
    const saved = JSON.parse(params[0] as string) as ChecklistItem[]
    // la definición vigente se propagó al expediente ya guardado
    expect(saved.map((i) => i.clave)).toEqual([
      'factura-venta',
      'contrato-venta',
      'factura-compra',
      'contrato-compra',
    ])
    expect(saved.find((i) => i.clave === 'contrato-compra')).toMatchObject({
      presente: true,
      grupo: 'justificante-compra',
      nota: 'fuente: carpeta-onedrive',
    })
    // la factura de compra sigue ausente y NO se marca (no existe)
    expect(saved.find((i) => i.clave === 'factura-compra')?.presente).toBe(
      false
    )
    expect(params[1]).toBe('completo')
  })

  it('sin factura NI contrato de compra el expediente sigue incompleto', async () => {
    const { db } = makeDb([
      [
        "to_regclass('public.expedientes_carpetas')",
        { rows: [{ reg: 'expedientes_carpetas' }] },
      ],
      [
        'FROM expedientes_carpetas',
        { rows: [{ archivos: [{ nombre: 'permiso-circulacion.pdf' }] }] },
      ],
      [
        'FROM expedientes',
        {
          rows: [
            {
              id: 34,
              numero_factura: 'F-2026-4240',
              matricula: '6935KYC',
              estado: 'completo',
              tipo_operacion: 'retail-vat',
              checklist: checklistVat({ 'factura-venta': true }),
            },
          ],
        },
      ],
      ['FROM automation_logs', { rows: [] }],
      ['FROM facturas_registro', { rows: [] }],
    ])

    const r = await recalcularExpediente(db, 34)
    expect(r?.estadoDespues).toBe('incompleto')
  })
})
