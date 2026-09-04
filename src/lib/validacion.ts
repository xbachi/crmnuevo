/**
 * Validación por campo para los formularios largos (deal, cliente, vehículo).
 *
 * Puro: sin React ni DOM. Devuelve un mapa campo → mensaje en tuteo para
 * pintarlo bajo cada input; el orden de `errores` respeta el orden de `reglas`,
 * así `primerCampoConError` apunta al primer campo del formulario que falla.
 *
 * `etiqueta` lleva artículo ("el nombre", "la matrícula") para que el mensaje
 * de obligatorio salga bien concordado: "Indica el nombre".
 */

import { validarNif } from './nifValidator'

export type TipoCampo =
  | 'texto'
  | 'email'
  | 'telefono'
  | 'nif'
  | 'numero'
  | 'fecha'
  | 'matricula'

export type Regla = {
  requerido?: boolean
  etiqueta: string
  tipo?: TipoCampo
  min?: number
  max?: number
  personalizada?: (
    valor: unknown,
    valores: Record<string, unknown>
  ) => string | null
}

export type ResultadoValidacion = {
  ok: boolean
  errores: Record<string, string>
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Español (9 dígitos, prefijo +34/0034 opcional) o internacional con "+".
const RE_TELEFONO = /^(?:(?:\+34|0034)?[6-9]\d{8}|\+(?!34)\d{8,15})$/
// Formato vigente "1234 ABC" o provincial antiguo "V-1234-AB". Se admiten vocales
// a propósito: el objetivo es cazar el orden invertido ("ABC 1234"), no el listado oficial.
const RE_MATRICULA_ACTUAL = /^\d{4}[\s-]?[A-Z]{3}$/
const RE_MATRICULA_ANTIGUA = /^[A-Z]{1,2}[\s-]?\d{4}[\s-]?[A-Z]{1,2}$/
const RE_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

function esVacio(valor: unknown): boolean {
  if (valor === null || valor === undefined || valor === false) return true
  if (typeof valor === 'string') return valor.trim() === ''
  if (typeof valor === 'number') return Number.isNaN(valor)
  return false
}

export function esEmailValido(valor: string): boolean {
  return RE_EMAIL.test(valor.trim())
}

export function esTelefonoValido(valor: string): boolean {
  return RE_TELEFONO.test(valor.replace(/[\s.\-()]/g, ''))
}

export function esMatriculaValida(valor: string): boolean {
  const v = valor.trim().toUpperCase()
  return RE_MATRICULA_ACTUAL.test(v) || RE_MATRICULA_ANTIGUA.test(v)
}

export function esFechaValida(valor: string): boolean {
  const v = valor.trim()
  if (!RE_FECHA_ISO.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function validarTipo(valor: unknown, regla: Regla): string | null {
  const texto = typeof valor === 'string' ? valor : String(valor)

  switch (regla.tipo) {
    case 'email':
      return esEmailValido(texto) ? null : 'El email no es válido'
    case 'telefono':
      return esTelefonoValido(texto) ? null : 'El teléfono no es válido'
    case 'nif':
      return validarNif(texto).valido ? null : 'El DNI/NIE no es válido'
    case 'matricula':
      return esMatriculaValida(texto)
        ? null
        : 'La matrícula no tiene un formato válido (1234 ABC)'
    case 'fecha':
      return esFechaValida(texto) ? null : 'La fecha no es válida'
    case 'numero': {
      const n = typeof valor === 'number' ? valor : Number(texto.trim())
      if (texto.trim() === '' || Number.isNaN(n)) return 'Debe ser un número'
      if (regla.min !== undefined && n < regla.min) {
        return `Debe ser un número mayor o igual que ${regla.min}`
      }
      if (regla.max !== undefined && n > regla.max) {
        return `Debe ser un número menor o igual que ${regla.max}`
      }
      return null
    }
    case 'texto':
    default: {
      const largo = texto.trim().length
      if (regla.min !== undefined && largo < regla.min) {
        return `Debe tener al menos ${regla.min} caracteres`
      }
      if (regla.max !== undefined && largo > regla.max) {
        return `No puede superar los ${regla.max} caracteres`
      }
      return null
    }
  }
}

/**
 * Valida solo los campos presentes en `reglas`, en su orden. Un campo vacío y
 * no requerido no pasa por el chequeo de tipo, pero sí por `personalizada`
 * (sirve para obligatorios condicionales: "si financiación, entidad").
 */
export function validarCampos(
  valores: Record<string, unknown>,
  reglas: Record<string, Regla>
): ResultadoValidacion {
  const errores: Record<string, string> = {}

  for (const campo of Object.keys(reglas)) {
    const regla = reglas[campo]
    const valor = valores[campo]

    if (esVacio(valor)) {
      if (regla.requerido) {
        errores[campo] = `Indica ${regla.etiqueta}`
        continue
      }
      const msg = regla.personalizada?.(valor, valores) ?? null
      if (msg) errores[campo] = msg
      continue
    }

    const errorTipo = validarTipo(valor, regla)
    if (errorTipo) {
      errores[campo] = errorTipo
      continue
    }

    const msg = regla.personalizada?.(valor, valores) ?? null
    if (msg) errores[campo] = msg
  }

  return { ok: Object.keys(errores).length === 0, errores }
}

/** Primer campo con error según el orden en que se insertaron (= orden de reglas). */
export function primerCampoConError(
  errores: Record<string, string>
): string | null {
  const [primero] = Object.keys(errores)
  return primero ?? null
}

/** Copia de `errores` sin `campo`; devuelve el mismo objeto si no estaba. */
export function sinError(
  errores: Record<string, string>,
  campo: string
): Record<string, string> {
  if (!(campo in errores)) return errores
  const copia = { ...errores }
  delete copia[campo]
  return copia
}

/** Resumen para el toast: "Revisa el campo marcado" / "Revisa los N campos marcados". */
export function resumenErrores(errores: Record<string, string>): string {
  const n = Object.keys(errores).length
  return n === 1 ? 'Revisa el campo marcado' : `Revisa los ${n} campos marcados`
}
