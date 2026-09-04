/**
 * @jest-environment node
 *
 * Smoke test del mandato de gestoría (patrón de generarFactura.smoke): no
 * valida el layout, solo que el generador no lanza con datos completos ni con
 * datos mínimos y que devuelve un PDF real (> 1 KB, firma %PDF- y %%EOF).
 */

import { generarMandatoGestoria } from '@/lib/contractGenerator'

type Deal = Parameters<typeof generarMandatoGestoria>[0]

const dealCompleto: Deal = {
  numero: 'RES-2026-000123',
  fechaCreacion: new Date('2026-08-20T10:00:00Z'),
  fechaVentaFirmada: '2026-09-01T09:30:00Z',
  cliente: {
    nombre: 'juan',
    apellidos: 'pérez garcía',
    dni: '12345678A',
    telefono: '600111222',
    email: 'juan@example.com',
    calle: 'C/ Mayor 12, 3ºB',
    ciudad: 'Alaquàs',
    provincia: 'Valencia',
    codPostal: '46970',
  },
  vehiculo: {
    marca: 'toyota',
    modelo: 'yaris',
    matricula: '1234 abc',
    bastidor: 'JT123456789012345',
    kms: 85400,
    fechaMatriculacion: '2018-05-10',
  },
  importeTotal: 12100,
}

const dealMinimo = {
  numero: 'RES-2026-000124',
  fechaCreacion: new Date(),
} as unknown as Deal

function assertValidPdf(buf: Uint8Array) {
  expect(buf).toBeInstanceOf(Uint8Array)
  expect(buf.byteLength).toBeGreaterThan(1024)
  expect(String.fromCharCode(...buf.slice(0, 5))).toBe('%PDF-')
  expect(String.fromCharCode(...buf.slice(-32))).toMatch(/%%EOF\s*$/)
}

describe('generarMandatoGestoria (smoke)', () => {
  it('produce un PDF válido con datos completos y gestoría explícita', async () => {
    const buf = await generarMandatoGestoria(dealCompleto, {
      gestoria: {
        nombre: 'Gestoría Ejemplo S.L.',
        nif: 'B12345678',
        direccion: 'Av. del Cid 1, 46018 Valencia',
      },
    })
    assertValidPdf(buf)
  })

  it('no lanza con datos mínimos (sin cliente, vehículo ni gestoría)', async () => {
    const buf = await generarMandatoGestoria(dealMinimo)
    assertValidPdf(buf)
  })
})
