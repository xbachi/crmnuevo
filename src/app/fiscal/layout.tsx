'use client'

/**
 * Shell del módulo fiscal (gestoría interna), con el mismo patrón de tabs que
 * /facturacion.
 *
 * requiredRole="admin": leer el registro es de sesión, pero todo lo que se puede
 * HACER acá (validar, corregir, fusionar proveedores) es admin. Mostrarle la
 * pantalla a un asesor sería enseñarle botones que la API le va a rechazar.
 */

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'

const TABS = [
  { href: '/fiscal/validacion', label: 'Validación' },
  { href: '/fiscal/proveedores', label: 'Proveedores' },
]

export default function FiscalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
            <h1 className="text-2xl font-semibold text-gray-900">Fiscal</h1>
            <p className="text-sm text-gray-500 mt-1">
              Libro de facturas recibidas para el IVA trimestral: validación del
              desglose y ficha fiscal de los proveedores.
            </p>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1 overflow-x-auto" aria-label="Secciones de fiscal">
              {TABS.map((tab) => {
                const active = pathname?.startsWith(tab.href)
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      active
                        ? 'border-primary-600 text-primary-700'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </div>
    </ProtectedRoute>
  )
}
