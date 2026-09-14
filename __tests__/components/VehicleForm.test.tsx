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
  return { ...utils, onSubmit }
}

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
