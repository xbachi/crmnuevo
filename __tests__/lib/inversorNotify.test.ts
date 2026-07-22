// Mock de pg/mailer para importar buildInversorEmail sin abrir conexiones.
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/mailer', () => ({ sendMail: jest.fn() }))

import { buildInversorEmail } from '@/lib/inversorNotify'

describe('buildInversorEmail', () => {
  const base = {
    inversorNombre: 'Juan Radio',
    marca: 'Mazda',
    modelo: '6',
    matricula: '3593HXM',
    referencia: 'I-#1055',
    fecha: '22/07/2026',
  }

  it('arma el aviso de venta con los datos del coche', () => {
    const m = buildInversorEmail({ ...base, evento: 'vendido' })
    expect(m.subject).toBe('SevenCars — tu Mazda 6 se ha vendido')
    expect(m.html).toContain('Hola Juan Radio')
    expect(m.html).toContain('3593HXM')
    expect(m.html).toContain('I-#1055')
    expect(m.html).toContain('beneficio')
    expect(m.text).toContain('Tu vehículo Mazda 6 se ha vendido.')
  })

  it('arma el aviso de reserva sin mencionar beneficio', () => {
    const m = buildInversorEmail({ ...base, evento: 'reservado' })
    expect(m.subject).toBe('SevenCars — tu Mazda 6 se ha reservado')
    expect(m.html).toContain('cuando la venta se complete')
    expect(m.html).not.toContain('beneficio')
  })

  it('tolera matrícula ausente', () => {
    const m = buildInversorEmail({ ...base, matricula: null, evento: 'vendido' })
    expect(m.html).toContain('—')
  })
})
