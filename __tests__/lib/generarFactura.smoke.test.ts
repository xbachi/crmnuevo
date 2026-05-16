/**
 * @jest-environment node
 *
 * Smoke test del generador de facturas. NO valida visualmente (eso lo hace
 * el QA manual abriendo el PDF) — sólo garantiza que:
 *  1) El módulo importa sin romper en jest-jsdom.
 *  2) generarFactura devuelve un Uint8Array no-vacío.
 *  3) El buffer empieza con la signature %PDF- y termina con %%EOF.
 *  4) Funciona tanto IVA como REBU.
 *  5) No crashea con campos opcionales ausentes.
 *
 * El logo se carga via addLogoToContract; si /public/logocontrato.png no
 * está accesible en jsdom, el helper tiene fallback de texto (lo que ya
 * hace en producción) — el test no debe romper por eso.
 */

import { generarFactura } from '@/lib/contractGenerator'

const baseDeal = {
  id: 999,
  numero: 'TEST-999',
  cliente: {
    nombre: 'Juan',
    apellidos: 'Pérez',
    dni: '12345678A',
    email: 'juan@example.com',
    telefono: '600111222',
  },
  vehiculo: {
    marca: 'Toyota',
    modelo: 'Yaris',
    matricula: '1234 ABC',
    bastidor: 'JT123456789012345',
    precioPublicacion: 12100,
    año: 2018,
    fechaMatriculacion: '2018-05-10',
  },
  importeTotal: 12100,
  importeSena: 0,
} as unknown as Parameters<typeof generarFactura>[0]

function assertValidPdf(buf: Uint8Array) {
  expect(buf).toBeInstanceOf(Uint8Array)
  expect(buf.byteLength).toBeGreaterThan(2000)
  // Header
  const head = String.fromCharCode(...buf.slice(0, 5))
  expect(head).toBe('%PDF-')
  // EOF (last few bytes can vary; check that %%EOF appears near the end).
  const tail = String.fromCharCode(...buf.slice(-32))
  expect(tail).toMatch(/%%EOF\s*$/)
}

describe('generarFactura (smoke)', () => {
  it('produce un PDF válido para tipoFactura=IVA', async () => {
    const buf = await generarFactura(baseDeal, 'IVA', 'F-2026-TEST')
    assertValidPdf(buf)
  })

  it('produce un PDF válido para tipoFactura=REBU', async () => {
    const buf = await generarFactura(baseDeal, 'REBU', 'R-2026-TEST')
    assertValidPdf(buf)
  })

  it('no crashea cuando faltan campos opcionales del cliente/vehículo', async () => {
    const sparse = {
      ...baseDeal,
      cliente: { nombre: 'Sin', apellidos: 'Datos' },
      vehiculo: {
        marca: 'Marca',
        modelo: 'Modelo',
        matricula: 'X',
        bastidor: 'Y',
      },
      importeTotal: 5000,
    } as unknown as Parameters<typeof generarFactura>[0]
    const buf = await generarFactura(sparse, 'IVA')
    assertValidPdf(buf)
  })
})
