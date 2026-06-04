'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'

const TABS = [
  { href: '/facturacion/historial', label: 'Historial' },
  { href: '/facturacion/series', label: 'Series y numeración' },
  { href: '/facturacion/registro', label: 'Registro automatiz.' },
  { href: '/facturacion/errores', label: 'Errores / pendientes' },
  { href: '/facturacion/configuracion', label: 'Configuración' },
]

export default function FacturacionLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
            <h1 className="text-2xl font-semibold text-gray-900">Facturación</h1>
            <p className="text-sm text-gray-500 mt-1">
              Historial fiscal, gestión de series y configuración de facturas.
            </p>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1 overflow-x-auto" aria-label="Secciones de facturación">
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
