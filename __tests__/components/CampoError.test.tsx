import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  CampoError,
  Obligatorio,
  claseInput,
  enfocarCampo,
} from '@/components/CampoError'

describe('CampoError', () => {
  it('renderiza role="alert" solo cuando hay mensaje', () => {
    const { rerender } = render(
      <CampoError mensaje="Indica el nombre" id="nombre-error" />
    )
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Indica el nombre')
    expect(alerta).toHaveAttribute('id', 'nombre-error')

    rerender(<CampoError mensaje="" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<CampoError />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Obligatorio: asterisco oculto a lectores + texto sr-only', () => {
    render(
      <label>
        Nombre
        <Obligatorio />
      </label>
    )
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('obligatorio')).toHaveClass('sr-only')
  })

  it('claseInput conserva las clases base y solo pone rojo con error', () => {
    const base =
      'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors'
    expect(claseInput(undefined, base)).toBe(base)
    const conError = claseInput('Indica el nombre', base)
    expect(conError).toContain('border-red-500')
    expect(conError).toContain('focus:ring-red-500')
    expect(conError).not.toContain('border-gray-300')
    expect(conError).not.toContain('focus:ring-green-500')
    expect(conError).toContain('rounded-md')
    expect(conError).toContain('text-sm')
  })

  it('enfocarCampo hace focus por id y no explota si no existe', () => {
    render(<input id="matricula" />)
    enfocarCampo('matricula')
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(() => enfocarCampo('no-existe')).not.toThrow()
    expect(() => enfocarCampo(null)).not.toThrow()
  })
})
