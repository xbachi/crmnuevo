/**
 * @jest-environment node
 *
 * Smoke test del contrato B2B "EN EL ESTADO".
 * Verifica que el PDF se genera, es válido y entra en 1 sola página A4.
 */

import { generarContratoCompraventaEstado } from '@/lib/contractGenerator'

const sample = {
  numero: 'B2B-2026-0001',
  fecha_venta: new Date('2026-05-17'),
  lugar_venta: 'Alaquàs',
  comprador: {
    razon_social: 'Autos Mediterráneo SL',
    cif_nif: 'B98765432',
    direccion: 'Av. del Puerto 100, 46011 Valencia',
  },
  vehiculo: {
    marca: 'BMW',
    modelo: 'Serie 3 320d',
    matricula: '7890 BCD',
    bastidor: 'WBA8E1109K5F12345',
    kms: 87500,
    anio: 2019,
    fechaMatriculacion: '12/03/2019',
  },
  precio_venta: 14200,
  forma_pago: 'transferencia' as const,
}

function countPages(buf: Uint8Array): number {
  const str = Buffer.from(buf).toString('latin1')
  const matches = str.match(/\/Type\s*\/Page[^s]/g)
  return matches ? matches.length : -1
}

describe('generarContratoCompraventaEstado (smoke)', () => {
  it('produce un PDF válido en 1 sola página A4', async () => {
    const buf = await generarContratoCompraventaEstado(sample)
    expect(buf).toBeInstanceOf(Uint8Array)
    expect(buf.byteLength).toBeGreaterThan(5000)
    const head = String.fromCharCode(...buf.slice(0, 5))
    expect(head).toBe('%PDF-')
    expect(countPages(buf)).toBe(1)
  })

  it('soporta los 4 formas de pago sin romper', async () => {
    for (const forma of ['transferencia', 'efectivo', 'financiado', 'otro'] as const) {
      const buf = await generarContratoCompraventaEstado({ ...sample, forma_pago: forma })
      expect(buf.byteLength).toBeGreaterThan(5000)
      expect(countPages(buf)).toBe(1)
    }
  })

  it('no crashea cuando comprador.direccion es opcional', async () => {
    const buf = await generarContratoCompraventaEstado({
      ...sample,
      comprador: { razon_social: sample.comprador.razon_social, cif_nif: sample.comprador.cif_nif },
    })
    expect(buf.byteLength).toBeGreaterThan(5000)
  })
})
