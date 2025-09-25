'use client'

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react'

interface Cliente {
  id: number
  nombre: string
  apellidos: string
  email?: string
  telefono?: string
  dni?: string
  direccion?: string
  ciudad?: string
  codigoPostal?: string
  provincia?: string
}

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado: string
  precioPublicacion?: number
  fechaMatriculacion?: string
  año?: number
}

interface CacheContextType {
  clientes: Cliente[]
  vehiculos: Vehiculo[]
  isLoading: boolean
  error: string | null
  refreshClientes: () => Promise<void>
  refreshVehiculos: () => Promise<void>
  refreshAll: () => Promise<void>
}

const CacheContext = createContext<CacheContextType | undefined>(undefined)

export const useCache = () => {
  const context = useContext(CacheContext)
  if (context === undefined) {
    throw new Error('useCache must be used within a CacheProvider')
  }
  return context
}

interface CacheProviderProps {
  children: ReactNode
}

export const CacheProvider: React.FC<CacheProviderProps> = ({ children }) => {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClientes = async () => {
    try {
      const response = await fetch('/api/clientes')
      if (response.ok) {
        const data = await response.json()
        setClientes(data)
        console.log(`📊 [CACHE] Clientes cargados: ${data.length}`)
      } else {
        throw new Error('Error al cargar clientes')
      }
    } catch (err) {
      console.error('Error cargando clientes:', err)
      setError('Error al cargar clientes')
    }
  }

  const fetchVehiculos = async () => {
    try {
      const response = await fetch('/api/vehiculos')
      if (response.ok) {
        const data = await response.json()
        // La API devuelve { vehiculos: [...], pagination: {...} }
        const vehiculosArray = data.vehiculos || data
        setVehiculos(vehiculosArray)
        console.log(`📊 [CACHE] Vehículos cargados: ${vehiculosArray.length}`)
      } else {
        throw new Error('Error al cargar vehículos')
      }
    } catch (err) {
      console.error('Error cargando vehículos:', err)
      setError('Error al cargar vehículos')
    }
  }

  const refreshClientes = async () => {
    await fetchClientes()
  }

  const refreshVehiculos = async () => {
    await fetchVehiculos()
  }

  const refreshAll = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await Promise.all([fetchClientes(), fetchVehiculos()])
    } catch (err) {
      console.error('Error cargando datos:', err)
      setError('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  // Cargar datos al inicializar
  useEffect(() => {
    refreshAll()
  }, [])

  const value: CacheContextType = {
    clientes,
    vehiculos,
    isLoading,
    error,
    refreshClientes,
    refreshVehiculos,
    refreshAll,
  }

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>
}
