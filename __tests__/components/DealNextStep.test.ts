import {
  calcularSiguientePaso,
  DEAL_ANCHOR_CAMBIO_NOMBRE,
  DEAL_ANCHOR_DOCUMENTOS,
  DEAL_ANCHOR_FACTURACION,
  type SiguientePasoInput,
} from '@/components/DealNextStep'

const HOY = new Date(2026, 8, 4, 12, 0, 0) // 4 sep 2026

const base: SiguientePasoInput = {
  estado: 'nuevo',
  tieneContratoReserva: false,
  tieneContratoVenta: false,
  tieneFacturaActiva: false,
  fechaReservaExpira: null,
  cambioNombre: {
    solicitado: false,
    documentacionRecibida: false,
    clienteAvisado: false,
    documentacionRetirada: false,
  },
  hoy: HOY,
}

const diasDesdeHoy = (n: number) =>
  new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + n)

describe('calcularSiguientePaso', () => {
  it('nuevo sin contrato → generar contrato de reserva (paso 1)', () => {
    const r = calcularSiguientePaso(base)
    expect(r.paso).toBe(1)
    expect(r.total).toBe(5)
    expect(r.titulo).toMatch(/contrato de reserva/i)
    expect(r.anchorId).toBe(DEAL_ANCHOR_DOCUMENTOS)
    expect(r.ctaLabel).toBeTruthy()
    expect(r.alerta).toBeUndefined()
  })

  it('reservado (y nuevo con contrato de reserva) → contrato de venta (paso 2)', () => {
    const r1 = calcularSiguientePaso({
      ...base,
      estado: 'RESERVADO',
      tieneContratoReserva: true,
      fechaReservaExpira: diasDesdeHoy(3),
    })
    expect(r1.paso).toBe(2)
    expect(r1.titulo).toMatch(/contrato de venta/i)
    expect(r1.descripcion).toBe('La reserva vence en 3 días')
    expect(r1.alerta).toBeUndefined()

    const r2 = calcularSiguientePaso({
      ...base,
      estado: 'nuevo',
      tieneContratoReserva: true,
    })
    expect(r2.paso).toBe(2)
    expect(r2.anchorId).toBe(DEAL_ANCHOR_DOCUMENTOS)
  })

  it('reserva vencida → alerta danger con los días', () => {
    const r = calcularSiguientePaso({
      ...base,
      estado: 'reservado',
      tieneContratoReserva: true,
      fechaReservaExpira: diasDesdeHoy(-2).toISOString(),
    })
    expect(r.paso).toBe(2)
    expect(r.alerta).toEqual({
      tipo: 'danger',
      texto: 'Reserva vencida hace 2 días',
    })
  })

  it('vendido sin factura activa → emitir la factura (paso 3)', () => {
    const r = calcularSiguientePaso({
      ...base,
      estado: 'vendido',
      tieneContratoReserva: true,
      tieneContratoVenta: true,
    })
    expect(r.paso).toBe(3)
    expect(r.titulo).toMatch(/factura/i)
    expect(r.anchorId).toBe(DEAL_ANCHOR_FACTURACION)
  })

  it('facturado con cambio de nombre a medias → X de 4 y el siguiente pendiente', () => {
    const r = calcularSiguientePaso({
      ...base,
      estado: 'facturado',
      tieneContratoReserva: true,
      tieneContratoVenta: true,
      tieneFacturaActiva: true,
      cambioNombre: {
        solicitado: true,
        documentacionRecibida: true,
        clienteAvisado: false,
        documentacionRetirada: false,
      },
    })
    expect(r.paso).toBe(4)
    expect(r.titulo).toBe('Cambio de nombre: 2 de 4 pasos')
    expect(r.descripcion).toMatch(/cliente avisado/i)
    expect(r.anchorId).toBe(DEAL_ANCHOR_CAMBIO_NOMBRE)
  })

  it('vendido con factura activa se trata como facturado', () => {
    const r = calcularSiguientePaso({
      ...base,
      estado: 'vendido',
      tieneFacturaActiva: true,
    })
    expect(r.paso).toBe(4)
    expect(r.titulo).toBe('Cambio de nombre: 0 de 4 pasos')
  })

  it('los 4 checks → venta completada (paso 5) sin CTA', () => {
    const r = calcularSiguientePaso({
      ...base,
      estado: 'facturado',
      tieneFacturaActiva: true,
      cambioNombre: {
        solicitado: true,
        documentacionRecibida: true,
        clienteAvisado: true,
        documentacionRetirada: true,
      },
    })
    expect(r.paso).toBe(5)
    expect(r.titulo).toBe('Venta completada')
    expect(r.ctaLabel).toBeNull()
    expect(r.anchorId).toBeNull()
  })

  it('anulado → venta anulada sin CTA', () => {
    const r = calcularSiguientePaso({ ...base, estado: 'anulado' })
    expect(r.paso).toBe(0)
    expect(r.titulo).toBe('Venta anulada')
    expect(r.ctaLabel).toBeNull()
    expect(r.anchorId).toBeNull()
  })
})
