import {
  ctxDesdeDeal,
  enlaceWhatsApp,
  normalizarTelefono,
  PLANTILLA_IDS,
  PLANTILLAS,
  plantillasQueAplican,
  renderPlantilla,
  type PlantillaCtx,
} from '@/lib/plantillasMensajes'

const ctx: PlantillaCtx = {
  nombreCliente: 'Marta',
  vehiculo: 'Mazda 6 (3593HXM)',
  importeTotal: 18500,
  importeSena: 1000,
  restoAPagar: 17500,
  fechaReservaExpira: '15/09/2026',
  empresa: 'Sevencars',
  telefonoEmpresa: '600 000 000',
}

describe('PLANTILLAS.cuandoAplica', () => {
  const ids = (deal: Parameters<typeof plantillasQueAplican>[0]) =>
    plantillasQueAplican(deal).map((p) => p.id)

  it('reserva_confirmada solo en reservado', () => {
    expect(ids({ estado: 'reservado' })).toEqual(['reserva_confirmada'])
    expect(ids({ estado: 'RESERVADO' })).toEqual(['reserva_confirmada'])
    expect(ids({ estado: 'nuevo' })).toEqual([])
  })

  it('documentacion_cambio_nombre en facturado sin documentación recibida', () => {
    expect(ids({ estado: 'facturado', documentacionRecibida: false })).toEqual([
      'documentacion_cambio_nombre',
    ])
    expect(
      PLANTILLAS.documentacion_cambio_nombre.cuandoAplica({
        estado: 'vendido',
        documentacionRecibida: false,
      })
    ).toBe(false)
  })

  it('coche_listo en facturado con documentación recibida y no retirada', () => {
    expect(
      ids({
        estado: 'facturado',
        documentacionRecibida: true,
        documentacionRetirada: false,
      })
    ).toEqual(['coche_listo'])
    expect(
      ids({
        estado: 'facturado',
        documentacionRecibida: true,
        documentacionRetirada: true,
      })
    ).toEqual([])
  })

  it('recordatorio_pago en vendido/facturado con resto pendiente', () => {
    expect(ids({ estado: 'vendido', restoAPagar: 500 })).toEqual([
      'recordatorio_pago',
    ])
    expect(ids({ estado: 'vendido', restoAPagar: '250.5' })).toEqual([
      'recordatorio_pago',
    ])
    expect(ids({ estado: 'vendido', restoAPagar: 0 })).toEqual([])
    expect(ids({ estado: 'reservado', restoAPagar: 500 })).toEqual([
      'reserva_confirmada',
    ])
    expect(
      ids({
        estado: 'facturado',
        documentacionRecibida: false,
        restoAPagar: 900,
      })
    ).toEqual(['documentacion_cambio_nombre', 'recordatorio_pago'])
  })
})

describe('renderPlantilla', () => {
  it('interpola cliente, vehículo, importes y fecha en la reserva', () => {
    const r = renderPlantilla('reserva_confirmada', ctx)
    expect(r.asunto).toBe(
      'Reserva confirmada de tu Mazda 6 (3593HXM) — Sevencars'
    )
    expect(r.texto).toContain('Hola Marta,')
    expect(r.texto).toContain('Mazda 6 (3593HXM)')
    expect(r.texto).toContain('1.000,00')
    expect(r.texto).toContain('18.500,00')
    expect(r.texto).toContain('17.500,00')
    expect(r.texto).toContain('hasta el 15/09/2026')
    expect(r.texto).toContain('600 000 000')
    expect(r.texto).toContain('El equipo de Sevencars')
  })

  it('genera html con párrafos simples y escapa caracteres', () => {
    const r = renderPlantilla('documentacion_cambio_nombre', {
      ...ctx,
      vehiculo: 'Seat <León>',
    })
    expect(r.html).toContain('<p>Hola Marta,</p>')
    expect(r.html).toContain('Seat &lt;León&gt;')
    expect(r.html).toContain('DNI o NIE en vigor')
    expect(r.html).toContain('<br/>')
    expect(r.html).not.toContain('<script')
  })

  it('coche_listo lleva el placeholder de dirección', () => {
    const r = renderPlantilla('coche_listo', ctx)
    expect(r.asunto).toBe('Tu Mazda 6 (3593HXM) ya está listo para recoger')
    expect(r.texto).toContain('{direccion}')
  })

  it('recordatorio_pago indica el importe pendiente y las formas de pago', () => {
    const r = renderPlantilla('recordatorio_pago', ctx)
    expect(r.texto).toContain('queda pendiente 17.500,00')
    expect(r.texto).toContain('transferencia bancaria')
    expect(r.texto).toContain('financiación acordada')
  })

  it('tolera datos ausentes sin dejar huecos raros', () => {
    const r = renderPlantilla('reserva_confirmada', {
      nombreCliente: '',
      vehiculo: 'vehículo',
      empresa: 'Sevencars',
    })
    expect(r.texto).toContain('Hola,')
    expect(r.texto).not.toContain('null')
    expect(r.texto).not.toContain('undefined')
    expect(r.texto).toContain('escríbenos y te respondemos enseguida')
  })

  it('no usa voseo en ninguna plantilla', () => {
    const voseo =
      /Confirmás|Podés|Tenés|Elegí|Revisá|podés|tenés|querés|\bvos\b/
    for (const id of PLANTILLA_IDS) {
      const r = renderPlantilla(id, ctx)
      expect(`${r.asunto}\n${r.texto}`).not.toMatch(voseo)
    }
  })
})

