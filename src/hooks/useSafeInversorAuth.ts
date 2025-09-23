import { useContext } from 'react'
import { InversorAuthContext } from '@/contexts/InversorAuthContext'

export function useSafeInversorAuth() {
  try {
    const context = useContext(InversorAuthContext)
    if (context === undefined) {
      // Si no hay InversorAuthProvider, retornar valores por defecto
      return {
        inversor: null,
        login: async () => false,
        logout: () => {},
        isLoading: false,
      }
    }
    return context
  } catch (error) {
    // Si hay algún error, retornar valores por defecto
    return {
      inversor: null,
      login: async () => false,
      logout: () => {},
      isLoading: false,
    }
  }
}
