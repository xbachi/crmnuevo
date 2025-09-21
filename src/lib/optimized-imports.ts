/**
 * Imports optimizados para reducir el tamaño del bundle
 */

// Re-exportar solo lo necesario de librerías grandes
export { format, parseISO, isValid } from 'date-fns'

// Imports específicos de Chart.js para reducir bundle
export { 
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
} from 'chart.js'

// Imports específicos de react-chartjs-2
export { Bar, Doughnut, Line } from 'react-chartjs-2'

// Imports específicos de Heroicons (solo los que se usan)
export { 
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  CheckIcon,
  XMarkIcon as CloseIcon
} from '@heroicons/react/24/outline'

// Imports específicos de Heroicons solid (solo los que se usan)
export {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/solid'

// Utility functions optimizadas
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// Formatters optimizados
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount)
}

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('es-ES').format(num)
}

export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(d)
}

// Validators optimizados
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[+]?[\d\s\-\(\)]{9,}$/
  return phoneRegex.test(phone)
}

// Constants para evitar recreaciones
export const API_ENDPOINTS = {
  VEHICULOS: '/api/vehiculos',
  CLIENTES: '/api/clientes',
  DEALS: '/api/deals',
  INVERSORES: '/api/inversores',
  DEPOSITOS: '/api/depositos'
} as const

export const CACHE_KEYS = {
  VEHICULOS: 'vehiculos',
  CLIENTES: 'clientes',
  DEALS: 'deals',
  INVERSORES: 'inversores',
  DEPOSITOS: 'depositos',
  DASHBOARD: 'dashboard'
} as const

// Configuración de caché
export const CACHE_CONFIG = {
  VEHICULOS: 5 * 60 * 1000, // 5 minutos
  CLIENTES: 3 * 60 * 1000,  // 3 minutos
  DEALS: 2 * 60 * 1000,     // 2 minutos
  INVERSORES: 5 * 60 * 1000, // 5 minutos
  DEPOSITOS: 5 * 60 * 1000,  // 5 minutos
  DASHBOARD: 5 * 60 * 1000   // 5 minutos
} as const
