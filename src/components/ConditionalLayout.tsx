'use client'

import { usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { useAuth } from '@/contexts/AuthContext'

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export default function ConditionalLayout({
  children,
}: ConditionalLayoutProps) {
  const pathname = usePathname()
  // La sesión CRM vive en una cookie HttpOnly y la hidrata AuthProvider desde
  // /api/auth/me. localStorage ya no se escribe en el login, así que no sirve
  // para decidir si mostrar el menú.
  const { user, isLoading } = useAuth()

  // Páginas que no deben mostrar la navegación
  const authPages = ['/login', '/logininv']

  // Auth y página pública del presupuesto (/p/[token]): sin menú CRM
  if (authPages.includes(pathname) || pathname.startsWith('/p/')) {
    return <>{children}</>
  }

  // Mientras se resuelve la sesión, mostrar un estado de carga consistente
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (user) {
    // Si es usuario CRM, mostrar navegación CRM en TODAS las páginas
    return (
      <div className="flex min-h-screen">
        <Navigation />
        <main className="flex-1 min-w-0 md:ml-0">
          <div className="h-full">{children}</div>
        </main>
      </div>
    )
  }

  // Si no es usuario CRM, solo mostrar el contenido
  // La navegación se maneja desde InversorLayoutWrapper para inversores
  return <>{children}</>
}
