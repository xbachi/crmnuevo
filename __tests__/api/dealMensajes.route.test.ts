/**
 * @jest-environment node
 *
 * GET/POST /api/deals/[id]/mensajes — mensajes al cliente final.
 * pool, getDealById y sendMail mockeados; la sesión se mockea en auth-server
 * para ejercitar el requireApiSession real (401 sin sesión).
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
  getDealById: jest.fn(),
}))
jest.mock('@/lib/mailer', () => ({ sendMail: jest.fn() }))
jest.mock('@/lib/auth-server', () => ({ readSessionFromRequest: jest.fn() }))

import { NextRequest } from 'next/server'
import { pool, getDealById } from '@/lib/direct-database'
import { sendMail } from '@/lib/mailer'
import { readSessionFromRequest } from '@/lib/auth-server'
import { GET, POST } from '@/app/api/deals/[id]/mensajes/route'

const mockQuery = pool.query as jest.Mock
const mockGetDeal = getDealById as jest.Mock
const mockSendMail = sendMail as jest.Mock
const mockSession = readSessionFromRequest as jest.Mock

const params = Promise.resolve({ id: '7' })

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/deals/7/mensajes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function getRequest() {
  return new NextRequest('http://localhost/api/deals/7/mensajes')
}

const dealBase = {
  id: 7,
  estado: 'reservado',
  cliente: {
    id: 3,
    nombre: 'Marta',
    apellidos: 'Pérez',
    email: 'marta@example.com',
    telefono: '600 12 34 56',
  },
  vehiculo: { id: 9, marca: 'Mazda', modelo: '6', matricula: '3593HXM' },
  importeTotal: 18500,
  importeSena: 1000,
  restoAPagar: 17500,
  fechaReservaExpira: new Date('2026-09-15T10:00:00Z'),
  documentacionRecibida: false,
  documentacionRetirada: false,
}

const filaInsertada = {
  id: 1,
  deal_id: 7,
  plantilla: 'reserva_confirmada',
  canal: 'email',
  destinatario: 'marta@example.com',
  asunto: 'x',
  cuerpo: 'y',
  enviado_por: 'Seba',
  created_at: '2026-09-04T10:00:00.000Z',
}

/** tablaExiste → users → insert */
function mockTablaUsuarioInsert(fila = filaInsertada) {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ reg: 'deal_mensajes' }] })
    .mockResolvedValueOnce({ rows: [{ display_name: 'Seba', email: null }] })
    .mockResolvedValueOnce({ rows: [fila] })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue({ uid: 1, role: 'asesor', exp: 0 })
  mockSendMail.mockResolvedValue({ sent: true })
})

