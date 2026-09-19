/**
 * @jest-environment node
 *
 * Carpetas de coche en OneDrive: nombre canónico, ubicación por tipo/estado,
 * diff puro contra lo listado por el receptor, encolado (dedupe + kill
 * switch) y ejecución de acciones contra el webhook.
 */

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('next/server', () => ({ after: (fn: () => void) => fn() }))
jest.mock('@/lib/webhookOutbox', () => ({
  insertOutboxPending: jest.fn(),
  markOutboxEnviado: jest.fn(),
  markOutboxFallo: jest.fn(),
  markOutboxAgotado: jest.fn(),
}))

import { pool } from '@/lib/direct-database'
import { insertOutboxPending } from '@/lib/webhookOutbox'
import {
  checkCarpetasOneDrive,
  diffCarpetas,
  ejecutarCarpetas,
  encolarCarpetasOneDrive,
  nombreCarpetaCanonico,
  nombreDestinoRenombrar,
  ubicacionEsperada,
  type CarpetaListada,
  type VehiculoEsperado,
} from '@/lib/onedriveCarpetas'

const mockQuery = pool.query as jest.Mock
const mockInsert = insertOutboxPending as jest.Mock

describe('nombreCarpetaCanonico', () => {
  it.each([
    [
      '#1010',
      'C',
      'Opel',
      'Insignia',
      '1657KLB',
      [],
      '10-Opel-Insignia-1657KLB',
    ],
    ['#1026', 'C', 'audi', 'q2', '2202KSC', [], '26-Audi-Q2-2202KSC'],
    ['#D-19', 'D', 'citroen', 'c3', '7466LMF', [], 'D-19-Citroen-C3-7466LMF'],
    ['#R-08', 'R', 'Citroen', 'C4', '0539GNZ', [], 'R-8-Citroen-C4-0539GNZ'],
    ['#R-23', 'R', 'mini', 'cooper', '0027FKM', [], 'R-23-Mini-Cooper-0027FKM'],
    [
      '#1069',
      'C',
      'Ford',
      'Kuga',
      '0703NLP',
      ['WOB1234'],
      '69-Ford-Kuga-0703NLP-Alemania',
    ],
    ['#1001', 'C', 'Citroen', 'C3', '6274LPP', [], '1-Citroen-C3-6274LPP'],
  ])(
    '%s %s %s %s %s → %s',
    (referencia, tipo, marca, modelo, matriculaNorm, aliases, esperado) => {
      expect(
        nombreCarpetaCanonico({
          referencia,
          tipo,
          marca,
          modelo,
          matriculaNorm,
          aliases,
        })
      ).toBe(esperado)
    }
  )

  it('normaliza marca y modelo con los diccionarios', () => {
    expect(
      nombreCarpetaCanonico({
        referencia: '#1050',
        tipo: 'C',
        marca: 'mercedes benz',
        modelo: 'a 180',
        matriculaNorm: '1234BCD',
      })
    ).toMatch(/^50-Mercedes-Benz-/)
    expect(
      nombreCarpetaCanonico({
        referencia: '#1082',
        tipo: 'C',
        marca: 'kia',
        modelo: 'xcreed',
        matriculaNorm: '9028LXG',
      })
    ).toMatch(/-Kia-Xceed-/)
  })

  it('null si la referencia no se interpreta o el tipo no tiene carpeta', () => {
    expect(
      nombreCarpetaCanonico({
        referencia: 'abc',
        tipo: 'C',
        marca: 'Kia',
        modelo: 'Rio',
        matriculaNorm: '1234BCD',
      })
    ).toBeNull()
    expect(
      nombreCarpetaCanonico({
        referencia: '#1010',
        tipo: 'M',
        marca: 'Kia',
        modelo: 'Rio',
        matriculaNorm: '1234BCD',
      })
    ).toBeNull()
    expect(
      nombreCarpetaCanonico({
        referencia: '#1010',
        tipo: 'C',
        marca: 'Kia',
        modelo: 'Rio',
        matriculaNorm: '',
      })
    ).toBeNull()
  })

  it('sufijo -Alemania si la matrícula actual no es española', () => {
    expect(
      nombreCarpetaCanonico({
        referencia: '#1010',
        tipo: 'C',
        marca: 'Kia',
        modelo: 'Rio',
        matriculaNorm: 'WOB1234',
      })
    ).toBe('10-Kia-Rio-WOB1234-Alemania')
  })

  it('sanea caracteres prohibidos y guiones dobles', () => {
    const n = nombreCarpetaCanonico({
      referencia: '#1085',
      tipo: 'C',
      marca: 'Tesla',
      modelo: 'Model 3 / "X"',
      matriculaNorm: '2848NRN',
    })!
    expect(n).not.toMatch(/["*:<>?/\\|]/)
    expect(n).not.toMatch(/--/)
    expect(n).toMatch(/^85-Tesla-Model-3-X-2848NRN$/)
  })
})

describe('ubicacionEsperada', () => {
  it('R vendido en 1_Ventas', () => {
    expect(ubicacionEsperada('1_Ventas', 'R', 'VENDIDO')).toBe(
      '----VENDIDOS/0--------------------Coches-R'
    )
  })
  it('D en stock en 3_Compras', () => {
    expect(ubicacionEsperada('3_Compras', 'D', 'PUBLICADO')).toBe(
      '--------Consignacion'
    )
  })
})

function v(
  vehiculoId: number,
  referencia: string,
  tipo: string,
  marca: string,
  modelo: string,
  matricula: string,
  estado = 'PUBLICADO',
  aliases: string[] = []
): VehiculoEsperado {
  return {
    vehiculoId,
    referencia,
    tipo: tipo === 'M' ? null : (tipo as VehiculoEsperado['tipo']),
    estado,
    matriculas: [matricula, ...aliases],
    nombre: nombreCarpetaCanonico({
      referencia,
      tipo,
      marca,
      modelo,
      matriculaNorm: matricula,
      aliases,
    }),
  }
}

function c(root: string, contenedor: string, nombre: string): CarpetaListada {
  return {
    root,
    contenedor,
    nombre,
    rel: contenedor ? `${contenedor}/${nombre}` : nombre,
  }
}

describe('diffCarpetas', () => {
  const esperados: VehiculoEsperado[] = [
    v(10, '#1010', 'C', 'Opel', 'Insignia', '1657KLB'),
    v(58, '#1058', 'C', 'Citroen', 'C4', '2394HVR'),
    v(82, '#1082', 'C', 'Kia', 'Xceed', '9028LXG'),
    v(91, '#1091', 'C', 'Renault', 'Clio', '0110LMK'),
    v(2761, '#1120', 'C', 'Audi', 'A1', '2761LLM'),
    v(30, '#1030', 'C', 'Seat', 'Leon', '4444JJJ', 'VENDIDO'),
    v(31, '#1031', 'C', 'Seat', 'Ibiza', '5555KKK', 'VENDIDO'),
    v(8, '#R-08', 'R', 'Citroen', 'C4', '0539GNZ'),
    { ...v(99, 'abc', 'C', 'Fiat', '500', '7777LLL'), nombre: null },
    v(100, '#M-01', 'M', 'X', 'Y', '8888MMM'),
  ]
  const carpetas: CarpetaListada[] = [
    // 1_Ventas
    c('1_Ventas', '', '10-Opel-Insignia-1657KLB'),
    c('1_Ventas', '', '58-Citroen-C4-2394HRV'),
    c('1_Ventas', '', '82-Kia-Xceed-'),
    c('1_Ventas', '', '82-Kia-Xceed-9028LXG'),
    c('1_Ventas', '', 'Kia-Xceed-9028LXG'),
    c('1_Ventas', '', '85-Tesla-Model-3'),
    c('1_Ventas', '', '88- Tesla Model 3-AlemanIa-2848NR'),
    c('1_Ventas', '', 'Tesla-Electrico-2848NRN'),
    c('1_Ventas', '', '91-Renault-Clio-0110MLK'),
    c('1_Ventas', '----VENDIDOS', '30-Seat-Leon-4444JJJ'),
    c('1_Ventas', '', '31-Seat-Ibiza-5555KKK'),
    c('1_Ventas', '-----------Coches R', 'R-8-Citroen-C4-0539GNZ'),
    // 3_Compras
    c('3_Compras', '', '10-Opel-Insignia-1657KLB'),
    c('3_Compras', '', 'Audi-A1-2761LLM'),
    c('3_Compras', '', '82-Kia-Xceed-9028LXG'),
    c('3_Compras', '----VENDIDOS', '30-Seat-Leon-4444JJJ'),
    c('3_Compras', '----VENDIDOS', '31-Seat-Ibiza-5555KKK'),
    c('3_Compras', '-----------Coches R', 'R-8-Citroen-C4-0539GNZ'),
  ]
  const d = diffCarpetas(esperados, carpetas)

  it('faltante con posible existente mal nombrada', () => {
    const f58 = d.faltantes.find(
      (f) => f.vehiculoId === 58 && f.root === '1_Ventas'
    )
    expect(f58).toMatchObject({
      nombre: '58-Citroen-C4-2394HVR',
      contenedor: '',
      posibleExistente: '1_Ventas/58-Citroen-C4-2394HRV',
    })
    const f58c = d.faltantes.find(
      (f) => f.vehiculoId === 58 && f.root === '3_Compras'
    )
    expect(f58c).toBeDefined()
    expect(f58c!.posibleExistente).toBeUndefined()
  })

  it('carpetas sin vehículo', () => {
    expect(d.sinVehiculo).toEqual(
      expect.arrayContaining([
        '1_Ventas/82-Kia-Xceed-',
        '1_Ventas/85-Tesla-Model-3',
        '1_Ventas/88- Tesla Model 3-AlemanIa-2848NR',
        '1_Ventas/Tesla-Electrico-2848NRN',
        '1_Ventas/91-Renault-Clio-0110MLK',
        '1_Ventas/58-Citroen-C4-2394HRV',
      ])
    )
    expect(d.sinVehiculo).not.toContain('1_Ventas/10-Opel-Insignia-1657KLB')
  })

  it('no canónicas: sin referencia y vendido aún en raíz', () => {
    expect(d.noCanonicas).toContainEqual({
      rel: '3_Compras/Audi-A1-2761LLM',
      esperado: '3_Compras/120-Audi-A1-2761LLM',
      vehiculoId: 2761,
    })
    expect(d.noCanonicas).toContainEqual({
      rel: '1_Ventas/31-Seat-Ibiza-5555KKK',
      esperado: '1_Ventas/----VENDIDOS/31-Seat-Ibiza-5555KKK',
      vehiculoId: 31,
    })
    // VENDIDO ya en VENDIDOS y R en Coches R: nada que reportar
    expect(d.noCanonicas.some((n) => n.vehiculoId === 30)).toBe(false)
    expect(d.noCanonicas.some((n) => n.vehiculoId === 8)).toBe(false)
    expect(
      d.faltantes.some((f) => f.vehiculoId === 30 || f.vehiculoId === 8)
    ).toBe(false)
  })

  it('duplicados en la misma raíz', () => {
    expect(d.duplicados).toEqual([
      {
        matricula: '9028LXG',
        rutas: ['1_Ventas/82-Kia-Xceed-9028LXG', '1_Ventas/Kia-Xceed-9028LXG'],
      },
    ])
  })

  it('sin referencia interpretable; tipo M ignorado', () => {
    expect(d.sinReferencia).toEqual([
      { vehiculoId: 99, referencia: 'abc', matricula: '7777LLL' },
    ])
    expect(d.faltantes.some((f) => f.vehiculoId === 100)).toBe(false)
    expect(d.sinReferencia.some((s) => s.vehiculoId === 100)).toBe(false)
  })
})

describe('encolarCarpetasOneDrive', () => {
  const env = process.env
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...env }
  })
  afterAll(() => {
    process.env = env
  })

  it('kill switch apagado: no encola', async () => {
    delete process.env.ONEDRIVE_CARPETAS_ENABLED
    const r = await encolarCarpetasOneDrive(5, 'crear')
    expect(r).toEqual({
      encolado: false,
      reason: 'ONEDRIVE_CARPETAS_ENABLED!=1',
    })
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('fila pendiente de la misma acción: ya pendiente', async () => {
    process.env.ONEDRIVE_CARPETAS_ENABLED = '1'
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 77 }] })
    const r = await encolarCarpetasOneDrive(5, 'crear')
    expect(r).toEqual({ encolado: false, outboxId: 77, reason: 'ya pendiente' })
    expect(mockQuery.mock.calls[0][1]).toEqual([
      'onedrive_carpetas',
      '5',
      'crear',
    ])
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('otra acción: inserta y procesa', async () => {
    process.env.ONEDRIVE_CARPETAS_ENABLED = '1'
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dedupe
      .mockResolvedValueOnce({ rows: [{ referencia: '#1010' }] }) // referencia
      .mockResolvedValueOnce({ rows: [] }) // reservar (falla → no procesa)
    mockInsert.mockResolvedValueOnce(42)
    const r = await encolarCarpetasOneDrive(5, 'vendido')
    expect(r).toEqual({ encolado: true, outboxId: 42 })
    expect(mockInsert).toHaveBeenCalledWith(
      'onedrive_carpetas',
      { vehiculoId: 5, accion: 'vendido' },
      '#1010'
    )
  })
})

