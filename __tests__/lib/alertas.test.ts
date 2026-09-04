/**
 * @jest-environment node
 *
 * lib/alertas: detección por tipo, aislamiento de fallos, digest y bandeja.
 * pg y mailer mockeados (unit, sin DB ni SMTP).
 */
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/mailer', () => ({ sendMail: jest.fn() }))

import { pool } from '@/lib/direct-database'
import {
  detectarAlertas,
  detectarAlertasConErrores,
  renderDigest,
  sincronizarBandeja,
  dedupKey,
  type Alerta,
} from '@/lib/alertas'

const mockQuery = pool.query as unknown as jest.Mock

const HOY = new Date('2026-09-04T10:00:00Z')
const dias = (n: number) => new Date(HOY.getTime() - n * 86_400_000)

const dealBase = {
  numero: 'D-0042',
  cliente_nombre: 'Ana',
  cliente_apellidos: 'García',
  vehiculo_marca: 'Seat',
  vehiculo_modelo: 'León',
  vehiculo_matricula: '1234ABC',
}

const stockBase = {
  referencia: '100',
  matricula: '1111AAA',
  marca: 'Seat',
  modelo: 'Leon',
  estado: 'PUBLICADO',
  diasEnStock: 10,
  precioCompra: 10000,
  gastosTransporte: null,
  gastosTasas: null,
  gastosMecanica: null,
  gastosPintura: null,
  gastosLimpieza: null,
  gastosOtros: null,
  gastosCNGarantia: null,
  precioPublicacion: 12000,
  precioVenta: null,
}

/** Despacha por contenido del SQL: una respuesta por detector/tabla. */
function fixture(overrides: Record<string, () => unknown> = {}) {
  const base: Record<string, () => unknown> = {
    '"fechaReservaExpira" <': () => ({
      rows: [
        { ...dealBase, id: 1, fechaReservaExpira: dias(3) },
        { ...dealBase, id: 2, numero: 'D-0043', fechaReservaExpira: dias(-1) },
      ],
    }),
    '"DealRecordatorios"': () => ({
      rows: [
        {
          id: 7,
          entidad_id: 1,
          titulo: 'Llamar por la ITV',
          prioridad: 'media',
          fecha: dias(1),
          etiqueta: 'D-0042 · Ana García',
        },
      ],
    }),
    '"VehiculoRecordatorios"': () => {
      throw Object.assign(new Error('relation does not exist'), {
        code: '42P01',
      })
    },
    '"ClienteReminder"': () => ({
      rows: [
        {
          id: 3,
          entidad_id: 9,
          titulo: 'Seguimiento',
          prioridad: 'alta',
          fecha: dias(0),
          etiqueta: 'Luis Pérez',
        },
      ],
    }),
    '"DepositoRecordatorios"': () => ({ rows: [] }),
    '"InversorRecordatorios"': () => ({ rows: [] }),
    '"documentacionRetirada"': () => ({
      rows: [
        {
          ...dealBase,
          id: 5,
          cambioNombreSolicitado: true,
          documentacionRecibida: false,
          clienteAvisado: false,
          desde: dias(20),
        },
      ],
    }),
    '"restoAPagar" > 0': () => ({
      rows: [
        {
          ...dealBase,
          id: 6,
          estado: 'vendido',
          restoAPagar: 1500.5,
          desde: dias(10),
        },
      ],
    }),
    'FROM "Vehiculo" v': () => ({
      rows: [
        { ...stockBase, id: 21, diasEnStock: 95 },
        {
          ...stockBase,
          id: 22,
          diasEnStock: 200,
          gastosMecanica: 3000,
          precioPublicacion: 11000,
        },
        { ...stockBase, id: 23, diasEnStock: 30 },
      ],
    }),
  }
  const table = { ...base, ...overrides }
  mockQuery.mockReset().mockImplementation(async (sql: string) => {
    const key = Object.keys(table).find((k) => String(sql).includes(k))
    if (!key) throw new Error(`SQL sin fixture: ${String(sql).slice(0, 80)}`)
    return table[key]()
  })
}

