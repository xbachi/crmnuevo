'use client'

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react'

interface InversorUser {
  id: number
  nombre: string
  email?: string
  usuario: string
}

interface InversorAuthContextType {
  inversor: InversorUser | null
  login: (usuario: string, contraseña: string) => Promise<boolean>
  logout: () => void
  isLoading: boolean
}

export const InversorAuthContext = createContext<
  InversorAuthContextType | undefined
>(undefined)

export function InversorAuthProvider({ children }: { children: ReactNode }) {
  const [inversor, setInversor] = useState<InversorUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Verificar si hay un inversor autenticado en localStorage
    const savedInversor = localStorage.getItem('inversor')
    if (savedInversor) {
      try {
        setInversor(JSON.parse(savedInversor))
      } catch (error) {
        console.error('Error parsing saved inversor:', error)
        localStorage.removeItem('inversor')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (
    usuario: string,
    contraseña: string
  ): Promise<boolean> => {
    try {
      setIsLoading(true)

      const response = await fetch('/api/inversores/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ usuario, contraseña }),
      })

      if (response.ok) {
        const inversorData = await response.json()
        const inversorUser: InversorUser = {
          id: inversorData.id,
          nombre: inversorData.nombre,
          email: inversorData.email,
          usuario: inversorData.usuario,
        }

        setInversor(inversorUser)
        localStorage.setItem('inversor', JSON.stringify(inversorUser))
        return true
      } else {
        const errorData = await response.json()
        console.error('Login failed:', errorData.error)
        return false
      }
    } catch (error) {
      console.error('Error during login:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setInversor(null)
    localStorage.removeItem('inversor')
    // Redirigir a la página de login de inversores
    window.location.href = '/logininv'
  }

  return (
    <InversorAuthContext.Provider
      value={{ inversor, login, logout, isLoading }}
    >
      {children}
    </InversorAuthContext.Provider>
  )
}

export function useInversorAuth() {
  const context = useContext(InversorAuthContext)
  if (context === undefined) {
    throw new Error(
      'useInversorAuth must be used within an InversorAuthProvider'
    )
  }
  return context
}
