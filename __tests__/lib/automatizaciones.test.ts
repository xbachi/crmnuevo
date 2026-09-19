/**
 * @jest-environment node
 *
 * Cola de automatizaciones: validadores puros, intervalo de sondeo, recorte
 * de salida y el SQL de encolar/reclamar (pg mockeado).
 */
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { pool } from '@/lib/direct-database'
import {
  SALIDA_MAX_BYTES,
  admiteAutomatizaciones,
  encolar,
  limpiarVencidos,
  motivoSimulacionInvalida,
  proximoIntervalo,
  reclamar,
  recortarSalida,
  validarPedido,
  validarReclamo,
  validarResultado,
  type SimulacionLeida,
} from '@/lib/automatizaciones'

const mockQuery = pool.query as unknown as jest.Mock

beforeEach(() => mockQuery.mockReset())

describe('validarPedido', () => {
  it('acepta simular y descarta simulacion_id fuera de aplicar', () => {
    expect(
      validarPedido({
        tipo: 'cambio_precio',
        modo: 'simular',
        simulacion_id: 4,
      })
    ).toEqual({
      ok: true,
      pedido: { tipo: 'cambio_precio', modo: 'simular', simulacion_id: null },
    })
  })

  it('aplicar un tipo con simulación conserva simulacion_id (número o texto)', () => {
    expect(
      validarPedido({
        tipo: 'cambio_fotos',
        modo: 'aplicar',
        simulacion_id: '12',
      })
    ).toEqual({
      ok: true,
      pedido: { tipo: 'cambio_fotos', modo: 'aplicar', simulacion_id: 12 },
    })
    // Sin simulacion_id es sintácticamente válido: el 409 lo decide la ruta.
    expect(
      validarPedido({ tipo: 'publicar_borrador', modo: 'aplicar' })
    ).toEqual({
      ok: true,
      pedido: {
        tipo: 'publicar_borrador',
        modo: 'aplicar',
        simulacion_id: null,
      },
    })
  })

  it('bajar_ficha y carteles no usan simulación', () => {
    const r = validarPedido({
      tipo: 'carteles',
      modo: 'aplicar',
      simulacion_id: 3,
    })
    expect(r).toEqual({
      ok: true,
      pedido: { tipo: 'carteles', modo: 'aplicar', simulacion_id: null },
    })
  })

  it('rechaza tipo, modo, simulacion_id y body inválidos', () => {
    expect(validarPedido(null)).toMatchObject({ ok: false })
    expect(validarPedido([])).toMatchObject({ ok: false })
    expect(validarPedido({ tipo: 'borrar', modo: 'simular' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('tipo'),
    })
    expect(validarPedido({ tipo: 'carteles', modo: 'forzar' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('modo'),
    })
    for (const s of [0, -1, 1.5, 'abc', true]) {
      expect(
        validarPedido({
          tipo: 'cambio_precio',
          modo: 'aplicar',
          simulacion_id: s,
        })
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining('simulacion_id'),
      })
    }
  })
})

describe('motivoSimulacionInvalida', () => {
  const sim = (p: Partial<SimulacionLeida> = {}): SimulacionLeida => ({
    id: 5,
    vehiculo_id: 7,
    tipo: 'cambio_precio',
    modo: 'simular',
    estado: 'ok',
    terminado_hace_s: 60,
    usada: false,
    ...p,
  })
  const esperado = { vehiculoId: 7, tipo: 'cambio_precio' as const }

  it('null si sirve', () => {
    expect(motivoSimulacionInvalida(sim(), esperado)).toBeNull()
  })

  it('explica cada motivo', () => {
    expect(motivoSimulacionInvalida(null, esperado)).toBe('no existe')
    expect(motivoSimulacionInvalida(sim({ vehiculo_id: 8 }), esperado)).toMatch(
      /otro coche/
    )
    expect(
      motivoSimulacionInvalida(sim({ tipo: 'cambio_fotos' }), esperado)
    ).toMatch(/otra acción/)
    expect(
      motivoSimulacionInvalida(sim({ modo: 'aplicar' }), esperado)
    ).toMatch(/no es una simulación/)
    expect(
      motivoSimulacionInvalida(sim({ estado: 'en_curso' }), esperado)
    ).toMatch(/no terminó/)
    expect(
      motivoSimulacionInvalida(sim({ estado: 'error' }), esperado)
    ).toMatch(/error/)
    expect(
      motivoSimulacionInvalida(sim({ terminado_hace_s: 30 * 60 }), esperado)
    ).toMatch(/30 minutos/)
    expect(
      motivoSimulacionInvalida(sim({ terminado_hace_s: null }), esperado)
    ).toMatch(/30 minutos/)
    expect(motivoSimulacionInvalida(sim({ usada: true }), esperado)).toMatch(
      /ya se aplicó/
    )
  })
})

describe('proximoIntervalo', () => {
  it('10 s con pendientes o actividad < 15 min; si no 45 s', () => {
    expect(proximoIntervalo(1, null)).toBe(10)
    expect(proximoIntervalo(0, 60)).toBe(10)
    expect(proximoIntervalo(0, 15 * 60 - 1)).toBe(10)
    expect(proximoIntervalo(0, 15 * 60)).toBe(45)
    expect(proximoIntervalo(0, null)).toBe(45)
  })
})

describe('recortarSalida', () => {
  it('deja pasar lo corto y quita NUL', () => {
    expect(recortarSalida(null)).toBeNull()
    expect(recortarSalida('hola\u0000 mundo')).toBe('hola mundo')
  })

  it('se queda con los últimos 100 KB', () => {
    const largo = 'a'.repeat(SALIDA_MAX_BYTES) + 'FIN'
    const r = recortarSalida(largo)!
    expect(Buffer.byteLength(r)).toBeLessThanOrEqual(SALIDA_MAX_BYTES)
    expect(r.startsWith('[… recortado]')).toBe(true)
    expect(r.endsWith('FIN')).toBe(true)
  })

  it('no deja un carácter multibyte partido al principio', () => {
    const r = recortarSalida('ñ'.repeat(SALIDA_MAX_BYTES))!
    expect(Buffer.byteLength(r)).toBeLessThanOrEqual(SALIDA_MAX_BYTES)
    expect(r).not.toContain('\uFFFD')
  })
})

describe('validarReclamo / validarResultado', () => {
  it('reclamo exige worker', () => {
    expect(validarReclamo({ version: '1' })).toMatchObject({ ok: false })
    expect(
      validarReclamo({ worker: ' pc-seb ', version: 'v2', solo_latido: true })
    ).toEqual({
      ok: true,
      reclamo: { worker: 'pc-seb', version: 'v2', solo_latido: true },
    })
    expect(validarReclamo({ worker: 'pc', solo_latido: 'si' })).toEqual({
      ok: true,
      reclamo: { worker: 'pc', version: null, solo_latido: false },
    })
  })

  it('resultado: id y rc enteros; url sólo http(s); para_verificar a texto', () => {
    expect(validarResultado({ rc: 0 })).toMatchObject({ ok: false })
    expect(validarResultado({ id: 3, rc: '0' })).toMatchObject({ ok: false })
    const r = validarResultado({
      id: 3,
      worker: 'pc-seb',
      rc: 2,
      salida: 'x',
      para_verificar: ['  revisar km ', '', 42],
      url: 'javascript:alert(1)',
    })
    expect(r).toEqual({
      ok: true,
      resultado: {
        id: 3,
        worker: 'pc-seb',
        rc: 2,
        salida: 'x',
        para_verificar: ['revisar km', '42'],
        url: null,
      },
    })
    const ok = validarResultado({
      id: 3,
      rc: 0,
      url: 'https://sevencars.es/?p=1',
    })
    expect(ok.ok && ok.resultado.url).toBe('https://sevencars.es/?p=1')
  })
})

describe('admiteAutomatizaciones', () => {
  it('sólo tipos que van a Base_Datos (C, I, D)', () => {
    expect(admiteAutomatizaciones('C')).toBe(true)
    expect(admiteAutomatizaciones('I')).toBe(true)
    expect(admiteAutomatizaciones('Deposito Venta')).toBe(true)
    expect(admiteAutomatizaciones('R')).toBe(false)
    expect(admiteAutomatizaciones('M')).toBe(false)
    expect(admiteAutomatizaciones(null)).toBe(false)
  })
})

describe('encolar', () => {
  const nuevo = {
    vehiculoId: 7,
    referencia: '#1088',
    matricula: '6913MDM',
    tipo: 'cambio_precio' as const,
    modo: 'simular' as const,
    simulacionId: null,
    creadoPor: 1,
  }

  it('limpia vencidos del coche e inserta con caducidad de 15 min', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ caducados: 0, interrumpidos: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 12,
            vehiculo_id: 7,
            tipo: 'cambio_precio',
            modo: 'simular',
            estado: 'pendiente',
            created_at: new Date('2026-09-19T10:00:00Z'),
            expira_at: new Date('2026-09-19T10:15:00Z'),
          },
        ],
      })
    const r = await encolar(nuevo)
    expect(r).toMatchObject({
      ok: true,
      trabajo: {
        id: 12,
        estado: 'pendiente',
        created_at: '2026-09-19T10:00:00.000Z',
        started_at: null,
      },
    })
    expect(String(mockQuery.mock.calls[0][0])).toContain("'caducado'")
    expect(mockQuery.mock.calls[0][1][0]).toBe(7)
    const [sql, params] = mockQuery.mock.calls[1]
    expect(sql).toContain('INSERT INTO automatizacion_trabajos')
    expect(params).toEqual([
      7,
      '#1088',
      '6913MDM',
      'cambio_precio',
      'simular',
      null,
      1,
      15,
    ])
  })

  it('violación del índice único parcial → duplicado', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    expect(await encolar(nuevo)).toEqual({ ok: false, duplicado: true })
  })

  it('otros errores se propagan', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('boom'))
    await expect(encolar(nuevo)).rejects.toThrow('boom')
  })
})

