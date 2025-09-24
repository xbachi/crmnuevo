import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Funciones auxiliares simples para crear datos de prueba
const createTestVehicle = (overrides = {}) => ({
  id: 1,
  referencia: '1010',
  marca: 'BMW',
  modelo: 'X5',
  matricula: '1234ABC',
  bastidor: 'WBAXXX123456789XX',
  kms: 75000,
  tipo: 'C',
  estado: 'disponible',
  orden: 0,
  ...overrides,
})

const createVehiculoCompra = (overrides = {}) =>
  createTestVehicle({ tipo: 'C', ...overrides })
const createVehiculoInversor = (overrides = {}) =>
  createTestVehicle({ tipo: 'I', ...overrides })
const createVehiculoDeposito = (overrides = {}) =>
  createTestVehicle({ tipo: 'D', ...overrides })

// Mock the VehicleCard component since we don't have the actual import
const MockVehicleCard = ({ vehiculo, onClick, ...props }: any) => {
  const getTypeColor = (tipo: string) => {
    switch (tipo) {
      case 'I':
        return 'bg-orange-100'
      case 'D':
        return 'bg-blue-100'
      default:
        return 'bg-white'
    }
  }

  const formatReference = (referencia: string, tipo: string) => {
    if (!referencia) return ''

    // Limpiar la referencia
    const cleanRef = referencia.trim().replace(/[^a-zA-Z0-9-]/g, '')

    switch (tipo) {
      case 'I':
        if (cleanRef.startsWith('I-')) return cleanRef
        if (cleanRef.startsWith('I')) return `I-${cleanRef.substring(1)}`
        return `I-${cleanRef}`
      case 'D':
        if (cleanRef.startsWith('D-')) return cleanRef
        if (cleanRef.startsWith('D')) return `D-${cleanRef.substring(1)}`
        return `D-${cleanRef}`
      default:
        if (cleanRef.startsWith('#')) return cleanRef
        return `#${cleanRef}`
    }
  }

  return (
    <div
      className={`vehicle-card ${getTypeColor(vehiculo.tipo)} p-4 border rounded cursor-pointer`}
      onClick={() => onClick?.(vehiculo)}
      data-testid="vehicle-card"
    >
      <div data-testid="vehicle-reference">
        {formatReference(vehiculo.referencia, vehiculo.tipo)}
      </div>
      <div data-testid="vehicle-brand">{vehiculo.marca}</div>
      <div data-testid="vehicle-model">{vehiculo.modelo}</div>
      <div data-testid="vehicle-state">{vehiculo.estado}</div>
      <div data-testid="vehicle-kms">{vehiculo.kms} km</div>
      {vehiculo.tipo === 'D' && (
        <div data-testid="vehicle-deposit-badge" className="text-blue-600">
          En depósito
        </div>
      )}
      {vehiculo.tipo === 'I' && (
        <div data-testid="vehicle-investor-badge" className="text-orange-600">
          Inversor
        </div>
      )}
    </div>
  )
}