describe('ctxDesdeDeal', () => {
  it('arma el contexto a partir del deal', () => {
    const c = ctxDesdeDeal({
      estado: 'reservado',
      cliente: { nombre: ' Marta ', apellidos: 'Pérez' },
      vehiculo: { marca: 'Mazda', modelo: '6', matricula: '3593HXM' },
      importeTotal: '18500',
      importeSena: 1000,
      restoAPagar: null,
      fechaReservaExpira: '2026-09-15T10:00:00.000Z',
    })
    expect(c.nombreCliente).toBe('Marta')
    expect(c.vehiculo).toBe('Mazda 6 (3593HXM)')
    expect(c.importeTotal).toBe(18500)
    expect(c.importeSena).toBe(1000)
    expect(c.restoAPagar).toBeNull()
    expect(c.fechaReservaExpira).toBe('15/09/2026')
    expect(c.empresa).toBe('Sevencars')
  })

  it('describe el vehículo sin matrícula o sin datos', () => {
    expect(
      ctxDesdeDeal({ vehiculo: { marca: 'Mazda', modelo: '6' } }).vehiculo
    ).toBe('Mazda 6')
    expect(ctxDesdeDeal({}).vehiculo).toBe('vehículo')
  })
})

describe('enlaceWhatsApp / normalizarTelefono', () => {
  it('normaliza un móvil nacional con espacios', () => {
    expect(normalizarTelefono('600 12 34 56')).toBe('34600123456')
    expect(enlaceWhatsApp('600 12 34 56', 'Hola Marta')).toBe(
      'https://wa.me/34600123456?text=Hola%20Marta'
    )
  })

  it('respeta el prefijo +34 y 34', () => {
    expect(normalizarTelefono('+34 600 123 456')).toBe('34600123456')
    expect(normalizarTelefono('34600123456')).toBe('34600123456')
    expect(normalizarTelefono('0034-600-123-456')).toBe('34600123456')
  })

  it('acepta otros países solo con prefijo explícito', () => {
    expect(normalizarTelefono('+44 7911 123456')).toBe('447911123456')
    expect(normalizarTelefono('447911123456')).toBeNull()
  })

  it('rechaza teléfonos inválidos', () => {
    expect(normalizarTelefono('abc')).toBeNull()
    expect(normalizarTelefono('12345')).toBeNull()
    expect(normalizarTelefono('500123456')).toBeNull()
    expect(normalizarTelefono('+34 500 123 456')).toBeNull()
    expect(normalizarTelefono('')).toBeNull()
    expect(normalizarTelefono(null)).toBeNull()
    expect(enlaceWhatsApp(undefined, 'x')).toBeNull()
  })

  it('codifica el texto con saltos de línea', () => {
    const url = enlaceWhatsApp('600123456', 'Hola,\n\n¿qué tal?')
    expect(url).toContain('?text=Hola%2C%0A%0A%C2%BFqu%C3%A9%20tal%3F')
  })
})
