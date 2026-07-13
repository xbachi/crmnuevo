/**
 * Validación compartida (form del deal + server) de las condiciones de pago
 * obligatorias al generar el contrato de venta. El server NUNCA confía solo
 * en el form: /api/deals/[id]/condiciones-pago revalida con estas reglas.
 */

import type { FormaPago } from '@/lib/comisiones'
import { FORMAS_PAGO } from '@/lib/comisiones'

/** Tolerancia en € para contado + financiado vs precio de venta (mixto). */
export const TOLERANCIA_SUMA_EUR = 1

export const BANCOS_SUGERIDOS = [
  'Santander Consumer',
  'BBVA',
  'Sabadell',
  'Cetelem',
  'Cofidis',
  'Caixabank',
  'Sofinco',
] as const

export interface CondicionesPago {
  formaPago: FormaPago
  banco: string | null
  interes: number | null
  cuotas: number | null
  montoFinanciado: number | null
  montoContado: number | null
  garantiaPremium: boolean
}

type Resultado =
  | { ok: true; data: CondicionesPago }
  | { ok: false; error: string }

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * Valida el payload crudo. Si `precioVenta` viene (> 0), en mixto exige que
 * contado + financiado == precio (± TOLERANCIA_SUMA_EUR).
 */
export function validarCondicionesPago(
  raw: unknown,
  precioVenta?: number | null
): Resultado {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Body inválido' }
  }
  const b = raw as Record<string, unknown>

  const formaPago = b.formaPago
  if (
    typeof formaPago !== 'string' ||
    !(FORMAS_PAGO as readonly string[]).includes(formaPago)
  ) {
    return {
      ok: false,
      error: `formaPago debe ser una de: ${FORMAS_PAGO.join(', ')}`,
    }
  }

  if (typeof b.garantiaPremium !== 'boolean') {
    return {
      ok: false,
      error: 'garantiaPremium es obligatorio (sí o no, elección explícita)',
    }
  }

  const data: CondicionesPago = {
    formaPago: formaPago as FormaPago,
    banco: null,
    interes: null,
    cuotas: null,
    montoFinanciado: null,
    montoContado: null,
    garantiaPremium: b.garantiaPremium,
  }

  if (formaPago === 'contado') {
    // No exige (y no persiste) campos de financiación.
    return { ok: true, data }
  }

  // financiado / mixto: todos los datos de financiación son obligatorios.
  const banco = typeof b.banco === 'string' ? b.banco.trim() : ''
  if (!banco) {
    return { ok: false, error: 'banco es obligatorio en financiado/mixto' }
  }

  const interes = toNum(b.interes)
  if (interes === null || interes < 0) {
    return {
      ok: false,
      error: 'interes (% TIN) es obligatorio y debe ser ≥ 0',
    }
  }

  const cuotas = toNum(b.cuotas)
  if (cuotas === null || !Number.isInteger(cuotas) || cuotas < 1) {
    return { ok: false, error: 'cuotas debe ser un entero ≥ 1' }
  }

  const montoFinanciado = toNum(b.montoFinanciado)
  if (montoFinanciado === null || montoFinanciado <= 0) {
    return { ok: false, error: 'montoFinanciado debe ser mayor que 0' }
  }

  data.banco = banco
  data.interes = interes
  data.cuotas = cuotas
  data.montoFinanciado = montoFinanciado

  if (formaPago === 'mixto') {
    const montoContado = toNum(b.montoContado)
    if (montoContado === null || montoContado <= 0) {
      return {
        ok: false,
        error: 'montoContado debe ser mayor que 0 en pago mixto',
      }
    }
    data.montoContado = montoContado

    if (typeof precioVenta === 'number' && precioVenta > 0) {
      const suma = montoContado + montoFinanciado
      const diff = suma - precioVenta
      if (Math.abs(diff) > TOLERANCIA_SUMA_EUR) {
        const signo = diff > 0 ? 'sobran' : 'faltan'
        return {
          ok: false,
          error:
            `contado + financiado (${suma.toFixed(2)} €) no coincide con el ` +
            `precio de venta (${precioVenta.toFixed(2)} €): ${signo} ` +
            `${Math.abs(diff).toFixed(2)} €`,
        }
      }
    }
  }

  return { ok: true, data }
}

/** Etiqueta corta para el PDF del contrato y la UI. */
export function describirCondicionesPago(c: CondicionesPago): string {
  if (c.formaPago === 'contado') return 'Contado'
  const partes = [
    c.formaPago === 'financiado' ? 'Financiado' : 'Mixto',
    `— Banco ${c.banco}`,
    `${c.cuotas} cuotas`,
    `TIN ${c.interes}%`,
  ]
  if (c.formaPago === 'mixto' && c.montoContado != null) {
    partes.push(
      `(${c.montoContado.toLocaleString('es-ES')} € al contado + ` +
        `${(c.montoFinanciado ?? 0).toLocaleString('es-ES')} € financiados)`
    )
  }
  return partes.join(', ').replace(', —', ' —')
}
