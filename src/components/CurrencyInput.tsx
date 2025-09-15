'use client'

import { useState, useEffect } from 'react'

interface CurrencyInputProps {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  className?: string
  name?: string
  disabled?: boolean
}

export default function CurrencyInput({ 
  value, 
  onChange, 
  placeholder = "0", 
  className = "",
  name,
  disabled = false
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('')

  useEffect(() => {
    if (value === 0) {
      setDisplayValue('')
    } else {
      // Formatear con separador de miles (punto) y decimales (coma)
      if (Number.isInteger(value)) {
        // Números enteros: solo separador de miles
        setDisplayValue(value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
      } else {
        // Números con decimales: separador de miles y coma para decimales
        const parts = value.toString().split('.')
        const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
        const decimalPart = parts[1] ? ',' + parts[1] : ''
        setDisplayValue(integerPart + decimalPart)
      }
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    
    // Permitir solo números, comas y puntos
    const cleanValue = inputValue.replace(/[^\d,]/g, '')
    
    // Reemplazar coma por punto para el cálculo
    const normalizedValue = cleanValue.replace(',', '.')
    
    // Convertir a número
    const numValue = parseFloat(normalizedValue) || 0
    
    // Actualizar el valor numérico
    onChange(numValue)
    
    // Actualizar el display con formato de miles
    if (numValue === 0) {
      setDisplayValue('')
    } else {
      setDisplayValue(cleanValue)
    }
  }

  const handleBlur = () => {
    // Al perder el foco, formatear correctamente
    if (value > 0) {
      if (Number.isInteger(value)) {
        // Números enteros: solo separador de miles
        setDisplayValue(value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
      } else {
        // Números con decimales: separador de miles y coma para decimales
        const parts = value.toString().split('.')
        const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
        const decimalPart = parts[1] ? ',' + parts[1] : ''
        setDisplayValue(integerPart + decimalPart)
      }
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''} ${className}`}
      />
      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
        <span className="text-gray-500 text-sm">€</span>
      </div>
    </div>
  )
}
