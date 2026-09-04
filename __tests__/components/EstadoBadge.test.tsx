import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import EstadoBadge from '@/components/EstadoBadge'
import { getDealEstadoClass } from '@/lib/dealEstado'
import { getVehiculoEstadoClass } from '@/lib/vehiculoEstado'

describe('EstadoBadge', () => {
  it('deal facturado muestra "Facturado" con la clase canónica', () => {
    render(<EstadoBadge entidad="deal" valor="FACTURADO" />)
    const badge = screen.getByText('Facturado')
    for (const c of getDealEstadoClass('facturado').split(' ')) {
      expect(badge).toHaveClass(c)
    }
  })

  it('vehículo con alias de kanban y casing mezclado', () => {
    render(<EstadoBadge entidad="vehiculo" valor="vendido" size="md" />)
    const badge = screen.getByText('Vendido')
    expect(badge).toHaveClass('text-sm')
    for (const c of getVehiculoEstadoClass('VENDIDO').split(' ')) {
      expect(badge).toHaveClass(c)
    }
  })

  it('vehículo sin estado muestra Inicial; no reconocible muestra el crudo', () => {
    render(<EstadoBadge entidad="vehiculo" valor={null} />)
    expect(screen.getByText('Inicial')).toBeInTheDocument()
    render(<EstadoBadge entidad="vehiculo" valor="mantenimiento" />)
    expect(screen.getByText('mantenimiento')).toBeInTheDocument()
  })
})
