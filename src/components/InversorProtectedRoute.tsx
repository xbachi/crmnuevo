'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useInversorAuth } from '@/contexts/InversorAuthContext'
import { isCrmUserAuthenticated } from '@/lib/auth-utils'

interface InversorProtectedRouteProps {
  children: React.ReactNode
}

export default function InversorProtectedRoute({
  children,
}: InversorProtectedRouteProps) {
  const { inversor, isLoading } = useInversorAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isCrmUser, setIsCrmUser] = useState<boolean | null>(null)

  // Verificar si el usuario es un usuario CRM (admin/asesor)
  useEffect(() => {
    const checkCrmAuth = () => {
      const crmAuth = isCrmUserAuthenticated()
      setIsCrmUser(crmAuth)
    }

    // Verificar inmediatamente
    checkCrmAuth()

    // También verificar después de un pequeño delay para asegurar que el contexto esté listo
    const timer = setTimeout(checkCrmAuth, 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Solo redirigir si no es usuario CRM y no hay inversor autenticado
    if (
      !isLoading &&
      !inversor &&
      isCrmUser === false &&
      pathname.startsWith('/inversores/')
    ) {
      router.push('/logininv')
    }
  }, [inversor, isLoading, isCrmUser, router, pathname])

  // Mostrar loading mientras se verifica la autenticación
  if (isLoading || isCrmUser === null) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Permitir acceso si es usuario CRM (admin/asesor) o si hay inversor autenticado
  if (isCrmUser || inversor) {
    return <>{children}</>
  }

  // Si no está autenticado y no es usuario CRM, no mostrar nada
  return null
}
