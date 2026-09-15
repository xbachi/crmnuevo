import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import EstadoPresupuestoBadge, {
  estadoEfectivo,
} from '@/components/presupuesto/EstadoPresupuestoBadge'

const HOY = '2026-09-14'

describe('estadoEfectivo', () => {
  it('enviado/visto con valido_hasta pasado → vencido', () => {
    expect(estadoEfectivo('enviado', '2026-09-13', HOY)).toBe('vencido')
    expect(estadoEfectivo('visto', '2026-09-01', HOY)).toBe('vencido')
  })

  it('vigente o estados finales conservan su estado', () => {
    expect(estadoEfectivo('enviado', '2026-09-14', HOY)).toBe('enviado')
    expect(estadoEfectivo('enviado', '2026-09-21', HOY)).toBe('enviado')
    expect(estadoEfectivo('aceptado', '2020-01-01', HOY)).toBe('aceptado')
    expect(estadoEfectivo('anulado', '2020-01-01', HOY)).toBe('anulado')
    expect(estadoEfectivo('borrador', '2020-01-01', HOY)).toBe('borrador')
  })
})

describe('EstadoPresupuestoBadge', () => {
  it('enviado + valido_hasta pasado muestra "Vencido"', () => {
    render(
      <EstadoPresupuestoBadge
        estado="enviado"
        validoHasta="2020-01-01"
        hoy={HOY}
      />
    )
    expect(screen.getByText('Vencido')).toBeInTheDocument()
  })

  it('aceptado muestra "Aceptado" aunque haya pasado la fecha', () => {
    render(
      <EstadoPresupuestoBadge
        estado="aceptado"
        validoHasta="2020-01-01"
        hoy={HOY}
      />
    )
    expect(screen.getByText('Aceptado')).toBeInTheDocument()
  })
})