describe('limpiarVencidos', () => {
  it('caduca pendientes vencidos e interrumpe en_curso sin latido (30 min) o con tope de 60 min', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    await limpiarVencidos(7)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain("SET estado = 'caducado'")
    expect(sql).toContain('expira_at <= NOW()')
    expect(sql).toContain("SET estado = 'error'")
    // Latido de la PC que tiene el trabajo: sólo se interrumpe si calló.
    expect(sql).toContain('FROM automatizacion_workers w')
    expect(sql).toContain('w.nombre = t.worker')
    expect(sql).toMatch(
      /started_at < NOW\(\) - make_interval\(mins => \$4::int\)\s+OR/
    )
    expect(params).toEqual([
      7,
      expect.stringMatching(/^interrumpido/),
      30,
      60,
      5,
    ])
  })

  it('sin vehículo recorre toda la cola', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    await limpiarVencidos()
    expect(mockQuery.mock.calls[0][1][0]).toBeNull()
  })
})

describe('reclamar', () => {
  it('limpia la cola entera y reclama uno con SKIP LOCKED respetando el outbox de hojas', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        {
          id: 12,
          tipo: 'cambio_precio',
          modo: 'simular',
          referencia: '#1033',
          matricula: '6913MDM',
          vehiculo_id: 345,
        },
      ],
    })
    expect(await reclamar('pc-seb')).toEqual({
      id: 12,
      tipo: 'cambio_precio',
      modo: 'simular',
      referencia: '#1033',
      matricula: '6913MDM',
      vehiculo_id: 345,
    })
    expect(mockQuery.mock.calls[0][1][0]).toBeNull()
    const [sql, params] = mockQuery.mock.calls[1]
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('ORDER BY c.id')
    expect(sql).toContain('webhook_outbox')
    expect(sql).toContain("e.estado = 'en_curso'")
    expect(params).toEqual(['pc-seb', 'sheets_vehiculo'])
  })

  it('null si no hay nada para tomar', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    expect(await reclamar('pc-seb')).toBeNull()
  })
})
