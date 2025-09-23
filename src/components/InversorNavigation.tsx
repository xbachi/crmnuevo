'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useInversorAuth } from '@/contexts/InversorAuthContext'

// Iconos SVG para una mejor apariencia
const InversoresIcon = ({ isCollapsed }: { isCollapsed: boolean }) => (
  <svg
    className={isCollapsed ? 'w-10 h-10' : 'w-6 h-6'}
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

const UserIcon = ({ isCollapsed }: { isCollapsed: boolean }) => (
  <svg
    className={isCollapsed ? 'w-10 h-10' : 'w-6 h-6'}
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

const LogoutIcon = ({ isCollapsed }: { isCollapsed: boolean }) => (
  <svg
    className={isCollapsed ? 'w-10 h-10' : 'w-6 h-6'}
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

export default function InversorNavigation() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const { inversor, logout } = useInversorAuth()

  // Detectar si es móvil
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const navItems = [
    {
      href: '/inversores',
      label: 'Inversores',
      icon: InversoresIcon,
    },
  ]

  const isActive = (href: string) => {
    return pathname.startsWith(href)
  }

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
              d="M4 6h16M4 12h16M4 18h16"
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

      {/* Navigation */}
      <div
        className={`
        bg-gray-50 border-r border-gray-200 transition-all duration-300 flex flex-col h-screen sticky top-0 z-30
        ${
          isMobile
            ? `fixed left-0 top-0 transform transition-transform duration-300 ${
                isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
              } w-64`
            : shouldShowCollapsed
              ? 'w-16'
              : 'w-56'
        }
      `}
      >
        {/* Header con Logo */}
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <Link
            href="/inversores"
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
            onClick={() => isMobile && setIsMobileMenuOpen(false)}
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm sm:text-lg">
                SC
              </span>
            </div>
            {!shouldShowCollapsed && (
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">
                  SevenCars
                </h1>
                <p className="text-xs sm:text-sm text-gray-500">Inversores</p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2 sm:px-4 py-4 sm:py-6">
          <div className="space-y-1 sm:space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center ${shouldShowCollapsed ? 'justify-center px-3 py-4' : 'space-x-2 sm:space-x-3 px-2 sm:px-3 py-2 sm:py-3'} rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                    isActive(item.href)
                      ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm'
                  }`}
                  title={shouldShowCollapsed ? item.label : undefined}
                  onClick={() => isMobile && setIsMobileMenuOpen(false)}
                >
                  <Icon isCollapsed={shouldShowCollapsed} />
                  {!shouldShowCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* User Profile Section */}
        <div className="p-2 sm:p-4 border-t border-gray-200">
          <div className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg p-3 sm:p-4 text-white">
            <div
              className={`flex items-center ${shouldShowCollapsed ? 'justify-center' : 'space-x-2 sm:space-x-3'}`}
            >
              <div
                className={`${shouldShowCollapsed ? 'w-12 h-12' : 'w-6 h-6 sm:w-8 sm:h-8'} bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0`}
              >
                <UserIcon isCollapsed={shouldShowCollapsed} />
              </div>
              {!shouldShowCollapsed && inversor && (
                <div className="min-w-0">
                  <p className="font-medium text-xs sm:text-sm truncate">
                    {inversor.nombre}
                  </p>
                  <p className="text-xs text-white/80 truncate">Inversor</p>
                </div>
              )}
            </div>
          </div>

          {/* Logout Button */}
          {inversor && (
            <button
              onClick={logout}
              className={`w-full mt-2 flex items-center ${shouldShowCollapsed ? 'justify-center px-3 py-2' : 'space-x-2 px-2 py-2'} rounded-lg text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm transition-all duration-200`}
              title={shouldShowCollapsed ? 'Cerrar sesión' : undefined}
            >
              <LogoutIcon isCollapsed={shouldShowCollapsed} />
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
            className="absolute top-1/2 -right-3 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
            title={isCollapsed ? 'Expandir' : 'Contraer'}
          >
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}
      </div>
    </>
  )
}
