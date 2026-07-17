/**
 * Validación/normalización de los campos del maestro de proveedores.
 *
 * Compartido por POST /api/fiscal/proveedores (alta) y PATCH .../[id] (edición):
 * las mismas reglas en los dos lados, o el alta y la edición aceptan cosas
 * distintas y el maestro termina con datos que solo entraron "por un lado".
 *
 * DECISIÓN DE PRODUCTO — un NIF inválido NO bloquea el guardado. El validador
 * solo conoce el formato español y el NIF-IVA de la UE; un proveedor extranjero
 * raro, o un NIF que el usuario está copiando de un papel para confirmarlo
 * después, dan `valido:false` sin estar mal. Bloquear obligaría a inventar un
 * NIF falso para poder guardar el resto de la ficha — mucho peor. Se guarda con
 * `nif_valido=false` y el motivo vuelve como `aviso`: visible, no fatal.
 * Quien sí bloquea es /validar (una factura con NIF inválido no entra al libro).
 */

import type { Pool, PoolClient } from 'pg'
import { validarNif } from './nifValidator'
import { CATEGORIAS } from './facturasRegistro'
import { TIPOS_OPERACION, DEDUCIBLES } from './facturaFiscal'

export class ProveedorValidacionError extends Error {
  constructor(public errores: string[]) {
    super(errores.join('; '))
    this.name = 'ProveedorValidacionError'
  }
}

const textoONull = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

export interface CamposProveedor {
  /** Columnas listas para el INSERT/UPDATE (nombres de la DB). */
  campos: Record<string, unknown>
  /** Motivo del NIF inválido, si lo hay. No bloquea. */
  aviso: string | null
}

/**
 * Body de la API → columnas de `proveedores`. Solo incluye los campos PRESENTES
 * en el body (undefined = no tocar; null = borrar explícitamente).
 *
 * @throws ProveedorValidacionError si un valor violaría un CHECK de la DB.
 */
