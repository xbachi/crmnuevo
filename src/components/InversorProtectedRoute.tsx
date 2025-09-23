'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useInversorAuth } from '@/contexts/InversorAuthContext'

interface InversorProtectedRouteProps {
  children: React.ReactNode
}

export default function InversorProtectedRoute({
  children,
}: InversorProtectedRouteProps) {
  const { inversor, isLoading } = useInversorAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && !inversor) {
      // Solo redirigir si estamos en una página de inversores
      if (pathname.startsWith('/inversores/')) {
        router.push('/logininv')
      }
    }
  }, [inversor, isLoading, router, pathname])

  // Mostrar loading mientras se verifica la autenticación
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Si no está autenticado y estamos en una página de inversores, no mostrar nada
  if (!inversor && pathname.startsWith('/inversores/')) {
    return null
  }

  return <>{children}</>
}
