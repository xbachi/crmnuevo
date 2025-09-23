'use client'

import { useEffect, useState } from 'react'
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
  const [isCrmUser, setIsCrmUser] = useState(false)

  // Verificar si el usuario es un usuario CRM (no inversor)
  useEffect(() => {
    // Si no hay inversor autenticado, asumimos que es un usuario CRM
    if (!isLoading && !inversor) {
      setIsCrmUser(true)
    } else {
      setIsCrmUser(false)
    }
  }, [inversor, isLoading])

  useEffect(() => {
    // Solo redirigir si no es usuario CRM y no hay inversor autenticado
    if (
      !isLoading &&
      !inversor &&
      !isCrmUser &&
      pathname.startsWith('/inversores/')
    ) {
      router.push('/logininv')
    }
  }, [inversor, isLoading, isCrmUser, router, pathname])

  // Mostrar loading mientras se verifica la autenticación
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Permitir acceso si es usuario CRM o si hay inversor autenticado
  if (isCrmUser || inversor) {
    return <>{children}</>
  }

  // Si no está autenticado y no es usuario CRM, no mostrar nada
  return null
}
