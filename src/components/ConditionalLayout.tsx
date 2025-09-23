'use client'

import { usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { isCrmUserAuthenticated } from '@/lib/auth-utils'

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export default function ConditionalLayout({
  children,
}: ConditionalLayoutProps) {
  const pathname = usePathname()

  // Páginas que no deben mostrar la navegación
  const authPages = ['/login', '/logininv']

  if (authPages.includes(pathname)) {
    // Para páginas de autenticación, solo mostrar el contenido
    return <>{children}</>
  }

  // Verificar si es un usuario CRM autenticado
  const isCrmUser = isCrmUserAuthenticated()

  if (isCrmUser) {
    // Si es usuario CRM, mostrar navegación CRM en TODAS las páginas
    return (
      <div className="flex min-h-screen">
        <Navigation />
        <main className="flex-1 min-w-0 lg:ml-0">
          <div className="h-full">{children}</div>
        </main>
      </div>
    )
  }

  // Si no es usuario CRM, solo mostrar el contenido
  // La navegación se maneja desde InversorLayoutWrapper para inversores
  return <>{children}</>
}