export function camposProveedor(body: Record<string, unknown>): CamposProveedor {
  const errores: string[] = []
  const campos: Record<string, unknown> = {}
  let aviso: string | null = null

  if (body.nombre !== undefined) {
    const n = textoONull(body.nombre)
    if (!n) errores.push('nombre no puede quedar vacío: es la identidad canónica del proveedor')
    else campos.nombre = n
  }

  if (body.pais !== undefined) {
    const p = textoONull(body.pais)
    campos.pais = p ? p.toUpperCase() : 'ES'
  }

  // El NIF se valida contra el país FINAL (el del body si viene, si no el que ya
  // tenga la ficha; el llamador resuelve ese default y lo pasa en body.pais).
  if (body.nif !== undefined) {
    const nif = textoONull(body.nif)
    if (!nif) {
      campos.nif = null
      campos.nif_valido = null // NULL = sin verificar ≠ false = verificado e inválido
    } else {
      const pais = String((campos.pais as string) ?? body.pais ?? 'ES')
      const v = validarNif(nif, pais)
      campos.nif = v.normalizado
      campos.nif_valido = v.valido
      if (!v.valido) {
        aviso = `El NIF "${v.normalizado}" no supera la validación (${v.motivo ?? 'formato no reconocido'}). Se guardó igual marcado como no válido: revisalo antes de declarar, la AEAT lo rechaza en el 347.`
      }
    }
  }

  if (body.aliases !== undefined) {
    if (body.aliases === null) campos.aliases = []
    else if (!Array.isArray(body.aliases)) errores.push('aliases debe ser un array de textos')
    else {
      // Dedup case-insensitive conservando la primera grafía: los alias se
      // comparan en minúscula contra facturas_registro.proveedor.
      const vistos = new Set<string>()
      const out: string[] = []
      for (const a of body.aliases) {
        const s = textoONull(a)
        if (!s) continue
        const k = s.toLowerCase()
        if (vistos.has(k)) continue
        vistos.add(k)
        out.push(s)
      }
      campos.aliases = out
    }
  }

  if (body.iban !== undefined) {
    const i = textoONull(body.iban)
    campos.iban = i ? i.toUpperCase().replace(/\s/g, '') : null
  }

  if (body.categoriaDefecto !== undefined) {
    const c = textoONull(body.categoriaDefecto)
    if (c && !(CATEGORIAS as readonly string[]).includes(c)) {
      errores.push(`categoriaDefecto inválida: "${c}" (válidas: ${CATEGORIAS.join(', ')})`)
    } else campos.categoria_defecto = c
  }

  if (body.tipoOperacionDefecto !== undefined) {
    const t = String(body.tipoOperacionDefecto ?? '').trim().toLowerCase()
    if (!(TIPOS_OPERACION as readonly string[]).includes(t)) {
      errores.push(`tipoOperacionDefecto inválido: "${t}" (válidos: ${TIPOS_OPERACION.join(', ')})`)
    } else campos.tipo_operacion_defecto = t
  }

  if (body.deducibleDefecto !== undefined) {
    const d = String(body.deducibleDefecto ?? '').trim().toLowerCase()
    if (!(DEDUCIBLES as readonly string[]).includes(d)) {
      errores.push(`deducibleDefecto inválido: "${d}" (válidos: ${DEDUCIBLES.join(', ')})`)
    } else campos.deducible_defecto = d
  }

  if (body.subcategoriaDefecto !== undefined) {
    campos.subcategoria_defecto = textoONull(body.subcategoriaDefecto)
  }

  if (body.plantillaExtraccion !== undefined) {
    campos.plantilla_extraccion = textoONull(body.plantillaExtraccion)
  }

  if (body.validacionAuto !== undefined) campos.validacion_auto = body.validacionAuto === true
  if (body.activo !== undefined) campos.activo = body.activo === true

  if (errores.length > 0) throw new ProveedorValidacionError(errores)
  return { campos, aviso }
}

/**
 * Explica un 23505 nombrando al proveedor que ya ocupa el nombre/NIF.
 *
 * Un "duplicate key value violates unique constraint" crudo obliga al usuario a
 * adivinar con quién chocó; con el id y el nombre puede ir a fusionarlos
 * (POST .../[id]/merge), que es lo que casi siempre quiere hacer.
 */
export async function colisionProveedor(
  db: Pool | PoolClient,
  campos: Record<string, unknown>,
  excluirId?: number
): Promise<{ error: string; code: string; proveedor?: { id: number; nombre: string } }> {
  const buscar = async (sql: string, params: unknown[]) => {
    const r = await db.query(sql, params)
    return r.rows[0] as { id: number; nombre: string } | undefined
  }

  if (campos.nombre) {
    const hit = await buscar(
      `SELECT id, nombre FROM proveedores WHERE lower(nombre) = lower($1) AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
      [campos.nombre, excluirId ?? null]
    )
    if (hit) {
      return {
        error: `Ya existe el proveedor "${hit.nombre}" (id ${hit.id}) con ese nombre. Si son el mismo, fusionalos desde su ficha en vez de crear otro.`,
        code: 'PROVEEDOR_DUPLICADO',
        proveedor: hit,
      }
    }
  }

  if (campos.nif) {
    const hit = await buscar(
      `SELECT id, nombre FROM proveedores WHERE nif = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
      [campos.nif, excluirId ?? null]
    )
    if (hit) {
      return {
        error: `El NIF ${String(campos.nif)} ya es de "${hit.nombre}" (id ${hit.id}). Un NIF = un proveedor: si son el mismo, fusionalos.`,
        code: 'NIF_DUPLICADO',
        proveedor: hit,
      }
    }
  }

  return {
    error: 'Ya existe un proveedor con ese nombre o NIF.',
    code: 'PROVEEDOR_DUPLICADO',
  }
}
