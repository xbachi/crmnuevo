export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatCurrency(amount: number): string {
  if (amount === 0) return '0€'

  // Redondear a 2 decimales
  const roundedAmount = Math.round(amount * 100) / 100

  // Verificar si es un número entero después del redondeo
  if (Number.isInteger(roundedAmount)) {
    // Para números enteros: separador de miles con punto, sin decimales
    return `${formatNumberWithThousands(roundedAmount)}€`
  } else {
    // Para números con decimales: separador de miles con punto, decimales con coma (máximo 2)
    const parts = roundedAmount.toString().split('.')
    const integerPart = formatNumberWithThousands(parseInt(parts[0]))
    const decimalPart = parts[1] ? ',' + parts[1].padEnd(2, '0').substring(0, 2) : ''
    return `${integerPart}${decimalPart}€`
  }
}

export function formatVehicleReference(referencia: string, tipo: string): string {
  if (!referencia) return ''
  
  // Limpiar la referencia de espacios y caracteres especiales
  const cleanRef = referencia.trim().replace(/[^a-zA-Z0-9-]/g, '')
  
  // Normalizar el tipo para manejar tanto letras como texto completo
  const normalizedTipo = tipo?.toUpperCase()
  
  // Determinar el tipo real basado en el tipo normalizado
  let tipoReal = 'C' // Por defecto compra
  
  if (normalizedTipo === 'I' || normalizedTipo === 'INVERSOR') {
    tipoReal = 'I'
  } else if (normalizedTipo === 'D' || normalizedTipo === 'DEPOSITO VENTA' || normalizedTipo === 'DEPOSITO') {
    tipoReal = 'D'
  } else if (normalizedTipo === 'R' || normalizedTipo === 'COCHE R' || normalizedTipo === 'RENTING') {
    tipoReal = 'R'
  }
  
  switch (tipoReal) {
    case 'I': // Inversores
      // Si ya tiene I- al inicio, mantenerlo
      if (cleanRef.startsWith('I-')) {
        return cleanRef
      }
      // Si tiene I sin guión, agregar guión
      if (cleanRef.startsWith('I')) {
        return `I-${cleanRef.substring(1)}`
      }
      // Si es solo número, agregar I-
      return `I-${cleanRef}`
      
    case 'D': // Depósitos
      // Si ya tiene D- al inicio, mantenerlo
      if (cleanRef.startsWith('D-')) {
        return cleanRef
      }
      // Si tiene D sin guión, agregar guión
      if (cleanRef.startsWith('D')) {
        return `D-${cleanRef.substring(1)}`
      }
      // Si es solo número, agregar D-
      return `D-${cleanRef}`
      
    case 'R': // Renting
      // Si ya tiene R- al inicio, mantenerlo
      if (cleanRef.startsWith('R-')) {
        return cleanRef
      }
      // Si tiene R sin guión, agregar guión
      if (cleanRef.startsWith('R')) {
        return `R-${cleanRef.substring(1)}`
      }
      // Si es solo número, agregar R-
      return `R-${cleanRef}`
      
    default: // Compras (tipo C o cualquier otro)
      // Si ya tiene # al inicio, mantenerlo
      if (cleanRef.startsWith('#')) {
        return cleanRef
      }
      // Si es solo número, agregar #
      return `#${cleanRef}`
  }
}

// Función auxiliar para formatear números con separador de miles
function formatNumberWithThousands(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}