describe('detectarAlertas', () => {
  it('clasifica cada tipo con severidad, ref y url', async () => {
    fixture()
    const { alertas, errores } = await detectarAlertasConErrores(HOY)
    expect(errores).toEqual([]) // la tabla ausente (42P01) no es un error

    const porRef = (tipo: string) => alertas.filter((a) => a.tipo === tipo)

    const caducadas = porRef('reserva-caducada')
    expect(caducadas).toHaveLength(1)
    expect(caducadas[0]).toMatchObject({
      severidad: 'alta',
      ref: 'deal:1',
      url: '/deals/1',
    })
    expect(caducadas[0].titulo).toContain('D-0042')
    expect(caducadas[0].titulo).toContain('Ana García')
    expect(caducadas[0].titulo).toContain('Seat León (1234ABC)')
    expect(caducadas[0].detalle).toContain('hace 3 días')

    expect(porRef('reserva-por-vencer')).toEqual([
      expect.objectContaining({ severidad: 'media', ref: 'deal:2' }),
    ])

    const rec = porRef('recordatorio-vencido')
    expect(rec.map((a) => a.ref).sort()).toEqual([
      'recordatorio:cliente:3',
      'recordatorio:deal:7',
    ])
    expect(rec.find((a) => a.ref === 'recordatorio:deal:7')).toMatchObject({
      severidad: 'media',
      url: '/deals/1',
    })
    // prioridad alta → severidad alta aunque venza hoy
    expect(rec.find((a) => a.ref === 'recordatorio:cliente:3')).toMatchObject({
      severidad: 'alta',
      url: '/clientes/9',
    })

    expect(porRef('cambio-nombre')).toEqual([
      expect.objectContaining({
        severidad: 'alta',
        ref: 'deal:5',
        url: '/deals/5',
      }),
    ])
    expect(porRef('cambio-nombre')[0].detalle).toContain(
      'documentación sin recibir'
    )

    expect(porRef('cobro-pendiente')).toEqual([
      expect.objectContaining({ severidad: 'media', ref: 'deal:6' }),
    ])
    expect(porRef('cobro-pendiente')[0].titulo).toContain('1.501 €')

    expect(porRef('stock-parado').map((a) => [a.ref, a.severidad])).toEqual([
      // dentro de un tipo, severidad alta primero
      ['vehiculo:22', 'alta'],
      ['vehiculo:21', 'media'],
    ])
    expect(porRef('margen-negativo')).toEqual([
      expect.objectContaining({
        ref: 'vehiculo:22',
        severidad: 'alta',
        url: '/vehiculos/22',
      }),
    ])

    // orden: tipos críticos primero
    expect(alertas[0].tipo).toBe('reserva-caducada')
    expect(alertas[alertas.length - 1].tipo).toBe('stock-parado')

    // firma corta
    expect(await detectarAlertas(HOY)).toHaveLength(alertas.length)
  })

  it('pasa `hoy` como parámetro a las queries', async () => {
    fixture()
    await detectarAlertasConErrores(HOY)
    const conParam = mockQuery.mock.calls.filter((c) => Array.isArray(c[1]))
    expect(conParam.length).toBeGreaterThan(0)
    for (const c of conParam) expect(c[1][0]).toBe(HOY)
  })

  it('un detector que lanza no impide a los demás', async () => {
    fixture({
      '"restoAPagar" > 0': () => {
        throw new Error('boom cobros')
      },
      '"ClienteReminder"': () => {
        throw new Error('columna rota')
      },
    })
    const { alertas, errores } = await detectarAlertasConErrores(HOY)
    expect(errores).toEqual([
      { tipo: 'recordatorio-vencido:cliente', error: 'columna rota' },
      { tipo: 'cobro-pendiente', error: 'boom cobros' },
    ])
    const tipos = new Set(alertas.map((a) => a.tipo))
    expect(tipos.has('cobro-pendiente')).toBe(false)
    expect(tipos.has('reserva-caducada')).toBe(true)
    expect(tipos.has('recordatorio-vencido')).toBe(true) // el de deal sigue
    expect(tipos.has('stock-parado')).toBe(true)
  })
})

