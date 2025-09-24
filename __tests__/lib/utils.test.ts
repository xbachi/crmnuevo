import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatVehicleReference,
  formatVehicleReferenceShort,
  formatPercentage,
  generateVehicleSlug,
} from '@/lib/utils'

describe('formatCurrency', () => {
  test('formats basic currency amounts', () => {
    expect(formatCurrency(1000)).toBe('1.000€')
    expect(formatCurrency(15000)).toBe('15.000€')
    expect(formatCurrency(1234567)).toBe('1.234.567€')
  })

  test('handles decimal amounts', () => {
    expect(formatCurrency(1000.5)).toBe('1.000,50€')
    expect(formatCurrency(15000.99)).toBe('15.000,99€')
  })

  test('handles zero and negative amounts', () => {
    expect(formatCurrency(0)).toBe('0€')
    expect(formatCurrency(-1000)).toBe('-1.000€')
  })

  test('handles null and undefined', () => {
    expect(formatCurrency(null as any)).toBe('0€')
    expect(formatCurrency(undefined as any)).toBe('0€')
  })
})

describe('formatDate', () => {
  test('formats date strings correctly', () => {
    const date = '2025-01-17'
    const result = formatDate(date)
    expect(result).toMatch(/\d{1,2} de \w+ de \d{4}/)
  })

  test('handles invalid dates gracefully', () => {
    const result = formatDate('invalid-date')
    expect(result).toContain('Invalid Date')
  })
})

describe('formatDateTime', () => {
  test('formats datetime strings correctly', () => {
    const date = '2025-01-17T15:30:00Z'
    const result = formatDateTime(date)
    expect(result).toMatch(/\d{1,2} de \w+ de \d{4}, \d{1,2}:\d{2}/)
  })

  test('handles invalid dates gracefully', () => {
    const result = formatDateTime('invalid-date')
    expect(result).toContain('Invalid Date')
  })
})

describe('formatVehicleReference', () => {
  test('formats purchase vehicle references', () => {
    expect(formatVehicleReference('1010', 'C')).toBe('#1010')
    expect(formatVehicleReference('1010', 'Compra')).toBe('#1010')
    expect(formatVehicleReference('#1010', 'C')).toBe('#1010')
  })

  test('formats investor vehicle references', () => {
    expect(formatVehicleReference('9', 'I')).toBe('I-9')
    expect(formatVehicleReference('9', 'Inversor')).toBe('I-9')
    expect(formatVehicleReference('I9', 'I')).toBe('I-9')
    expect(formatVehicleReference('I-9', 'I')).toBe('I-9')
  })

  test('formats deposit vehicle references', () => {
    expect(formatVehicleReference('5', 'D')).toBe('D-5')
    expect(formatVehicleReference('5', 'Deposito')).toBe('D-5')
    expect(formatVehicleReference('5', 'Deposito Venta')).toBe('D-5')
    expect(formatVehicleReference('D5', 'D')).toBe('D-5')
    expect(formatVehicleReference('D-5', 'D')).toBe('D-5')
  })

  test('formats rental vehicle references', () => {
    expect(formatVehicleReference('3', 'R')).toBe('R-3')
    expect(formatVehicleReference('3', 'Coche R')).toBe('R-3')
    expect(formatVehicleReference('R3', 'R')).toBe('R-3')
    expect(formatVehicleReference('R-3', 'R')).toBe('R-3')
  })

  test('handles unknown types', () => {
    // Por defecto, tipos desconocidos se tratan como compra (C) y agregan #
    expect(formatVehicleReference('123', 'UNKNOWN')).toBe('#123')
    expect(formatVehicleReference('123', '')).toBe('#123')
    expect(formatVehicleReference('123', undefined)).toBe('#123')
  })

  test('prevents duplicate prefixes correctly', () => {
    // Evitar duplicar prefijos
    expect(formatVehicleReference('I9', 'I')).toBe('I-9')
    expect(formatVehicleReference('i9', 'I')).toBe('I-9')
    expect(formatVehicleReference('I-9', 'I')).toBe('I-9')
    expect(formatVehicleReference('#1010', 'C')).toBe('#1010')
    expect(formatVehicleReference('D-5', 'D')).toBe('D-5')
    expect(formatVehicleReference('R3', 'R')).toBe('R-3')
  })

  test('handles empty references', () => {
    expect(formatVehicleReference('', 'C')).toBe('')
    expect(formatVehicleReference(null, 'C')).toBe('')
    expect(formatVehicleReference(undefined, 'C')).toBe('')
  })
})

describe('formatVehicleReferenceShort', () => {
  test('formats short references for dashboard correctly', () => {
    // Compras: # + últimos 2 dígitos
    expect(formatVehicleReferenceShort('1010', 'C')).toBe('#10')
    expect(formatVehicleReferenceShort('12345', 'C')).toBe('#45')
    expect(formatVehicleReferenceShort('9', 'C')).toBe('#9')

    // Inversores: I- + último dígito
    expect(formatVehicleReferenceShort('9', 'I')).toBe('I-9')
    expect(formatVehicleReferenceShort('123', 'I')).toBe('I-3')

    // Depósitos: D- + último dígito
    expect(formatVehicleReferenceShort('456', 'D')).toBe('D-6')

    // Renting: R- + último dígito
    expect(formatVehicleReferenceShort('789', 'R')).toBe('R-9')
  })
})

describe('generateVehicleSlug', () => {
  test('generates correct slug format with clean reference', () => {
    const vehiculo = { referencia: '1037', marca: 'Ford', modelo: 'Puma' }
    expect(generateVehicleSlug(vehiculo)).toBe('1037-ford-puma')
  })

  test('handles references with prefixes', () => {
    const vehiculo1 = { referencia: '#1234', marca: 'BMW', modelo: 'X5' }
    expect(generateVehicleSlug(vehiculo1)).toBe('1234-bmw-x5')

    const vehiculo2 = { referencia: 'I-567', marca: 'Audi', modelo: 'A4' }
    expect(generateVehicleSlug(vehiculo2)).toBe('567-audi-a4')

    const vehiculo3 = { referencia: 'D-890', marca: 'Tesla', modelo: 'Model 3' }
    expect(generateVehicleSlug(vehiculo3)).toBe('890-tesla-model3')
  })

  test('handles special characters and spaces', () => {
    const vehiculo = { referencia: 'R-123', marca: 'BMW X', modelo: 'Serie 3' }
    expect(generateVehicleSlug(vehiculo)).toBe('123-bmwx-serie3')
  })

  test('handles accents and symbols', () => {
    const vehiculo = {
      referencia: '#456',
      marca: 'Citroën',
      modelo: 'C4 Picasso',
    }
    expect(generateVehicleSlug(vehiculo)).toBe('456-citron-c4picasso')
  })

  test('handles numbers and mixed case', () => {
    const vehiculo = { referencia: '789', marca: 'Audi', modelo: 'A4 2.0' }
    expect(generateVehicleSlug(vehiculo)).toBe('789-audi-a420')
  })
})

describe('formatPercentage', () => {
  test('formats percentages correctly', () => {
    expect(formatPercentage(10)).toBe('10.0%')
    expect(formatPercentage(50.5)).toBe('50.5%')
    expect(formatPercentage(0)).toBe('0.0%')
    expect(formatPercentage(100)).toBe('100.0%')
  })

  test('handles decimal precision', () => {
    expect(formatPercentage(10.123)).toBe('10.1%')
    expect(formatPercentage(50.567)).toBe('50.6%')
  })
})
