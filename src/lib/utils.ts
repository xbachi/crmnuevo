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

// Función auxiliar para formatear números con separador de miles
function formatNumberWithThousands(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}
