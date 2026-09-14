import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ConditionalLayout from '@/components/ConditionalLayout'

// Regresión: el sidebar se decidía por localStorage.user, que el login dejó
// de escribir al pasar a sesión server-side (cookie). Tiene que salir de
// useAuth(), no del storage.

const mockUseAuth = jest.fn()
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

let mockPathname = '/'
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

jest.mock('@/components/Navigation', () => {
  return function MockNavigation() {
    return <nav data-testid="crm-nav">nav</nav>
  }
})

const crmUser = { id: '1', username: 'admin', role: 'admin', name: 'Admin' }

describe('ConditionalLayout', () => {
  beforeEach(() => {
    mockPathname = '/'
    localStorage.clear()
  })

  it('muestra el sidebar con sesión CRM aunque localStorage esté vacío', () => {
    mockUseAuth.mockReturnValue({ user: crmUser, isLoading: false })
    render(
      <ConditionalLayout>
        <p>contenido</p>
      </ConditionalLayout>
    )
    expect(screen.getByTestId('crm-nav')).toBeInTheDocument()
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('no muestra el sidebar sin sesión CRM aunque localStorage tenga un user viejo', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, username: 'viejo', role: 'admin' })
    )
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    render(
      <ConditionalLayout>
        <p>contenido</p>
      </ConditionalLayout>
    )
    expect(screen.queryByTestId('crm-nav')).not.toBeInTheDocument()
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('mientras carga la sesión no muestra ni sidebar ni contenido', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true })
    render(
      <ConditionalLayout>
        <p>contenido</p>
      </ConditionalLayout>
    )
    expect(screen.queryByTestId('crm-nav')).not.toBeInTheDocument()
    expect(screen.queryByText('contenido')).not.toBeInTheDocument()
  })

  it('en /login nunca muestra el sidebar', () => {
    mockPathname = '/login'
    mockUseAuth.mockReturnValue({ user: crmUser, isLoading: false })
    render(
      <ConditionalLayout>
        <p>login</p>
      </ConditionalLayout>
    )
    expect(screen.queryByTestId('crm-nav')).not.toBeInTheDocument()
    expect(screen.getByText('login')).toBeInTheDocument()
  })
})
