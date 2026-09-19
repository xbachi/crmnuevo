import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import VehiculoAutomatizacionesCard from '@/components/VehiculoAutomatizacionesCard'

/**
 * Tarjeta «Web y carteles»: estado de la PC, Simular encola en modo simular,
 * y una simulación ok reciente ofrece «Aplicar» (con confirmación) que manda
 * simulacion_id. Los coches que no van a Base_Datos no la ven.
 */

type Llamada = { url: string; init?: RequestInit }

function mockFetch(getBody: () => unknown, llamadas: Llamada[] = []) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init })
    const body =
      init?.method === 'POST'
        ? { trabajo: { id: 99, estado: 'pendiente' } }
        : getBody()
    return { ok: true, status: 200, json: async () => body }
  }) as unknown as typeof fetch
  return llamadas
}

const SIM_OK = {
  id: 40,
  vehiculo_id: 7,
  referencia: '#1088',
  matricula: '6913MDM',
  tipo: 'cambio_precio',
  modo: 'simular',
  simulacion_id: null,
  estado: 'ok',
  rc: 0,
  salida: 'precio 13.205\nPARA VERIFICAR: cuota\nfin',
  para_verificar: ['PARA VERIFICAR: cuota'],
  url: 'https://sevencars.es/?p=9',
  creado_por: 1,
  worker: 'pc-seb',
  created_at: new Date().toISOString(),
  expira_at: null,
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
}

const WORKER_ACTIVO = {
  nombre: 'pc-seb',
  last_seen: new Date().toISOString(),
  version: 'v1',
  hace_s: 5,
  activo: true,
}

function renderCard(tipoVehiculo = 'C', puedeAplicar = true) {
  const showToast = jest.fn()
  render(
    <VehiculoAutomatizacionesCard
      vehiculoId={7}
      tipoVehiculo={tipoVehiculo}
      puedeAplicar={puedeAplicar}
      showToast={showToast}
    />
  )
  return showToast
}

beforeEach(() => jest.clearAllMocks())

describe('VehiculoAutomatizacionesCard', () => {
  it('muestra el título, la PC activa y las acciones', async () => {
    mockFetch(() => ({ trabajos: [], worker: WORKER_ACTIVO }))
    renderCard()
    expect(
      screen.getByText('Web y carteles (automatizaciones)')
    ).toBeInTheDocument()
    expect(await screen.findByText('PC: activa')).toBeInTheDocument()
    expect(
      screen.getByText(/toma el precio de la hoja Base_Datos/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Simular Cambiar precio' })
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Ejecutar Carteles' })
    ).toBeEnabled()
  })

  it('PC apagada o nunca conectada', async () => {
    mockFetch(() => ({
      trabajos: [],
      worker: { ...WORKER_ACTIVO, activo: false, hace_s: 3 * 3600 },
    }))
    renderCard()
    expect(
      await screen.findByText('PC apagada — última señal hace 3 h')
    ).toBeInTheDocument()
  })

  it('«La PC todavía no se conectó» sin latidos', async () => {
    mockFetch(() => ({
      trabajos: [],
      worker: {
        nombre: null,
        last_seen: null,
        version: null,
        hace_s: null,
        activo: false,
      },
    }))
    renderCard()
    expect(
      await screen.findByText('La PC todavía no se conectó')
    ).toBeInTheDocument()
  })

  it('Simular encola {tipo, modo: simular}', async () => {
    const llamadas = mockFetch(() => ({ trabajos: [], worker: WORKER_ACTIVO }))
    renderCard()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Simular Cambiar precio' })
    )
    await waitFor(() =>
      expect(llamadas.some((l) => l.init?.method === 'POST')).toBe(true)
    )
    const postCall = llamadas.find((l) => l.init?.method === 'POST')!
    expect(postCall.url).toBe('/api/vehiculos/7/automatizaciones')
    expect(JSON.parse(String(postCall.init?.body))).toEqual({
      tipo: 'cambio_precio',
      modo: 'simular',
    })
  })

  it('una simulación ok reciente ofrece Aplicar, que confirma y manda simulacion_id', async () => {
    const llamadas = mockFetch(() => ({
      trabajos: [SIM_OK],
      worker: WORKER_ACTIVO,
    }))
    renderCard()
    const aplicar = await screen.findByRole('button', { name: 'Aplicar' })
    expect(aplicar).toBeEnabled()
    expect(screen.getByText('1 para verificar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir enlace' })).toHaveAttribute(
      'href',
      'https://sevencars.es/?p=9'
    )

    fireEvent.click(aplicar)
    expect(llamadas.some((l) => l.init?.method === 'POST')).toBe(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, aplicar' }))
    await waitFor(() =>
      expect(llamadas.some((l) => l.init?.method === 'POST')).toBe(true)
    )
    const postCall = llamadas.find((l) => l.init?.method === 'POST')!
    expect(JSON.parse(String(postCall.init?.body))).toEqual({
      tipo: 'cambio_precio',
      modo: 'aplicar',
      simulacion_id: 40,
    })
  })

  it('sin Aplicar si la simulación es vieja o ya se usó', async () => {
    const vieja = {
      ...SIM_OK,
      finished_at: new Date(Date.now() - 31 * 60_000).toISOString(),
    }
    const usada = {
      ...SIM_OK,
      id: 41,
      modo: 'aplicar',
      simulacion_id: 40,
      estado: 'ok',
    }
    mockFetch(() => ({ trabajos: [vieja], worker: WORKER_ACTIVO }))
    const { unmount } = render(
      <VehiculoAutomatizacionesCard
        vehiculoId={7}
        tipoVehiculo="C"
        puedeAplicar
        showToast={jest.fn()}
      />
    )
    await screen.findByText('Ver salida')
    expect(screen.queryByRole('button', { name: 'Aplicar' })).toBeNull()
    unmount()

    mockFetch(() => ({ trabajos: [usada, SIM_OK], worker: WORKER_ACTIVO }))
    renderCard()
    await screen.findAllByText('Ver salida')
    expect(screen.queryByRole('button', { name: 'Aplicar' })).toBeNull()
  })

  it('Ver salida resalta las líneas PARA VERIFICAR', async () => {
    mockFetch(() => ({ trabajos: [SIM_OK], worker: WORKER_ACTIVO }))
    renderCard()
    fireEvent.click(await screen.findByText('Ver salida'))
    const linea = screen
      .getAllByText('PARA VERIFICAR: cuota')
      .find((el) => el.tagName === 'SPAN')!
    expect(linea).toHaveClass('bg-amber-300')
  })

  it('no-admin: Ejecutar y Aplicar deshabilitados', async () => {
    mockFetch(() => ({ trabajos: [SIM_OK], worker: WORKER_ACTIVO }))
    renderCard('C', false)
    expect(
      await screen.findByRole('button', { name: 'Aplicar' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Ejecutar Bajar ficha' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Simular Cambiar fotos' })
    ).toBeEnabled()
  })

  it('no se muestra para coches que no van a Base_Datos (R, M)', () => {
    mockFetch(() => ({ trabajos: [], worker: WORKER_ACTIVO }))
    renderCard('R')
    renderCard('M')
    expect(screen.queryByText('Web y carteles (automatizaciones)')).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
