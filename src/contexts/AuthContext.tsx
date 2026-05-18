'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'

export interface User {
  id: string
  username: string // email
  role: 'admin' | 'asesor'
  name: string
}

interface AuthContextType {
  user: User | null
  login: (usernameOrEmail: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  isLoading: boolean
  isAdmin: boolean
  isAsesor: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Normaliza usuario→email: si no contiene "@", asume el dominio interno.
 * Permite a usuarios seguir tipeando "admin" o "asesor" como antes.
 */
function toEmail(input: string): string {
  const v = input.trim()
  if (!v) return ''
  return v.includes('@') ? v : `${v}@sevencars.local`
}

function mapApiUser(apiUser: {
  id: number
  email: string
  role: 'admin' | 'asesor'
  name: string | null
}): User {
  return {
    id: String(apiUser.id),
    username: apiUser.email,
    role: apiUser.role,
    name: apiUser.name ?? apiUser.email.split('@')[0],
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Hidrata la sesión desde el server (cookie). El localStorage queda obsoleto.
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return null
        const data = await r.json().catch(() => null)
        return data?.user ?? null
      })
      .then((apiUser) => {
        if (cancelled) return
        setUser(apiUser ? mapApiUser(apiUser) : null)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(
    async (usernameOrEmail: string, password: string): Promise<boolean> => {
      setIsLoading(true)
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: toEmail(usernameOrEmail),
            password,
          }),
        })
        if (!res.ok) return false
        const data = await res.json()
        if (!data?.user) return false
        setUser(mapApiUser(data.user))
        return true
      } catch (e) {
        console.error('[AuthContext.login]', e)
        return false
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (e) {
      console.warn('[AuthContext.logout]', e)
    } finally {
      setUser(null)
      // Limpieza defensiva de localStorage viejo (migración del esquema anterior)
      try {
        localStorage.removeItem('user')
      } catch {}
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
  }, [])

  const isAdmin = user?.role === 'admin'
  const isAsesor = user?.role === 'asesor'

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isLoading, isAdmin, isAsesor }}
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
