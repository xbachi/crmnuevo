import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import PresupuestoTabla from '@/components/presupuesto/PresupuestoTabla'
import { calcularPresupuesto } from '@/lib/presupuesto/calculo'
import {
  OPCIONES_DEFECTO,
  PARAMETROS_DEFECTO,
  type OpcionesPresupuesto,
  type TarifaCalculo,
} from '@/lib/presupuesto/tipos'

const T899: TarifaCalculo = {
  id: 1,
  nombre: '8,99 ATENEA sept-2026',
  coeficientes: {
    '120': 0.01476,
    '108': 0.0155,
    '96': 0.016501,
    '84': 0.017863,
    '72': 0.019758,
    '60': 0.022494,
    '48': 0.026691,
    '36': 0.033799,
  },
}
const T999: TarifaCalculo = {
  id: 2,
  nombre: '9,99 DIC-2022',
  coeficientes: {
    '120': 0.0151,
    '108': 0.016,
    '96': 0.0171,
    '84': 0.0186,
    '72': 0.021,
    '60': 0.024,
    '48': 0.028,
    '36': 0.035,
    '24': 0.05,
  },
}

function tesla(opciones: Partial<OpcionesPresupuesto> = {}) {
  return calcularPresupuesto({
    vehiculo: {
      precio_contado: 32985,
      tarifa_financiacion: 'NORMAL',
      gp: 990,
      fecha_matriculacion: '2023-05-05',
      meses_garantia_fabrica: null,
    },
    opciones: { ...OPCIONES_DEFECTO, ...opciones },
    params: PARAMETROS_DEFECTO,
    tarifaPremium: T899,
    tarifaSinPremium: T999,
    hoy: '2026-09-14',
  })
}

describe('PresupuestoTabla', () => {
  it('renderiza las dos columnas con los totales del Tesla', () => {
    render(<PresupuestoTabla calculo={tesla()} />)
    expect(
      screen.getByRole('heading', { name: 'Sin Garantía Premium' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Con Garantía Premium' })
    ).toBeInTheDocument()
    expect(screen.getByText('31.975,00 €')).toBeInTheDocument()
    expect(screen.getByText('32.965,00 €')).toBeInTheDocument()
    expect(screen.getAllByText('Importe a Financiar')).toHaveLength(2)
  })

  it('oculta las líneas no visibles y muestra las de texto sin importe', () => {
    render(<PresupuestoTabla calculo={tesla()} />)
    expect(screen.queryByText('Entrega Vehículo')).not.toBeInTheDocument()
    expect(screen.queryByText('Entrada')).not.toBeInTheDocument()
    expect(screen.getByText('12 meses Garantía Estándar')).toBeInTheDocument()
  })

  it('muestra "Desde 483 €/mes" en la columna sin premium', () => {
    render(<PresupuestoTabla calculo={tesla()} />)
    expect(screen.getAllByText('Desde')).toHaveLength(2)
    expect(screen.getAllByText('483 €/mes').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('487 €/mes').length).toBeGreaterThanOrEqual(1)
  })

  it('muestra "—" cuando la tarifa no tiene coeficiente para el plazo', () => {
    render(<PresupuestoTabla calculo={tesla({ modoPlazo: 'CORTO' })} />)
    expect(screen.getAllByText('24 meses')).toHaveLength(2)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('sin financiar no pinta cuotas ni "Desde"', () => {
    render(<PresupuestoTabla calculo={tesla({ financia: false })} />)
    expect(screen.queryByText('Desde')).not.toBeInTheDocument()
    expect(screen.queryByText('120 meses')).not.toBeInTheDocument()
    expect(screen.getAllByText('Total')).toHaveLength(2)
  })

  it('el aviso FINANCIA MÁS 70% es interno: se oculta en modo público', () => {
    const c = tesla()
    expect(c.avisos).toContain('FINANCIA MÁS 70%')
    const { unmount } = render(<PresupuestoTabla calculo={c} />)
    expect(screen.getByText('FINANCIA MÁS 70%')).toBeInTheDocument()
    unmount()
    render(<PresupuestoTabla calculo={c} publico />)
    expect(screen.queryByText('FINANCIA MÁS 70%')).not.toBeInTheDocument()
  })
})
