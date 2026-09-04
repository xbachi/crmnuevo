import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ConfirmModal from '@/components/ConfirmModal'
import Toast from '@/components/Toast'
import Navigation from '@/components/Navigation'

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'seba', rol: 'admin', nombre: 'Seba' },
    logout: jest.fn(),
  }),
}))

jest.mock('@/hooks/useSafeInversorAuth', () => ({
  useSafeInversorAuth: () => ({ inversor: null, logout: jest.fn() }),
}))

const expectButtonsWithName = () => {
  const buttons = screen.getAllByRole('button')
  expect(buttons.length).toBeGreaterThan(0)
  for (const btn of buttons) {
    const name =
      btn.getAttribute('aria-label') ||
      btn.getAttribute('title') ||
      btn.textContent?.trim()
    expect(name).toBeTruthy()
  }
}

describe('a11y básica', () => {
  it('ConfirmModal abierto: sus botones tienen nombre accesible', () => {
    render(
      <ConfirmModal
        isOpen
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        title="Eliminar deal"
        message="¿Seguro?"
      />
    )
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirmar' })
    ).toBeInTheDocument()
    expectButtonsWithName()
  })

  it('Toast: contenedor con role=status y botón de cerrar etiquetado', () => {
    render(<Toast message="Guardado" type="success" onClose={jest.fn()} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('Navigation: ningún botón sin nombre accesible', () => {
    render(<Navigation />)
    expectButtonsWithName()
    expect(
      screen.getByRole('button', { name: /Contraer menú|Expandir menú/ })
    ).toBeInTheDocument()
  })
})
