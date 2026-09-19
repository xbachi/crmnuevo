import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import VehicleForm from '@/components/VehicleForm'

const rellenar = (id: string, value: string) =>
  fireEvent.change(document.getElementById(id) as HTMLElement, {
    target: { value },
  })

function renderForm(onSubmit = jest.fn().mockResolvedValue(undefined)) {
  const utils = render(
    <VehicleForm onSubmit={onSubmit} showInversorSection={false} />
  )
  rellenar('referencia', '#1088')
  rellenar('tipo', 'Compra')
  rellenar('marca', 'Opel')
  rellenar('modelo', 'Astra')
  rellenar('bastidor', 'W0L00000000000000')
  rellenar('kms', '1000')
  // Obligatorios del alta (src/lib/camposVehiculo.ts)
  rellenar('fechaCompra', '2026-01-15')
  rellenar('proveedor', 'Ayvens')
  rellenar('precioCompra', '9500')
  return { ...utils, onSubmit }
}

// El formulario avisa de lo que falta con alert(), que jsdom no implementa.
let avisos: string[] = []
beforeEach(() => {
  avisos = []
  jest
    .spyOn(window, 'alert')
    .mockImplementation((m?: unknown) => void avisos.push(String(m)))
})
afterEach(() => jest.restoreAllMocks())

describe('VehicleForm', () => {
  it('el checkbox marca matriculaExtranjera: true en el onSubmit', async () => {
    const { container, onSubmit } = renderForm()
    rellenar('matricula', 'ALEMANA')
    fireEvent.click(screen.getByLabelText('Matrícula extranjera'))
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      matricula: 'ALEMANA',
      matriculaExtranjera: true,
    })
  })

  it('sin marcar, matriculaExtranjera va en false', async () => {
    const { container, onSubmit } = renderForm()
    rellenar('matricula', '8061KRN')
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].matriculaExtranjera).toBe(false)
  })

  it('el blur normaliza la matrícula visible', () => {
    renderForm()
    const input = document.getElementById('matricula') as HTMLInputElement
    fireEvent.change(input, { target: { value: '8061 krn' } })
    fireEvent.blur(input)
    expect(input.value).toBe('8061KRN')
  })

  it('no envía si falta un campo obligatorio del alta y dice cuál', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    const { container } = render(
      <VehicleForm onSubmit={onSubmit} showInversorSection={false} />
    )
    rellenar('referencia', '#1088')
    rellenar('tipo', 'Compra')
    rellenar('marca', 'Opel')
    rellenar('modelo', 'Astra')
    rellenar('matricula', '8061KRN')
    rellenar('kms', '1000')
    rellenar('fechaCompra', '2026-01-15')
    // sin proveedor ni precio de compra
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    await waitFor(() => expect(avisos).toHaveLength(1))
    expect(avisos[0]).toContain('Proveedor')
    expect(avisos[0]).toContain('Precio de compra')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('el bastidor ya no bloquea: lo trae el permiso de circulación', async () => {
    const { container, onSubmit } = renderForm()
    rellenar('bastidor', '')
    rellenar('matricula', '8061KRN')
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })

  it('muestra errorMatricula bajo el input', () => {
    render(
      <VehicleForm
        onSubmit={jest.fn()}
        showInversorSection={false}
        errorMatricula="Matrícula 'X' no válida"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Matrícula 'X' no válida"
    )
  })
})