describe('ejecutarCarpetas', () => {
  const env = process.env
  const fetchMock = jest.fn()
  const VEH = {
    id: 10,
    referencia: '#1010',
    tipo: 'C',
    estado: 'PUBLICADO',
    marca: 'Opel',
    modelo: 'Insignia',
    matricula_norm: '1657KLB',
    aliases: [],
  }

  function db() {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass'))
        return { rows: [{ reg: 'vehiculo_matriculas' }] }
      if (sql.includes('FROM "Vehiculo" v')) return { rows: [VEH] }
      return { rows: [] }
    })
  }
  function respuesta(body: Record<string, unknown>, status = 200) {
    return { ok: status < 400, status, json: async () => body }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...env,
      N8N_RENAME_WEBHOOK_URL: 'https://n8n.test/webhook/rename-expedientes',
      N8N_RENAME_WEBHOOK_SECRET: 's3cret',
    }
    global.fetch = fetchMock as unknown as typeof fetch
    db()
  })
  afterAll(() => {
    process.env = env
  })

  it('creado: guarda carpeta y deja log', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta({
        ok: true,
        accion: 'crear',
        dryRun: false,
        rutas: ['1_Ventas/10-Opel-Insignia-1657KLB'],
        motivo: null,
        resultado: 'creado',
      })
    )
    const r = await ejecutarCarpetas(10, 'crear', undefined, 'test')
    expect(r).toEqual({
      ok: true,
      resultado: 'creado',
      nombre: '10-Opel-Insignia-1657KLB',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://n8n.test/webhook/rename-expedientes')
    expect(init.headers['X-Webhook-Secret']).toBe('s3cret')
    expect(JSON.parse(init.body)).toEqual({
      accion: 'carpetas',
      op: 'crear',
      nombre: '10-Opel-Insignia-1657KLB',
      tipo: 'C',
      matricula: '1657KLB',
    })

    const sqls = mockQuery.mock.calls.map((c) => String(c[0]))
    const log = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO onedrive_carpetas_log')
    )
    expect(log).toBeDefined()
    expect(log![1].slice(0, 2)).toEqual([10, 'crear'])
    expect(log![1][4]).toBe(true)
    const upd = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('SET carpeta = $2')
    )
    expect(upd![1]).toEqual([10, '10-Opel-Insignia-1657KLB'])
    expect(sqls.some((s) => s.includes('to_regclass'))).toBe(true)
  })

  it('conflicto: fallo permanente', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta({
        ok: false,
        accion: 'crear',
        dryRun: false,
        rutas: [],
        motivo: '2 carpetas con la matrícula',
        resultado: 'conflicto',
      })
    )
    const r = await ejecutarCarpetas(10, 'crear')
    expect(r.ok).toBe(false)
    expect(r.permanente).toBe(true)
    expect(r.error).toBe('2 carpetas con la matrícula')
    expect(
      mockQuery.mock.calls.some((c) => String(c[0]).includes('SET carpeta'))
    ).toBe(false)
  })

  it('renombrar con no_existe: repite como crear', async () => {
    fetchMock
      .mockResolvedValueOnce(
        respuesta({
          ok: false,
          accion: 'renombrar',
          dryRun: false,
          rutas: [],
          motivo: 'no está',
          resultado: 'no_existe',
        })
      )
      .mockResolvedValueOnce(
        respuesta({
          ok: true,
          accion: 'crear',
          dryRun: false,
          rutas: [],
          motivo: null,
          resultado: 'creado',
        })
      )
    const r = await ejecutarCarpetas(
      10,
      'renombrar',
      '10-Opel-Insignia-0000AAA'
    )
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      op: 'renombrar',
      de: '10-Opel-Insignia-0000AAA',
      a: '10-Opel-Insignia-1657KLB',
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      op: 'crear',
    })
  })

  it('webhook caído: fallo transitorio', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    const r = await ejecutarCarpetas(10, 'vendido')
    expect(r).toEqual({ ok: false, error: 'ECONNRESET' })
  })

  it('vehículo inexistente: permanente', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('to_regclass') ? { rows: [{ reg: 'x' }] } : { rows: [] }
    )
    const r = await ejecutarCarpetas(999, 'crear')
    expect(r.permanente).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('nombreDestinoRenombrar', () => {
  it.each([
    [
      '69-Ford-Kuga-0703NLP',
      '69-Ford-Kuga-0703NLP-Alemania',
      ['0703NLP'],
      '69-Ford-Kuga-0703NLP-Alemania',
    ],
    [
      '24-VW-Golf-VII-1234ABC-Rojo',
      '24-VW-Golf-VIII-1234ABC',
      ['1234ABC'],
      '24-VW-Golf-VIII-1234ABC-Rojo',
    ],
    [
      '4-Ford-Mondeo-5678BCD',
      '4-Ford-Mondeo-ST-Line-5678BCD',
      ['5678BCD'],
      '4-Ford-Mondeo-ST-Line-5678BCD',
    ],
    [
      '69-Ford-Kuga-0703NLP-Alemania-Rojo',
      '69-Ford-Kuga-0703NLP-Alemania',
      ['0703NLP', 'WOB1234'],
      '69-Ford-Kuga-0703NLP-Alemania-Rojo',
    ],
  ])('%s → %s', (actual, canonico, matriculas, esperado) => {
    expect(nombreDestinoRenombrar(actual, canonico, matriculas)).toBe(esperado)
  })

  it('null si la matrícula no aparece como segmento', () => {
    expect(
      nombreDestinoRenombrar('Ford-Kuga-Alemania', '69-Ford-Kuga-0703NLP', [
        '0703NLP',
      ])
    ).toBeNull()
  })
})