describe('POST /api/deals/[id]/mensajes', () => {
  it('sin sesión → 401 y no toca nada', async () => {
    mockSession.mockReturnValue(null)
    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'email' }),
      { params }
    )
    expect(res.status).toBe(401)
    expect(mockGetDeal).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('cliente sin email → 400 y no envía', async () => {
    mockGetDeal.mockResolvedValue({
      ...dealBase,
      cliente: { ...dealBase.cliente, email: null },
    })
    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'email' }),
      { params }
    )
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/no tiene email/)
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('plantilla que no aplica sin texto explícito → 400', async () => {
    mockGetDeal.mockResolvedValue({ ...dealBase, estado: 'nuevo' })
    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'email' }),
      { params }
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no aplica/)
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('plantilla desconocida o sin plantilla ni texto → 400', async () => {
    let res = await POST(postRequest({ plantillaId: 'x', canal: 'email' }), {
      params,
    })
    expect(res.status).toBe(400)
    res = await POST(postRequest({ canal: 'email' }), { params })
    expect(res.status).toBe(400)
    res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'sms' }),
      { params }
    )
    expect(res.status).toBe(400)
    expect(mockGetDeal).not.toHaveBeenCalled()
  })

  it('envío OK: renderiza la plantilla, llama a sendMail y registra', async () => {
    mockGetDeal.mockResolvedValue(dealBase)
    mockTablaUsuarioInsert()

    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'email' }),
      { params }
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.mensaje).toEqual(filaInsertada)

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.to).toBe('marta@example.com')
    expect(mail.subject).toBe(
      'Reserva confirmada de tu Mazda 6 (3593HXM) — Sevencars'
    )
    expect(mail.text).toContain('Hola Marta,')
    expect(mail.text).toContain('15/09/2026')
    expect(mail.html).toContain('<p>Hola Marta,</p>')

    const [sql, values] = mockQuery.mock.calls[2]
    expect(sql).toContain('INSERT INTO deal_mensajes')
    expect(values.slice(0, 5)).toEqual([
      7,
      'reserva_confirmada',
      'email',
      'marta@example.com',
      mail.subject,
    ])
    expect(values[5]).toBe(mail.text)
    expect(values[6]).toBe('Seba')
  })

  it('texto editado: respeta asunto y texto del usuario aunque la plantilla no aplique', async () => {
    mockGetDeal.mockResolvedValue({ ...dealBase, estado: 'nuevo' })
    mockTablaUsuarioInsert()

    const res = await POST(
      postRequest({
        plantillaId: 'coche_listo',
        canal: 'email',
        asunto: 'Asunto propio',
        texto: 'Hola Marta, texto editado.',
      }),
      { params }
    )
    expect(res.status).toBe(201)
    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.subject).toBe('Asunto propio')
    expect(mail.text).toBe('Hola Marta, texto editado.')
  })

  it('SMTP falla → 502 y no registra', async () => {
    mockGetDeal.mockResolvedValue(dealBase)
    mockQuery.mockResolvedValueOnce({ rows: [{ reg: 'deal_mensajes' }] })
    mockSendMail.mockResolvedValue({
      sent: false,
      reason: 'SMTP_PASS no configurada',
    })

    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'email' }),
      { params }
    )
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/SMTP_PASS/)
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it('sin tabla deal_mensajes → 503 antes de enviar', async () => {
    mockGetDeal.mockResolvedValue(dealBase)
    mockQuery.mockResolvedValueOnce({ rows: [{ reg: null }] })

    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'email' }),
      { params }
    )
    expect(res.status).toBe(503)
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('whatsapp: solo registra, con el teléfono normalizado, sin sendMail', async () => {
    mockGetDeal.mockResolvedValue(dealBase)
    mockTablaUsuarioInsert({
      ...filaInsertada,
      canal: 'whatsapp',
      destinatario: '+34600123456',
    })

    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'whatsapp' }),
      { params }
    )
    expect(res.status).toBe(201)
    expect(mockSendMail).not.toHaveBeenCalled()
    const [, values] = mockQuery.mock.calls[2]
    expect(values[2]).toBe('whatsapp')
    expect(values[3]).toBe('+34600123456')
  })

  it('whatsapp con teléfono inválido → 400', async () => {
    mockGetDeal.mockResolvedValue({
      ...dealBase,
      cliente: { ...dealBase.cliente, telefono: '12' },
    })
    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'whatsapp' }),
      { params }
    )
    expect(res.status).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('deal inexistente → 404', async () => {
    mockGetDeal.mockResolvedValue(null)
    const res = await POST(
      postRequest({ plantillaId: 'reserva_confirmada', canal: 'email' }),
      { params }
    )
    expect(res.status).toBe(404)
  })
})

describe('GET /api/deals/[id]/mensajes', () => {
  it('sin sesión → 401', async () => {
    mockSession.mockReturnValue(null)
    const res = await GET(getRequest(), { params })
    expect(res.status).toBe(401)
  })

  it('devuelve el historial del deal', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: 'deal_mensajes' }] })
      .mockResolvedValueOnce({ rows: [filaInsertada] })
    const res = await GET(getRequest(), { params })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.mensajes).toEqual([filaInsertada])
    const [sql, values] = mockQuery.mock.calls[1]
    expect(sql).toContain('FROM deal_mensajes')
    expect(values).toEqual([7])
  })

  it('sin tabla → 503', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ reg: null }] })
    const res = await GET(getRequest(), { params })
    expect(res.status).toBe(503)
  })
})
