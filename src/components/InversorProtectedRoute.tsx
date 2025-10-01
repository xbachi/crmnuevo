'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useInversorAuth } from '@/contexts/InversorAuthContext'
import { useAuth } from '@/contexts/AuthContext'

interface InversorProtectedRouteProps {
  children: React.ReactNode
}

export default function InversorProtectedRoute({
  children,
}: InversorProtectedRouteProps) {
  const { inversor, isLoading: inversorLoading } = useInversorAuth()
  const { user, isLoading: crmLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isLoading = inversorLoading || crmLoading

  useEffect(() => {
    // Solo redirigir si no hay ningún tipo de usuario autenticado
    if (
      !isLoading &&
      !inversor &&
      !user &&
      pathname.startsWith('/inversores/')
    ) {
      router.push('/logininv')
    }
  }, [inversor, user, isLoading, router, pathname])

  // Mostrar loading mientras se verifica la autenticación
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Permitir acceso si hay cualquier tipo de usuario autenticado (CRM o inversor)
  if (user || inversor) {
    return <>{children}</>
  }

  // Si no está autenticado, no mostrar nada
  return null
}
