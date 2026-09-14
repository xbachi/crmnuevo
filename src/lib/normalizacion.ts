// Fachada tipada de scripts/lib/normalizacion.js (fuente única, también la
// usan los scripts CLI fuera de Next).
import * as impl from '../../scripts/lib/normalizacion'

export type FormatoMatricula =
  | 'actual'
  | 'provincial'
  | 'extranjera'
  | 'invalida'
export type ValidacionMatricula = { ok: boolean; formato: FormatoMatricula }

export function normalizarReferencia(
  input: unknown,
  tipo?: string | null
): string | null {
  return impl.normalizarReferencia(input, tipo)
}

export function normalizarMatricula(input: unknown): string {
  return impl.normalizarMatricula(input)
}

export function extraerMatriculaEntrada(input: unknown): string {
  return impl.extraerMatriculaEntrada(input)
}

export function validarMatricula(
  norm: string,
  opts?: { extranjera?: boolean }
): ValidacionMatricula {
  return impl.validarMatricula(norm, opts) as ValidacionMatricula
}

export function refCarpeta(
  referencia: unknown,
  opts?: { pad?: boolean }
): string | null {
  return impl.refCarpeta(referencia, opts)
}
