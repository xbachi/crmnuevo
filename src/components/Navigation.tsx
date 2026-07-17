'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useSafeInversorAuth } from '@/hooks/useSafeInversorAuth'

// Iconos SVG optimizados para mobile-first
const DashboardIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
  </svg>
)

const VehiculosIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
      clipRule="evenodd"
    />
  </svg>
)

const CochesRIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1V8a1 1 0 00-1-1h-3z" />
  </svg>
)

const ClientesIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
)

const InversoresIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
      clipRule="evenodd"
    />
  </svg>
)

const KanbanIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm8 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1V8z"
      clipRule="evenodd"
    />
  </svg>
)

const UserIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
      clipRule="evenodd"
    />
  </svg>
)

const DealsIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
      clipRule="evenodd"
    />
  </svg>
)

const ImportIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
      clipRule="evenodd"
    />
  </svg>
)

const DocumentacionIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
)

const DepositosIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h4a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2z"
      clipRule="evenodd"
    />
  </svg>
)

const FacturasIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
      clipRule="evenodd"
    />
  </svg>
)

const AutomatizacionesIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
      clipRule="evenodd"
    />
  </svg>
)

const ContratosIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
      clipRule="evenodd"
    />
  </svg>
)

const ReservasIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
      clipRule="evenodd"
    />
  </svg>
)

const LogoutIcon = () => (
  <svg
    className="w-6 h-6 md:w-7 md:h-7"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    />
  </svg>
)

export default function Navigation() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { inversor, logout: logoutInversor } = useSafeInversorAuth()

  // Detectar si es móvil
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const navItems = [
    {
      href: '/',
      label: 'Dashboard',
      icon: DashboardIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/kanban',
      label: 'Proceso Venta',
      icon: KanbanIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/deals',
      label: 'Ventas',
      icon: DealsIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/clientes',
      label: 'Clientes',
      icon: ClientesIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/interesados',
      label: 'Interesados',
      icon: ClientesIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/clientes-b2b',
      label: 'Clientes B2B',
      icon: ClientesIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/vehiculos',
      label: 'Vehículos',
      icon: VehiculosIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/coches-r',
      label: 'Coches R',
      icon: CochesRIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/depositos',
      label: 'Depósitos',
      icon: DepositosIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/inversores',
      label: 'Inversores',
      icon: InversoresIcon,
      roles: ['admin'],
    },
    {
      href: '/documentacion',
      label: 'Documentación',
      icon: DocumentacionIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/facturacion',
      label: 'Facturación',
      icon: FacturasIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/facturacion/registro',
      label: 'Automatizaciones',
      icon: AutomatizacionesIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/expedientes',
      label: 'Expedientes',
      icon: DocumentacionIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/comisiones',
      label: 'Comisiones',
      icon: InversoresIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/revision',
      label: 'Revisión',
      icon: AutomatizacionesIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/fiscal',
      label: 'Fiscal',
      icon: FacturasIcon,
      roles: ['admin'],
    },
    {
      href: '/generador-facturas',
      label: 'Generador Facturas',
      icon: FacturasIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/generador-contratos',
      label: 'Generador Contratos',
      icon: ContratosIcon,
      roles: ['admin', 'asesor'],
    },
    {
      href: '/generador-reservas',
      label: 'Generador Reservas',
      icon: ReservasIcon,
      roles: ['admin', 'asesor'],
    },
  ]

  const isActive = (href: string) => {
    if (pathname === href) return true
    if (href === '/') return false
    // Exigir "/" después del href para que /clientes no matchee /clientes-b2b
    return pathname.startsWith(href + '/')
  }

  const hasPermission = (roles: string[]) => {
    if (inversor) return false
    if (!user) return false
    return roles.includes(user.role)
  }

  const filteredNavItems = navItems.filter((item) => hasPermission(item.roles))

  // En móvil, siempre mostrar el menú colapsado o como overlay
  const shouldShowCollapsed = isMobile ? !isMobileMenuOpen : isCollapsed

  return (
    <>
      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-gray-200 lg:hidden"
          aria-label="Toggle menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={
                isMobileMenuOpen
                  ? 'M6 18L18 6M6 6l12 12'
                  : 'M4 6h16M4 12h16M4 18h16'
              }
            />
          </svg>
        </button>
      )}

      {/* Mobile Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed top-0 left-0 h-full bg-white border-r border-gray-200 shadow-lg z-50 transition-all duration-300 ease-in-out
          ${
            isMobile
              ? isMobileMenuOpen
                ? 'w-64'
                : 'w-0 -translate-x-full'
              : shouldShowCollapsed
                ? 'w-16'
                : 'w-64'
          }
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div
            className={`flex items-center p-4 border-b border-gray-200 ${shouldShowCollapsed ? 'justify-center' : 'justify-start'}`}
          >
            {!shouldShowCollapsed && (
              <>
                <div
                  className="flex items-center justify-center"
                  style={{ width: '200px', height: 'auto' }}
                >
                  <img
                    src="/logocontrato.png"
                    alt="SevenCars Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              </>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-2 py-4 overflow-y-auto">
            <div className="space-y-1">
              {filteredNavItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-center rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200
                      ${
                        active && !shouldShowCollapsed
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : active && shouldShowCollapsed
                            ? 'text-blue-700'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                      ${shouldShowCollapsed ? 'justify-center' : 'space-x-3'}
                    `}
                    title={shouldShowCollapsed ? item.label : undefined}
                    onClick={() => isMobile && setIsMobileMenuOpen(false)}
                  >
                    <Icon />
                    {!shouldShowCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </nav>

          {/* User Info & Logout */}
          <div className="p-4 border-t border-gray-200">
            {/* User Info */}
            {(user || inversor) && !shouldShowCollapsed && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                    <UserIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {inversor ? inversor.nombre : (user as any)?.nombre}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {inversor ? 'Inversor' : user?.role}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Logout Button */}
            {(user || inversor) && (
              <button
                onClick={inversor ? logoutInversor : logout}
                className={`
                  w-full flex items-center rounded-lg px-3 py-3 text-sm font-medium text-gray-600 
                  hover:text-gray-900 hover:bg-gray-50 transition-all duration-200
                  ${shouldShowCollapsed ? 'justify-center' : 'space-x-3'}
                `}
                title={shouldShowCollapsed ? 'Cerrar sesión' : undefined}
              >
                <LogoutIcon />
                {!shouldShowCollapsed && (
                  <span className="truncate">Cerrar sesión</span>
                )}
              </button>
            )}
          </div>

          {/* Collapse Button - Solo en desktop */}
          {!isMobile && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="absolute top-1/2 -right-3 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow z-10"
              title={isCollapsed ? 'Expandir' : 'Contraer'}
            >
              <svg
                className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${
                  isCollapsed ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Spacer */}
      <div
        className={`
          transition-all duration-300 ease-in-out
          ${isMobile ? 'ml-0' : shouldShowCollapsed ? 'ml-16' : 'ml-64'}
        `}
      />
    </>
  )
}
