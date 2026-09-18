import { contactosDe, textoReaviso } from '@/lib/presupuesto/contactos'
import type { FilaContacto } from '@/lib/presupuesto/contactos'

const fila = (o: Partial<FilaContacto>): FilaContacto => ({
  id: 1,
  numero: 'P-2026-0001',
  nombre_cliente: 'Marta',
  telefono: null,
  email: null,
  estado: 'enviado',
  valido_hasta: '2026-09-21',
  created_at: '2026-09-14T10:00:00.000Z',
  ...o,
})

describe('contactosDe', () => {
  it('agrupa por teléfono normalizado aunque cambie el formato o el nombre', () => {
    const c = contactosDe([
      fila({
        id: 3,
        numero: 'P-2026-0003',
        telefono: '+34 600 12 34 56',
        nombre_cliente: 'Marta G.',
      }),
      fila({
        id: 2,
        numero: 'P-2026-0002',
        telefono: '600123456',
        email: 'm@x.es',
      }),
      fila({
        id: 1,
        numero: 'P-2026-0001',
        telefono: '611 000 000',
        nombre_cliente: 'Pedro',
      }),
    ])
    expect(c).toHaveLength(2)
    expect(c[0].nombre).toBe('Marta G.')
    expect(c[0].telefono).toBe('+34 600 12 34 56')
    expect(c[0].email).toBe('m@x.es')
    expect(c[0].presupuestos.map((p) => p.numero)).toEqual([
      'P-2026-0003',
      'P-2026-0002',
    ])
    expect(c[1].nombre).toBe('Pedro')
  })

  it('sin teléfono agrupa por email y, si no, por nombre', () => {
    const c = contactosDe([
      fila({ id: 1, email: 'Ana@X.es', nombre_cliente: 'Ana' }),
      fila({ id: 2, email: 'ana@x.es', nombre_cliente: 'Ana López' }),
      fila({ id: 3, nombre_cliente: 'Luis' }),
      fila({ id: 4, nombre_cliente: ' luis ' }),
    ])
    expect(c.map((x) => x.clave)).toEqual(['mail:ana@x.es', 'nombre:luis'])
    expect(c[1].presupuestos).toHaveLength(2)
  })

  it('lista vacía → sin contactos', () => {
    expect(contactosDe([])).toEqual([])
  })
})

describe('textoReaviso', () => {
  it('nombra al cliente y al coche con matrícula', () => {
    expect(
      textoReaviso('Marta', {
        marca: 'Tesla',
        modelo: 'Model 3',
        matricula: '1234ABC',
      })
    ).toBe(
      'Hola Marta, te escribimos de Sevencars por el Tesla Model 3 (1234ABC) que te presupuestamos. Tenemos novedades de precio, ¿te interesa que te lo volvamos a pasar?'
    )
  })
  it('sin matrícula no deja paréntesis vacío', () => {
    expect(
      textoReaviso('Ana', { marca: 'Seat', modelo: 'Ibiza', matricula: '' })
    ).toContain('por el Seat Ibiza que')
  })
})
