/**
 * @jest-environment node
 *
 * Sync de estado CRM → web (sevencars.es).
 *
 * Lo que se protege acá:
 *  - estadoWeb() habla los DOS vocabularios que conviven en prod (MAYÚSCULAS
 *    del kanban y minúsculas del flujo de deals) y solo deja pasar los tres
 *    estados que la web entiende.
 *  - La firma HMAC: el mensaje firmado es EXACTAMENTE `${ts}.${cuerpo}` y el
 *    cuerpo firmado es byte a byte el que se manda. Si el cuerpo se serializa
 *    dos veces, la web rechaza con 401 y el fallo es invisible desde el CRM.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import crypto from 'crypto'
import { pool } from '@/lib/direct-database'
import {
  estadoWeb,
  firmaWebSync,
  postWebEstado,
  notifyWebVehiculoEstado,
  type WebEstadoPayload,
} from '@/lib/webSync'

const mockQuery = pool.query as jest.Mock
const mockFetch = global.fetch as jest.Mock

const URL_WEB = 'https://www.sevencars.es/wp-json/sevencars/v1/vehiculo/estado'
const SECRETO = 'secreto-de-test'

const payload: WebEstadoPayload = {
  matricula: '3429LHT',
  matriculas: ['3429LHT', '5732BDR'],
  estado: 'reservado',
  ts: 1757800000,
}

describe('estadoWeb()', () => {
  it('mapea los tres estados que la web entiende, en MAYÚSCULAS del kanban', () => {
    expect(estadoWeb('RESERVADO')).toBe('reservado')
    expect(estadoWeb('VENDIDO')).toBe('vendido')
    expect(estadoWeb('PUBLICADO')).toBe('disponible')
    expect(estadoWeb('DISPONIBLE')).toBe('disponible')
  })

  it('mapea igual las minúsculas del flujo de deals', () => {
    expect(estadoWeb('reservado')).toBe('reservado')
    expect(estadoWeb('vendido')).toBe('vendido')
    expect(estadoWeb('publicado')).toBe('disponible')
    expect(estadoWeb('disponible')).toBe('disponible')
  })

  it('acepta los aliases históricos que la UI todavía manda', () => {
    expect(estadoWeb('ACTIVO')).toBe('disponible')
    expect(estadoWeb('EN_STOCK')).toBe('disponible')
  })

  it('devuelve null para todo lo demás (de eso no se avisa)', () => {
    for (const e of [
      'SIN_ESTADO',
      'INICIAL',
      'REVI_INIC',
      'MECAUTO',
      'PINTURA',
      'LIMPIEZA',
      'FOTOS',
      'facturado',
      'cualquier-basura',
      '',
      null,
      undefined,
    ]) {
      expect(estadoWeb(e)).toBeNull()
    }
  })
})

describe('firma HMAC del aviso a la web', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.SEVEN_WEB_SYNC_URL = URL_WEB
    process.env.SEVEN_WEB_SYNC_SECRET = SECRETO
  })

  afterEach(() => {
    delete process.env.SEVEN_WEB_SYNC_URL
    delete process.env.SEVEN_WEB_SYNC_SECRET
  })

  it('firma exactamente `${ts}.${cuerpo}` con el cuerpo que se envía', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    const res = await postWebEstado(payload)
    expect(res.ok).toBe(true)

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(URL_WEB)

    const cuerpoEnviado = init.body as string
    const tsCabecera = init.headers['X-Seven-Timestamp'] as string
    const firmaEnviada = init.headers['X-Seven-Signature'] as string

    // El mensaje firmado es ts + '.' + el cuerpo CRUDO tal cual viaja.
    const esperada = crypto
      .createHmac('sha256', SECRETO)
      .update(`${tsCabecera}.${cuerpoEnviado}`)
      .digest('hex')
    expect(firmaEnviada).toBe(`sha256=${esperada}`)

    // Y el cuerpo firmado es byte a byte el que se manda (no una segunda
    // serialización que podría diferir).
    expect(cuerpoEnviado).toBe(JSON.stringify(payload))
    expect(JSON.parse(cuerpoEnviado)).toEqual(payload)

    // El ts del CUERPO es el del cambio de estado, no se re-sella.
    expect(JSON.parse(cuerpoEnviado).ts).toBe(payload.ts)
    // El de la CABECERA es el del envío (ventana de validez del receptor).
    expect(Number(tsCabecera)).toBeGreaterThan(payload.ts)
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('firmaWebSync es HMAC-SHA256 hex sobre `${ts}.${cuerpo}`', () => {
    const cuerpo = JSON.stringify(payload)
    expect(firmaWebSync(1757800000, cuerpo, SECRETO)).toBe(
      crypto
        .createHmac('sha256', SECRETO)
        .update(`1757800000.${cuerpo}`)
        .digest('hex')
    )
  })

  it('no manda nada si falta una de las dos variables de entorno', async () => {
    delete process.env.SEVEN_WEB_SYNC_SECRET
    const res = await postWebEstado(payload)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/no configuradas/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('notifyWebVehiculoEstado() — outbox', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.SEVEN_WEB_SYNC_URL = URL_WEB
    process.env.SEVEN_WEB_SYNC_SECRET = SECRETO
  })

  afterEach(() => {
    delete process.env.SEVEN_WEB_SYNC_URL
    delete process.env.SEVEN_WEB_SYNC_SECRET
  })

  it('es no-op silencioso sin configuración, sin tocar la DB', async () => {
    delete process.env.SEVEN_WEB_SYNC_URL
    const res = await notifyWebVehiculoEstado(1, 'RESERVADO', '3429LHT')
    expect(res).toEqual({
      sent: false,
      reason: 'SEVEN_WEB_SYNC_URL/SECRET no configuradas',
    })
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('no avisa de estados que la web no entiende', async () => {
    const res = await notifyWebVehiculoEstado(1, 'LIMPIEZA', '3429LHT')
    expect(res).toEqual({ sent: false, reason: 'estado no sincronizable' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('no avisa si el vehículo no tiene matrícula', async () => {
    const res = await notifyWebVehiculoEstado(1, 'VENDIDO', null)
    expect(res).toEqual({ sent: false, reason: 'vehículo sin matrícula' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('inserta pendiente, manda alias y marca enviado', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: 'vehiculo_matriculas' }] }) // existeTabla
      .mockResolvedValueOnce({
        rows: [
          { matricula_norm: '3429LHT', vehiculo_id: 7 },
          { matricula_norm: '5732BDR', vehiculo_id: 7 },
        ],
      }) // aliasDeMatricula
      .mockResolvedValueOnce({ rows: [{ id: 91 }] }) // insertOutboxPending
      .mockResolvedValueOnce({ rows: [] }) // markOutboxEnviado
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    const res = await notifyWebVehiculoEstado(7, 'reservado', '3429 LHT')
    expect(res).toEqual({ sent: true })

    const insert = mockQuery.mock.calls[2]
    expect(insert[0]).toMatch(/INSERT INTO webhook_outbox/)
    expect(insert[1][0]).toBe('web_estado')
    expect(insert[1][2]).toBe('3429LHT')

    const enviado = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(enviado.matricula).toBe('3429LHT')
    expect(enviado.matriculas).toEqual(['3429LHT', '5732BDR'])
    expect(enviado.estado).toBe('reservado')

    expect(mockQuery.mock.calls[3][0]).toMatch(/estado = 'enviado'/)
    expect(mockQuery.mock.calls[3][1]).toEqual([91])
  })

  it('agota los intentos de golpe ante un 404 (no es transitorio)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: null }] }) // sin tabla de alias
      .mockResolvedValueOnce({ rows: [{ id: 92 }] })
      .mockResolvedValueOnce({ rows: [] })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const res = await notifyWebVehiculoEstado(7, 'VENDIDO', '3429LHT')
    expect(res.sent).toBe(false)
    expect(mockQuery.mock.calls[2][0]).toMatch(/estado = 'agotado'/)
    expect(mockQuery.mock.calls[2][0]).toMatch(/GREATEST\(intentos \+ 1, max_intentos\)/)
  })

  it('agota los intentos ante un 409 (matrícula ambigua, no se arregla sola)', async () => {
    // Un 409 no puede ser "petición repetida": cada envío sella un ts nuevo en
    // la cabecera, así que la firma cambia y el número de serie del receptor
    // nunca coincide. Solo queda la otra causa, la matrícula duplicada, que
    // exige mano humana.
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 94 }] })
      .mockResolvedValueOnce({ rows: [] })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409 })

    await notifyWebVehiculoEstado(7, 'RESERVADO', '3429LHT')
    expect(mockQuery.mock.calls[2][0]).toMatch(/estado = 'agotado'/)
  })

  it('deja la fila pendiente ante un 500 (lo recoge el reintento)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 93 }] })
      .mockResolvedValueOnce({ rows: [] })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await notifyWebVehiculoEstado(7, 'DISPONIBLE', '3429LHT')
    expect(mockQuery.mock.calls[2][0]).toMatch(/intentos = intentos \+ 1/)
    expect(mockQuery.mock.calls[2][1]).toEqual([93, 'web sync returned 500'])
  })

  it('lee la matrícula de la DB si el llamante no la pasa', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ matricula: '5732BDR' }] }) // lookup
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 94 }] })
      .mockResolvedValueOnce({ rows: [] })
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    const res = await notifyWebVehiculoEstado(7, 'vendido')
    expect(res).toEqual({ sent: true })
    expect(mockQuery.mock.calls[0][0]).toMatch(/SELECT matricula FROM "Vehiculo"/)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string).matricula).toBe(
      '5732BDR'
    )
  })
})
