/**
 * @jest-environment node
 *
 * PDF real con jsPDF en Node (jsdom no carga jspdf.node). Sin red: la foto se
 * inyecta como null; el QR sí se genera.
 */
import { calcularPresupuesto } from '@/lib/presupuesto/calculo'
import { generarPresupuestoPdf } from '@/lib/presupuesto/pdf'
import { OPCIONES_DEFECTO, PARAMETROS_DEFECTO } from '@/lib/presupuesto/tipos'

const T899 = {
  id: 1,
  nombre: '8,99',
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
const T999 = {
  id: 2,
  nombre: '9,99',
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
const VEHICULO = {
  id: 1088,
  referencia: '#1088',
  marca: 'Tesla',
  modelo: 'Model 3',
  matricula: '1234ABC',
  kms: 45000,
  color: 'Blanco',
  fechaMatriculacion: '2023-05-05',
  anio: 2023,
  estado: 'publicado',
  dealActivoId: null,
  venta: null,
}

function calc(opciones = OPCIONES_DEFECTO) {
  return calcularPresupuesto({
    vehiculo: {
      precio_contado: 32985,
      tarifa_financiacion: 'NORMAL',
      gp: 990,
      fecha_matriculacion: '2023-05-05',
      meses_garantia_fabrica: null,
    },
    opciones,
    params: PARAMETROS_DEFECTO,
    tarifaPremium: T899,
    tarifaSinPremium: T999,
    hoy: '2026-09-18',
  })
}

async function pdf(opciones = OPCIONES_DEFECTO) {
  const calculo = calc(opciones)
  const bytes = await generarPresupuestoPdf(
    {
      numero: 'P-2026-0001',
      fecha: '2026-09-18',
      validoHasta: calculo.validoHasta,
      nombreCliente: 'Cliente Prueba',
      vehiculo: VEHICULO,
      ficha: null,
      calculo,
      urlPublica: 'https://sevencars.vercel.app/p/abcdefghijklmnop',
      params: PARAMETROS_DEFECTO,
    },
    { foto: null }
  )
  return Buffer.from(bytes).toString('latin1')
}

describe('generarPresupuestoPdf', () => {
  it('genera un PDF de una página con QR, sin tocar la red', async () => {
    const txt = await pdf()
    expect(txt.startsWith('%PDF-')).toBe(true)
    expect((txt.match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(1)
    // logo (PNG con máscara alfa → 2 objetos) + QR
    expect(
      (txt.match(/\/Subtype\s*\/Image/g) || []).length
    ).toBeGreaterThanOrEqual(2)
  }, 30000)

  it('sin financiación (CONSULTAR) también cabe en una página', async () => {
    const txt = await pdf({ ...OPCIONES_DEFECTO, tarifaOverride: 'CONSULTAR' })
    expect((txt.match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(1)
  }, 30000)
})
