'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useInversorAuth } from '@/contexts/InversorAuthContext'
import { useToast } from '@/components/Toast'

export default function InversorLoginPage() {
  const [usuario, setUsuario] = useState('')
  const [contraseña, setContraseña] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login, inversor, isLoading: authLoading } = useInversorAuth()
  const { showToast, ToastContainer } = useToast()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && inversor) {
      // Redirigir a la página específica del inversor
      router.push(
        `/inversores/${inversor.id}-${inversor.nombre.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      )
    }
  }, [inversor, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const success = await login(usuario, contraseña)
      if (success) {
        showToast('Inicio de sesión exitoso', 'success')
        // La redirección se manejará en el useEffect cuando inversor cambie
      } else {
        showToast('Credenciales incorrectas', 'error')
      }
    } catch (error) {
      console.error('Error during investor login:', error)
      showToast('Error durante el inicio de sesión', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (inversor) {
    return null // Se redirigirá automáticamente
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative"
      style={{
        backgroundImage: 'url(/fondo.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay para mejorar la legibilidad */}
      <div className="absolute inset-0 bg-black/30"></div>

      {/* Contenido principal */}
      <div className="relative z-10 max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full flex items-center justify-center">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-white">
            Acceso Inversores
          </h2>
          <p className="mt-2 text-sm text-white/90">
            Ingresa tus credenciales para acceder a tu panel
          </p>
        </div>

        {/* Formulario */}
        <div className="bg-white/40 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="usuario"
                className="block text-sm font-semibold text-gray-700 mb-2"
              >
                Usuario
              </label>
              <input
                id="usuario"
                name="usuario"
                type="text"
                required
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/60 backdrop-blur-sm transition-all duration-300"
                placeholder="Tu usuario"
              />
            </div>

            <div>
              <label
                htmlFor="contraseña"
                className="block text-sm font-semibold text-gray-700 mb-2"
              >
                Contraseña
              </label>
              <input
                id="contraseña"
                name="contraseña"
                type="password"
                required
                value={contraseña}
                onChange={(e) => setContraseña(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/60 backdrop-blur-sm transition-all duration-300"
                placeholder="Tu contraseña"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  <span>Iniciando sesión...</span>
                </div>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
