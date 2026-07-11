import { pickInvoiceNumber } from '@/lib/invoiceNumbering'

const pick = (startNumber: number, nextNumber: number, absMax: number) =>
  pickInvoiceNumber({ startNumber, nextNumber, absMax })

describe('pickInvoiceNumber — numeración fiscal monotónica', () => {
  it('usa el inicio de serie cuando todavía no hay facturas', () => {
    expect(pick(23, 23, 0)).toBe(23)
    expect(pick(4222, 4222, 0)).toBe(4222)
  })

  it('avanza desde el high-water mark persistido', () => {
    expect(pick(23, 26, 25)).toBe(26)
  })

  it('no reutiliza un hueco interior', () => {
    // Aunque 24 ya no exista, la secuencia quedó en 26.
    expect(pick(23, 26, 25)).toBe(26)
  })

  it('no reutiliza el último número si se borró su fila técnica', () => {
    // La fila 25 desapareció, pero next_number conserva 26.
    expect(pick(23, 26, 24)).toBe(26)
  })

  it('salta sobre una fila histórica superior a la secuencia', () => {
    expect(pick(4222, 4225, 4300)).toBe(4301)
  })

  it('nunca baja del inicio de la serie', () => {
    expect(pick(23, 1, 0)).toBe(23)
  })
})
