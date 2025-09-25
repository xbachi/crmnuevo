export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Fecha inválida'

  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}

// Función helper para obtener el año del vehículo
export function getVehiculoAño(vehiculo: any): number | null {
  // Si ya tiene año, usarlo
  if (vehiculo?.año && vehiculo.año > 0) {
    return vehiculo.año
  }

  // Si tiene fecha de matriculación, extraer el año
  if (vehiculo?.fechaMatriculacion) {
    const fecha = new Date(vehiculo.fechaMatriculacion)
    if (!isNaN(fecha.getTime())) {
      return fecha.getFullYear()
    }
  }

  return null
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCurrency(amount: number): string {
  if (amount == null || amount === 0) return '0€'

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
    const decimalPart = parts[1]
      ? ',' + parts[1].padEnd(2, '0').substring(0, 2)
      : ''
    return `${integerPart}${decimalPart}€`
  }
}

export function formatVehicleReference(
  referencia: string,
  tipo: string
): string {
  if (!referencia) return ''

  // Limpiar la referencia de espacios y caracteres especiales, mantener solo alfanuméricos y guiones
  const cleanRef = referencia
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toUpperCase()

  // Normalizar el tipo para manejar tanto letras como texto completo
  const normalizedTipo = tipo?.toUpperCase()

  // Determinar el tipo real basado en el tipo normalizado
  let tipoReal = 'C' // Por defecto compra

  if (normalizedTipo === 'I' || normalizedTipo === 'INVERSOR') {
    tipoReal = 'I'
  } else if (
    normalizedTipo === 'D' ||
    normalizedTipo === 'DEPOSITO VENTA' ||
    normalizedTipo === 'DEPOSITO'
  ) {
    tipoReal = 'D'
  } else if (
    normalizedTipo === 'R' ||
    normalizedTipo === 'COCHE R' ||
    normalizedTipo === 'RENTING'
  ) {
    tipoReal = 'R'
  }

  switch (tipoReal) {
    case 'I': // Inversores: I-XXXX
      // Si ya tiene I- al inicio, mantenerlo
      if (cleanRef.startsWith('I-')) {
        return cleanRef
      }
      // Si tiene I sin guión, extraer el número y agregar guión
      if (cleanRef.startsWith('I')) {
        const numero = cleanRef.substring(1)
        return numero ? `I-${numero}` : 'I-'
      }
      // Si es solo número, agregar I-
      return `I-${cleanRef}`

    case 'D': // Depósitos: D-XXXX
      // Si ya tiene D- al inicio, mantenerlo
      if (cleanRef.startsWith('D-')) {
        return cleanRef
      }
      // Si tiene D sin guión, extraer el número y agregar guión
      if (cleanRef.startsWith('D')) {
        const numero = cleanRef.substring(1)
        return numero ? `D-${numero}` : 'D-'
      }
      // Si es solo número, agregar D-
      return `D-${cleanRef}`

    case 'R': // Renting: R-XXXX
      // Si ya tiene R- al inicio, mantenerlo
      if (cleanRef.startsWith('R-')) {
        return cleanRef
      }
      // Si tiene R sin guión, extraer el número y agregar guión
      if (cleanRef.startsWith('R')) {
        const numero = cleanRef.substring(1)
        return numero ? `R-${numero}` : 'R-'
      }
      // Si es solo número, agregar R-
      return `R-${cleanRef}`

    default: // Compras: #XXXX
      // Si ya tiene # al inicio, mantenerlo sin duplicar
      if (cleanRef.startsWith('#')) {
        return cleanRef
      }
      // Si es solo número, agregar un solo #
      return `#${cleanRef}`
  }
}

// Función para referencias cortas en dashboard y espacios reducidos
export function formatVehicleReferenceShort(
  referencia: string,
  tipo: string
): string {
  const fullRef = formatVehicleReference(referencia, tipo)
  if (!fullRef) return ''

  const normalizedTipo = tipo?.toUpperCase()

  // Para compras: solo # + últimos 2 dígitos
  if (
    normalizedTipo === 'C' ||
    normalizedTipo === 'COMPRA' ||
    !normalizedTipo
  ) {
    // Extraer números del final
    const numbers = fullRef.replace(/[^0-9]/g, '')
    if (numbers.length >= 2) {
      return `#${numbers.slice(-2)}`
    }
    return fullRef
  }

  // Para otros tipos: LETRA-últimos dígitos (máximo 5 caracteres)
  if (fullRef.includes('-')) {
    const [prefix, suffix] = fullRef.split('-')
    if (suffix && suffix.length > 2) {
      return `${prefix}-${suffix.slice(-1)}`
    }
    return fullRef
  }

  return fullRef
}

// Función auxiliar para formatear números con separador de miles
function formatNumberWithThousands(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}

// Función para generar el slug del vehículo
export function generateVehicleSlug(vehiculo: {
  id: number
  marca: string
  modelo: string
}): string {
  // Usar ID + marca + modelo (formato simple)
  const cleanMarca = vehiculo.marca.toLowerCase().replace(/[^a-z0-9]/g, '')
  const cleanModelo = vehiculo.modelo.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${vehiculo.id}-${cleanMarca}-${cleanModelo}`
}

// Función para generar el slug del cliente
export function generateClienteSlug(cliente: {
  id: number
  nombre: string
  apellidos: string
}): string {
  const cleanNombre = cliente.nombre.toLowerCase().replace(/[^a-z0-9]/g, '')
  const cleanApellidos = cliente.apellidos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return `${cliente.id}-${cleanNombre}-${cleanApellidos}`
}

// Función para generar el slug del inversor
export function generateInversorSlug(inversor: {
  id: number
  nombre: string
  apellidos?: string
}): string {
  const cleanNombre = inversor.nombre.toLowerCase().replace(/[^a-z0-9]/g, '')
  const cleanApellidos = inversor.apellidos
    ? inversor.apellidos.toLowerCase().replace(/[^a-z0-9]/g, '')
    : ''

  return `${inversor.id}-${cleanNombre}${cleanApellidos ? `-${cleanApellidos}` : ''}`
}