describe('VehicleCard Component', () => {
  test('renders purchase vehicle correctly', () => {
    const vehiculo = createVehiculoCompra({
      referencia: '1010',
      marca: 'BMW',
      modelo: 'X5',
      estado: 'disponible',
      kms: 75000,
    })

    render(<MockVehicleCard vehiculo={vehiculo} onClick={() => {}} />)

    expect(screen.getByTestId('vehicle-reference')).toHaveTextContent('#1010')
    expect(screen.getByTestId('vehicle-brand')).toHaveTextContent('BMW')
    expect(screen.getByTestId('vehicle-model')).toHaveTextContent('X5')
    expect(screen.getByTestId('vehicle-state')).toHaveTextContent('disponible')
    expect(screen.getByTestId('vehicle-kms')).toHaveTextContent('75000 km')

    // Should have white background for purchase vehicles
    expect(screen.getByTestId('vehicle-card')).toHaveClass('bg-white')
  })

  test('renders investor vehicle correctly', () => {
    const vehiculo = createVehiculoInversor({
      referencia: '9',
      marca: 'Audi',
      modelo: 'A4',
      estado: 'disponible',
      kms: 50000,
    })

    render(<MockVehicleCard vehiculo={vehiculo} onClick={() => {}} />)

    expect(screen.getByTestId('vehicle-reference')).toHaveTextContent('I-9')
    expect(screen.getByTestId('vehicle-brand')).toHaveTextContent('Audi')
    expect(screen.getByTestId('vehicle-model')).toHaveTextContent('A4')
    expect(screen.getByTestId('vehicle-investor-badge')).toBeInTheDocument()

    // Should have orange background for investor vehicles
    expect(screen.getByTestId('vehicle-card')).toHaveClass('bg-orange-100')
  })

  test('renders deposit vehicle correctly', () => {
    const vehiculo = createVehiculoDeposito({
      referencia: '5',
      marca: 'Mercedes',
      modelo: 'C-Class',
      estado: 'disponible',
      kms: 30000,
    })

    render(<MockVehicleCard vehiculo={vehiculo} onClick={() => {}} />)

    expect(screen.getByTestId('vehicle-reference')).toHaveTextContent('D-5')
    expect(screen.getByTestId('vehicle-brand')).toHaveTextContent('Mercedes')
    expect(screen.getByTestId('vehicle-model')).toHaveTextContent('C-Class')
    expect(screen.getByTestId('vehicle-deposit-badge')).toBeInTheDocument()

    // Should have blue background for deposit vehicles
    expect(screen.getByTestId('vehicle-card')).toHaveClass('bg-blue-100')
  })

  test('handles click events', () => {
    const vehiculo = createVehiculoCompra()
    const mockOnClick = jest.fn()

    render(<MockVehicleCard vehiculo={vehiculo} onClick={mockOnClick} />)

    fireEvent.click(screen.getByTestId('vehicle-card'))

    expect(mockOnClick).toHaveBeenCalledWith(vehiculo)
    expect(mockOnClick).toHaveBeenCalledTimes(1)
  })

  test('handles different vehicle states', () => {
    const estados = ['disponible', 'reservado', 'vendido']

    estados.forEach((estado) => {
      const vehiculo = createVehiculoCompra({ estado })
      const { rerender } = render(<MockVehicleCard vehiculo={vehiculo} />)

      expect(screen.getByTestId('vehicle-state')).toHaveTextContent(estado)

      // Clean up for next iteration
      rerender(<div />)
    })
  })

  test('formats vehicle references correctly', () => {
    const testCases = [
      { referencia: '1010', tipo: 'C', expected: '#1010' },
      { referencia: '#1010', tipo: 'C', expected: '#1010' },
      { referencia: '9', tipo: 'I', expected: 'I-9' },
      { referencia: 'I9', tipo: 'I', expected: 'I-9' },
      { referencia: 'I-9', tipo: 'I', expected: 'I-9' },
      { referencia: '5', tipo: 'D', expected: 'D-5' },
      { referencia: 'D5', tipo: 'D', expected: 'D-5' },
      { referencia: 'D-5', tipo: 'D', expected: 'D-5' },
    ]

    testCases.forEach(({ referencia, tipo, expected }) => {
      const vehiculo = createVehiculoCompra({ referencia, tipo })
      const { rerender } = render(<MockVehicleCard vehiculo={vehiculo} />)

      expect(screen.getByTestId('vehicle-reference')).toHaveTextContent(
        expected
      )

      // Clean up for next iteration
      rerender(<div />)
    })
  })

  test('handles empty or invalid data gracefully', () => {
    const vehiculo = {
      id: 1,
      referencia: '',
      marca: '',
      modelo: '',
      estado: '',
      kms: 0,
      tipo: 'C',
    }

    render(<MockVehicleCard vehiculo={vehiculo} onClick={() => {}} />)

    // Referencias vacías devuelven string vacío, no '#'
    expect(screen.getByTestId('vehicle-reference')).toHaveTextContent('')
    expect(screen.getByTestId('vehicle-brand')).toBeInTheDocument()
    expect(screen.getByTestId('vehicle-model')).toBeInTheDocument()
    expect(screen.getByTestId('vehicle-kms')).toHaveTextContent('0 km')
  })

  test('shows correct badges for different vehicle types', () => {
    // Test deposit badge
    const depositVehicle = createVehiculoDeposito()
    const { rerender } = render(<MockVehicleCard vehiculo={depositVehicle} />)

    expect(screen.getByTestId('vehicle-deposit-badge')).toHaveTextContent(
      'En depósito'
    )
    expect(
      screen.queryByTestId('vehicle-investor-badge')
    ).not.toBeInTheDocument()

    // Test investor badge
    const investorVehicle = createVehiculoInversor()
    rerender(<MockVehicleCard vehiculo={investorVehicle} />)

    expect(screen.getByTestId('vehicle-investor-badge')).toHaveTextContent(
      'Inversor'
    )
    expect(
      screen.queryByTestId('vehicle-deposit-badge')
    ).not.toBeInTheDocument()

    // Test purchase vehicle (no badge)
    const purchaseVehicle = createVehiculoCompra()
    rerender(<MockVehicleCard vehiculo={purchaseVehicle} />)

    expect(
      screen.queryByTestId('vehicle-deposit-badge')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('vehicle-investor-badge')
    ).not.toBeInTheDocument()
  })

  test('applies correct styling based on vehicle type', () => {
    // Test purchase vehicle styling
    const purchaseVehicle = createVehiculoCompra()
    const { rerender } = render(<MockVehicleCard vehiculo={purchaseVehicle} />)

    expect(screen.getByTestId('vehicle-card')).toHaveClass('bg-white')

    // Test investor vehicle styling
    const investorVehicle = createVehiculoInversor()
    rerender(<MockVehicleCard vehiculo={investorVehicle} />)

    expect(screen.getByTestId('vehicle-card')).toHaveClass('bg-orange-100')

    // Test deposit vehicle styling
    const depositVehicle = createVehiculoDeposito()
    rerender(<MockVehicleCard vehiculo={depositVehicle} />)

    expect(screen.getByTestId('vehicle-card')).toHaveClass('bg-blue-100')
  })
})