describe('diffCarpetas: plan de acciones', () => {
  it('VENDIDO con carpeta en el contenedor de stock → mover', () => {
    const d = diffCarpetas(
      [v(30, '#1030', 'C', 'Seat', 'Leon', '4444JJJ', 'VENDIDO')],
      [c('1_Ventas', '', '30-Seat-Leon-4444JJJ-Rojo')]
    )
    expect(d.plan).toEqual([
      {
        vehiculoId: 30,
        root: '1_Ventas',
        accion: 'mover',
        actual: '1_Ventas/30-Seat-Leon-4444JJJ-Rojo',
        esperado: '1_Ventas/----VENDIDOS/30-Seat-Leon-4444JJJ',
        de: '30-Seat-Leon-4444JJJ-Rojo',
        a: '30-Seat-Leon-4444JJJ-Rojo',
      },
    ])
  })

  it('VENDIDO tipo R → destino la subcarpeta de Coches R de VENDIDOS', () => {
    const d = diffCarpetas(
      [v(8, '#R-08', 'R', 'Citroen', 'C4', '0539GNZ', 'VENDIDO')],
      [c('1_Ventas', '-----------Coches R', 'R-8-Citroen-C4-0539GNZ')]
    )
    expect(d.plan).toHaveLength(1)
    expect(d.plan[0]).toMatchObject({
      accion: 'mover',
      esperado:
        '1_Ventas/----VENDIDOS/0--------------------Coches-R/R-8-Citroen-C4-0539GNZ',
    })
  })

  it('EN STOCK con carpeta en VENDIDOS → revisar, nunca mover ni renombrar', () => {
    const d = diffCarpetas(
      [v(50, '#1050', 'C', 'Kia', 'Rio', '7777NNN')],
      [c('1_Ventas', '----VENDIDOS', '50-Kia-Rio-7777NNN')]
    )
    expect(d.plan).toEqual([
      {
        vehiculoId: 50,
        root: '1_Ventas',
        accion: 'revisar',
        actual: '1_Ventas/----VENDIDOS/50-Kia-Rio-7777NNN',
        esperado: '1_Ventas/50-Kia-Rio-7777NNN',
        de: '50-Kia-Rio-7777NNN',
        a: null,
        motivo: 'la carpeta está en VENDIDOS y el CRM lo da en stock',
      },
    ])
    expect(
      d.plan.some((p) => p.accion === 'mover' || p.accion === 'renombrar')
    ).toBe(false)
  })

  it('contenedor correcto y nombre distinto → renombrar conservando sufijos', () => {
    const d = diffCarpetas(
      [v(40, '#1040', 'C', 'Opel', 'Corsa', '6666LLL')],
      [c('1_Ventas', '', '40-Opel-Korsa-6666LLL-Rojo')]
    )
    expect(d.plan).toEqual([
      {
        vehiculoId: 40,
        root: '1_Ventas',
        accion: 'renombrar',
        actual: '1_Ventas/40-Opel-Korsa-6666LLL-Rojo',
        esperado: '1_Ventas/40-Opel-Corsa-6666LLL',
        de: '40-Opel-Korsa-6666LLL-Rojo',
        a: '40-Opel-Corsa-6666LLL-Rojo',
      },
    ])
  })

  it('en stock en otro contenedor que no es VENDIDOS → revisar', () => {
    const d = diffCarpetas(
      [v(40, '#1040', 'C', 'Opel', 'Corsa', '6666LLL')],
      [c('1_Ventas', '-------Consignacion', '40-Opel-Corsa-6666LLL')]
    )
    expect(d.plan).toEqual([
      {
        vehiculoId: 40,
        root: '1_Ventas',
        accion: 'revisar',
        actual: '1_Ventas/-------Consignacion/40-Opel-Corsa-6666LLL',
        esperado: '1_Ventas/40-Opel-Corsa-6666LLL',
        de: '40-Opel-Corsa-6666LLL',
        a: null,
        motivo: 'contenedor distinto (-------Consignacion)',
      },
    ])
  })

  it('canónica con sufijos en el contenedor correcto → sin plan', () => {
    const d = diffCarpetas(
      [v(40, '#1040', 'C', 'Opel', 'Corsa', '6666LLL')],
      [
        c('1_Ventas', '', '40-Opel-Corsa-6666LLL-Rojo-Inversor-Juan'),
        c('3_Compras', '', '40-Opel-Corsa-6666LLL'),
      ]
    )
    expect(d.plan).toEqual([])
  })

  it('duplicados y carpetas sin vehículo no generan plan', () => {
    const d = diffCarpetas(
      [v(40, '#1040', 'C', 'Opel', 'Corsa', '6666LLL')],
      [
        c('1_Ventas', '', '40-Opel-Corsa-6666LLL'),
        c('1_Ventas', '----VENDIDOS', 'Opel-Corsa-6666LLL'),
        c('3_Compras', '', '99-Nadie-Nada-1111BBB'),
      ]
    )
    expect(d.duplicados).toHaveLength(1)
    expect(d.sinVehiculo).toContain('3_Compras/99-Nadie-Nada-1111BBB')
    expect(d.plan).toEqual([])
  })
})

