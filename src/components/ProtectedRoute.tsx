'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'asesor'
  fallbackPath?: string
}

export default function ProtectedRoute({
  children,
  requiredRole,
  fallbackPath = '/login',
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push(fallbackPath)
        return
      }

      if (requiredRole && user.role !== requiredRole) {
        // Si se requiere un rol específico y el usuario no lo tiene
        if (requiredRole === 'admin' && user.role === 'asesor') {
          router.push('/unauthorized')
          return
        }
        // Para otros casos, redirigir al login
        router.push(fallbackPath)
        return
      }
    }
  }, [user, isLoading, requiredRole, fallbackPath, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando autenticación...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Se redirigirá automáticamente
  }

  if (requiredRole && user.role !== requiredRole) {
    return null // Se redirigirá automáticamente
  }

  return <>{children}</>
}