describe('renderDigest', () => {
  const alertas: Alerta[] = [
    {
      tipo: 'reserva-caducada',
      severidad: 'alta',
      ref: 'deal:1',
      titulo: 'Reserva caducada: D-1 · Ana <García>',
      detalle: 'Venció ayer.',
      url: '/deals/1',
    },
    {
      tipo: 'stock-parado',
      severidad: 'media',
      ref: 'vehiculo:2',
      titulo: 'Stock parado: Seat León',
      detalle: '95 días.',
      url: '/vehiculos/2',
    },
    {
      tipo: 'stock-parado',
      severidad: 'alta',
      ref: 'vehiculo:3',
      titulo: 'Stock parado: Audi A3',
      detalle: '200 días.',
      url: '/vehiculos/3',
    },
  ]

  it('agrupa por tipo, enlaza en absoluto y escapa HTML', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://crm.test/'
    const d = renderDigest(alertas, HOY)
    expect(d.subject).toBe('Alertas CRM 04/09/2026: 3 avisos')
    expect(d.html).toContain('Reservas caducadas (1)')
    expect(d.html).toContain('Stock parado (&gt; 90 días) (2)')
    expect(d.html).toContain('href="https://crm.test/deals/1"')
    expect(d.html).toContain('href="https://crm.test/vehiculos/3"')
    expect(d.html).toContain('Ana &lt;García&gt;')
    expect(d.html).toContain('[ALTA]')
    expect(d.html).toContain('https://crm.test/revision')
    expect(d.text).toContain('Reservas caducadas (1)')
    expect(d.text).toContain('https://crm.test/vehiculos/2')
    expect(d.text).toContain('[ALTA] Stock parado: Audi A3')
    // el grupo de reservas va antes que el de stock
    expect(d.html.indexOf('Reservas caducadas')).toBeLessThan(
      d.html.indexOf('Stock parado')
    )
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('usa la URL por defecto y singular con 1 aviso', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const d = renderDigest([alertas[0]], HOY)
    expect(d.subject).toBe('Alertas CRM 04/09/2026: 1 aviso')
    expect(d.html).toContain('https://sevencars.vercel.app/deals/1')
  })
})

describe('sincronizarBandeja', () => {
  const a = (
    ref: string,
    tipo: Alerta['tipo'] = 'reserva-caducada'
  ): Alerta => ({
    tipo,
    severidad: 'alta',
    ref,
    titulo: `t ${ref}`,
    detalle: `d ${ref}`,
    url: `/deals/${ref.split(':')[1]}`,
  })

  it('no toca la DB sin alertas', async () => {
    mockQuery.mockReset()
    expect(await sincronizarBandeja([])).toEqual({ nuevos: 0, existentes: 0 })
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('un solo INSERT con dedup por tipo+ref y cuenta nuevos/existentes', async () => {
    mockQuery.mockReset().mockResolvedValue({
      rows: [{ dedup_key: 'alertas:reserva-caducada:deal:1' }],
    })
    const r = await sincronizarBandeja([a('deal:1'), a('deal:2'), a('deal:1')])
    expect(r).toEqual({ nuevos: 1, existentes: 1 })
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(String(sql)).toMatch(/INSERT INTO revision_items/)
    expect(String(sql)).toMatch(/'alertas'/)
    expect(String(sql)).toMatch(/ON CONFLICT \(dedup_key\) DO NOTHING/)
    const filas = JSON.parse(params[0])
    expect(filas).toHaveLength(2)
    expect(filas[0].dedup_key).toBe(dedupKey(a('deal:1')))
    expect(filas[0].payload).toMatchObject({
      tipo: 'reserva-caducada',
      ref: 'deal:1',
      url: '/deals/1',
      motivo: 'd deal:1',
    })
  })
})