describe('checkCarpetasOneDrive: reparto de acciones', () => {
  const env = process.env
  const fetchMock = jest.fn()

  function fila(
    id: number,
    referencia: string,
    marca: string,
    modelo: string,
    matricula: string,
    estado = 'PUBLICADO'
  ) {
    return {
      id,
      referencia,
      tipo: 'C',
      estado,
      marca,
      modelo,
      matricula_norm: matricula,
      aliases: [],
    }
  }

  const FILAS = [
    fila(30, '#1030', 'Seat', 'Leon', '4444JJJ', 'VENDIDO'),
    fila(31, '#1031', 'Seat', 'Ibiza', '5555KKK', 'VENDIDO'),
    fila(32, '#1032', 'Seat', 'Arona', '3333HHH', 'VENDIDO'),
    fila(40, '#1040', 'Opel', 'Corsa', '6666LLL'),
    fila(50, '#1050', 'Kia', 'Rio', '7777NNN'),
  ]

  const CARPETAS = [
    c('1_Ventas', '', '30-Seat-Leon-4444JJJ'), // vendido fuera → mover
    c('3_Compras', '----VENDIDOS', '30-Seat-Leon-4444JJJ'),
    c('1_Ventas', '----VENDIDOS', '31-Seat-Ibiza-5555KKK'), // ya en su sitio
    c('3_Compras', '----VENDIDOS', '31-Seat-Ibiza-5555KKK'),
    c('1_Ventas', '', '32-Seat-Arona-3333HHH'), // vendido fuera → mover
    c('3_Compras', '----VENDIDOS', '32-Seat-Arona-3333HHH'),
    c('1_Ventas', '', '40-Opel-Korsa-6666LLL-Rojo'), // mismo contenedor → renombrar
    c('3_Compras', '', '40-Opel-Korsa-6666LLL-Rojo'),
    c('1_Ventas', '----VENDIDOS', '50-Kia-Rio-7777NNN'), // en stock dentro de VENDIDOS
    c('3_Compras', '', '50-Kia-Rio-7777NNN'),
  ]

  function respuesta(body: Record<string, unknown>, status = 200) {
    return { ok: status < 400, status, json: async () => body }
  }

  type Body = Record<string, string | undefined>

  function receptor(
    handler?: (b: Body) => Record<string, unknown> | undefined
  ) {
    fetchMock.mockImplementation(
      async (_url: string, init: { body: string }) => {
        const b = JSON.parse(init.body) as Body
        if (b.op === 'listar') {
          return respuesta({
            ok: true,
            accion: 'carpetas',
            dryRun: false,
            rutas: [],
            motivo: null,
            carpetas: CARPETAS,
          })
        }
        const custom = handler?.(b)
        if (custom) return respuesta(custom)
        return respuesta({
          ok: true,
          accion: b.op,
          dryRun: false,
          rutas: [],
          motivo: null,
          resultado: b.op === 'vendido' ? 'movido' : 'renombrado',
        })
      }
    )
  }

  const bodies = (): Body[] =>
    fetchMock.mock.calls.map((call) => JSON.parse(call[1].body) as Body)

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...env,
      ONEDRIVE_CARPETAS_ENABLED: '1',
      N8N_RENAME_WEBHOOK_URL: 'https://n8n.test/webhook/rename-expedientes',
      N8N_RENAME_WEBHOOK_SECRET: 's3cret',
    }
    global.fetch = fetchMock as unknown as typeof fetch
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('to_regclass'))
        return { rows: [{ reg: 'vehiculo_matriculas' }] }
      if (sql.includes('WHERE v.id = $1'))
        return { rows: FILAS.filter((f) => f.id === Number(params?.[0])) }
      if (sql.includes('FROM "Vehiculo" v')) return { rows: FILAS }
      return { rows: [] }
    })
    receptor()
  })
  afterAll(() => {
    process.env = env
  })

  it('sólo mueve los VENDIDOS que están fuera del contenedor de vendidos', async () => {
    const r = await checkCarpetasOneDrive({ dryRun: false })
    const vendidos = bodies().filter((b) => b.op === 'vendido')
    expect(vendidos.map((b) => b.nombre).sort()).toEqual([
      '30-Seat-Leon-4444JJJ',
      '32-Seat-Arona-3333HHH',
    ])
    expect(vendidos.some((b) => b.nombre === '31-Seat-Ibiza-5555KKK')).toBe(
      false
    )
    expect(r.movidas.map((m) => m.vehiculoId).sort()).toEqual([30, 32])
    expect(r.errores).toEqual([])
  })

  it('renombra sólo dentro del mismo contenedor y conserva los sufijos', async () => {
    const r = await checkCarpetasOneDrive({ dryRun: false })
    const ren = bodies().filter((b) => b.op === 'renombrar')
    expect(ren).toHaveLength(1)
    expect(ren[0]).toMatchObject({
      op: 'renombrar',
      de: '40-Opel-Korsa-6666LLL-Rojo',
      a: '40-Opel-Corsa-6666LLL-Rojo',
    })
    expect(r.renombradas).toEqual([
      {
        vehiculoId: 40,
        de: '40-Opel-Korsa-6666LLL-Rojo',
        a: '40-Opel-Corsa-6666LLL-Rojo',
        resultado: 'renombrado',
      },
    ])
  })

  it('jamás saca una carpeta de VENDIDOS', async () => {
    const r = await checkCarpetasOneDrive({ dryRun: false })
    expect(
      bodies().some((b) => b.op !== 'listar' && b.matricula === '7777NNN')
    ).toBe(false)
    expect(r.revisarUbicacion).toEqual([
      {
        vehiculoId: 50,
        actual: '1_Ventas/----VENDIDOS/50-Kia-Rio-7777NNN',
        esperado: '1_Ventas/50-Kia-Rio-7777NNN',
        motivo: 'la carpeta está en VENDIDOS y el CRM lo da en stock',
      },
    ])
  })

  it('tope por pasada: el resto queda en omitidas y pendientes', async () => {
    const r = await checkCarpetasOneDrive({ dryRun: false, maxMover: 1 })
    expect(r.movidas).toHaveLength(1)
    expect(r.pendientes.mover).toBe(1)
    const om = r.omitidas.filter((o) => o.accion === 'mover')
    expect(om).toHaveLength(1)
    expect(om[0].motivo).toBe('tope maxMover (1)')
  })

  it('presupuesto agotado: no ejecuta nada y lo deja pendiente', async () => {
    const r = await checkCarpetasOneDrive({ dryRun: false, presupuestoMs: 0 })
    expect(r.presupuestoAgotado).toBe(true)
    expect(r.movidas).toEqual([])
    expect(r.renombradas).toEqual([])
    expect(bodies().every((b) => b.op === 'listar')).toBe(true)
    expect(r.pendientes).toEqual({ crear: 0, mover: 2, renombrar: 1 })
    expect(r.omitidas.map((o) => o.motivo)).toEqual([
      'presupuesto agotado',
      'presupuesto agotado',
      'presupuesto agotado',
    ])
  })

  it('conflicto: va a omitidas, no a errores, y no se reintenta', async () => {
    receptor((b) =>
      b.op === 'vendido' && b.nombre === '30-Seat-Leon-4444JJJ'
        ? {
            ok: false,
            accion: 'vendido',
            dryRun: false,
            rutas: [],
            motivo: 'ya hay una carpeta con ese nombre en destino',
            resultado: 'conflicto',
          }
        : undefined
    )
    const r = await checkCarpetasOneDrive({ dryRun: false })
    expect(r.errores).toEqual([])
    expect(r.movidas.map((m) => m.vehiculoId)).toEqual([32])
    const om = r.omitidas.find((o) => o.vehiculoId === 30)
    expect(om).toMatchObject({ accion: 'mover' })
    expect(om!.motivo).toContain('conflicto')
    expect(
      bodies().filter((b) => b.nombre === '30-Seat-Leon-4444JJJ')
    ).toHaveLength(1)
  })

  it('dryRun: sólo lista y devuelve los recuentos pendientes', async () => {
    const r = await checkCarpetasOneDrive({ dryRun: true })
    expect(bodies().every((b) => b.op === 'listar')).toBe(true)
    expect(r.pendientes).toEqual({ crear: 0, mover: 2, renombrar: 1 })
    expect(r.revisarUbicacion).toHaveLength(1)
    expect(r.movidas).toEqual([])
    expect(r.renombradas).toEqual([])
  })
})

describe('diffCarpetas: sufijos del nombre real', () => {
  it('una carpeta canónica con sufijos en el contenedor correcto no es noCanonica', () => {
    const esperados = [
      v(14, '#1014', 'C', 'Hyundai', 'i10', '7793LPD', 'VENDIDO'),
    ]
    const carpetas = [
      c(
        '1_Ventas',
        '----VENDIDOS',
        '14-Hyundai-I10-7793LPD-Rojo-Inversor-Juan'
      ),
      c('3_Compras', '', '14-Hyundai-I10-7793LPD-Rojo-Inversor-Juan'),
    ]
    const d = diffCarpetas(esperados, carpetas)
    expect(d.noCanonicas).toEqual([
      {
        rel: '3_Compras/14-Hyundai-I10-7793LPD-Rojo-Inversor-Juan',
        esperado: '3_Compras/----VENDIDOS/14-Hyundai-I10-7793LPD',
        vehiculoId: 14,
      },
    ])
    expect(d.faltantes).toEqual([])
  })
})
