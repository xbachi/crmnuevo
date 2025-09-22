'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react'

export interface User {
  id: string
  username: string
  role: 'admin' | 'asesor'
  name: string
}

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  isLoading: boolean
  isAdmin: boolean
  isAsesor: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Usuarios predefinidos
const USERS = {
  admin: {
    id: '1',
    username: 'admin',
    password: 'malafama',
    role: 'admin' as const,
    name: 'Administrador',
  },
  asesor: {
    id: '2',
    username: 'asesor',
    password: 'Sevencars2025',
    role: 'asesor' as const,
    name: 'Asesor',
  },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Verificar si hay un usuario guardado en localStorage
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch (error) {
        console.error('Error parsing saved user:', error)
        localStorage.removeItem('user')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (
    username: string,
    password: string
  ): Promise<boolean> => {
    setIsLoading(true)

    // Simular delay de autenticación
    await new Promise((resolve) => setTimeout(resolve, 500))

    const userData = Object.values(USERS).find(
      (u) => u.username === username && u.password === password
    )

    if (userData) {
      const { password: _, ...userWithoutPassword } = userData
      setUser(userWithoutPassword)
      localStorage.setItem('user', JSON.stringify(userWithoutPassword))
      setIsLoading(false)
      return true
    }

    setIsLoading(false)
    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('user')
    // Redirigir a la página de login
    window.location.href = '/login'
  }

  const isAdmin = user?.role === 'admin'
  const isAsesor = user?.role === 'asesor'

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isLoading,
        isAdmin,
        isAsesor,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
