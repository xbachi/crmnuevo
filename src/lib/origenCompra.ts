/**
 * Origen de la compra del vehículo y coherencia del régimen de la factura.
 *
 * EL ERROR QUE ESTO EVITA (VW Taigo 3835LWT, F-2026-4233):
 * el coche se compró A UN PARTICULAR (contrato de compraventa, 18.500 €: un
 * particular no emite facturas, así que NO hay IVA soportado que deducir) y se
 * facturó en régimen general por 21.760 € → se ingresó IVA sobre el precio
 * TOTAL (3.776,53 €) en vez de sobre el margen (REBU: 21/121 × (21.760 −
 * 18.500) = 565,79 €). 3.210,74 € de IVA pagados de más.
 *
 * Hasta ahora el régimen (VAT/REBU) se elegía a mano al emitir y nada lo
 * validaba contra cómo se había comprado el coche.
 *
 * CÓMO SE DEDUCE EL ORIGEN (y con qué fiabilidad):
 *   · FACTURA de compra → comprado a una EMPRESA. Evidencia:
 *       - facturas_registro (categoria 'coche-compra') con la matrícula o un
 *         alias. Fiable cuando la fila tiene matrícula; hoy muchas la tienen
 *         NULL, así que por sí sola NO alcanza (falsos negativos).
 *       - snapshot de la carpeta del coche (expedientes_carpetas) pasado por
 *         analizarCarpeta: hash contra facturas_registro primero, nombre después.
 *   · CONTRATO de compraventa (sin factura) → comprado a un PARTICULAR.
 *     Sólo se detecta en la carpeta.
 *   · Nada de lo anterior → 'desconocido'. NO se inventa certeza: se avisa y se
 *     deja emitir (caso Hyundai Kona 6935KYC, sin ningún justificante cargado).
 *
 * Un coche en depósito/consignación no se compró: no hay régimen que validar.
 */

import type { Pool, PoolClient } from 'pg'
import type { InvoiceType } from '@/lib/invoiceRepository'
import { esDepositoVehiculoTipo } from '@/lib/expedienteChecklist'
import {
  analizarCarpeta,
  indexarRegistros,
  type RegistroHash,
} from '@/lib/expedienteDocs'
import { aliasDeMatricula } from '@/lib/aliasMatriculas'

type Db = Pool | PoolClient

export type OrigenCompra = 'particular' | 'empresa' | 'deposito' | 'desconocido'

export interface EvidenciaCompra {
  facturaCompra: boolean
  contratoCompra: boolean
  esDeposito: boolean
  /** Vehiculo.precioCompra — necesario para calcular el margen REBU. */
  precioCompra: number | null
  /** De dónde salió la evidencia ('facturas_registro' | 'carpeta-onedrive'). */
  fuentes: string[]
}

export const EVIDENCIA_VACIA: EvidenciaCompra = {
  facturaCompra: false,
  contratoCompra: false,
  esDeposito: false,
  precioCompra: null,
  fuentes: [],
}

/**
 * Origen de la compra a partir de la evidencia.
 * La factura manda sobre el contrato: si hay factura de compra hay IVA soportado
 * deducible, aunque además exista un contrato firmado (algunas empresas lo
 * adjuntan). Sólo se concluye 'particular' con evidencia POSITIVA de contrato y
 * ausencia total de factura.
 */
export function deducirOrigen(e: EvidenciaCompra): OrigenCompra {
  if (e.esDeposito) return 'deposito'
  if (e.facturaCompra) return 'empresa'
  if (e.contratoCompra) return 'particular'
  return 'desconocido'
}

export interface AvisoRegimen {
  code: 'REGIMEN_INCOHERENTE' | 'ORIGEN_NO_VERIFICADO'
  /** 'bloqueante' → la emisión se corta salvo allowRegimen; 'aviso' → informa. */
  severidad: 'bloqueante' | 'aviso'
  message: string
  origen: OrigenCompra
  invoiceType: InvoiceType
  total: number
  /** IVA a ingresar facturando en régimen general (sobre el precio total). */
  ivaGeneral: number
  /** IVA a ingresar en REBU (sobre el margen). null si falta el precio de compra. */
  ivaRebu: number | null
  /** ivaGeneral − ivaRebu: el sobrecoste de facturar con IVA. */
  diferencia: number | null
  precioCompra: number | null
}

const IVA_INCLUIDO = 21 / 121 // el total ya lleva el IVA dentro
const round2 = (n: number) => Math.round(n * 100) / 100
// useGrouping explícito: el default 'min2' de es-ES deja "3776,53" sin punto de
// millar, y estos importes se leen como dinero (3.776,53 €).
const eur = (n: number) =>
  `${n.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  })} €`

/** IVA que se ingresa facturando el total en régimen general. */
export function ivaRegimenGeneral(total: number): number {
  return round2(total * IVA_INCLUIDO)
}

/** IVA que se ingresaría en REBU (sobre el margen). null sin precio de compra. */
export function ivaRebuMargen(
  total: number,
  precioCompra: number | null
): number | null {
  if (precioCompra == null || precioCompra <= 0) return null
  return round2(Math.max(0, total - precioCompra) * IVA_INCLUIDO)
}

/**
 * ¿La factura que se va a emitir es coherente con cómo se compró el coche?
 * Devuelve null si no hay nada que decir. Sólo se evalúa VAT: emitir REBU nunca
 * se bloquea (no hay riesgo de ingresar IVA de más).
 */
export function evaluarRegimen(args: {
  invoiceType: InvoiceType
  total: number
  evidencia: EvidenciaCompra
}): AvisoRegimen | null {
  const { invoiceType, total, evidencia } = args
  if (invoiceType !== 'VAT') return null

  const origen = deducirOrigen(evidencia)
  if (origen === 'empresa' || origen === 'deposito') return null

  const ivaGeneral = ivaRegimenGeneral(total)
  const ivaRebu = ivaRebuMargen(total, evidencia.precioCompra)
  const diferencia = ivaRebu == null ? null : round2(ivaGeneral - ivaRebu)
  const base = {
    origen,
    invoiceType,
    total,
    ivaGeneral,
    ivaRebu,
    diferencia,
    precioCompra: evidencia.precioCompra,
  }

  if (origen === 'desconocido') {
    return {
      ...base,
      code: 'ORIGEN_NO_VERIFICADO',
      severidad: 'aviso',
      message:
        'No se pudo verificar el origen de la compra de este coche: no hay ' +
        'factura de compra ni contrato de compraventa registrados. Si se compró ' +
        'a un particular, facturar con IVA general obliga a ingresar el IVA sobre ' +
        `el precio total (${eur(ivaGeneral)}) en vez de sobre el margen (REBU). ` +
        'Comprobá el justificante de compra antes de emitir.',
    }
  }

  const margen =
    diferencia == null
      ? 'No se puede calcular el margen: el coche no tiene precio de compra cargado.'
      : `en vez de sobre el margen (REBU: ${eur(ivaRebu!)}, compra ${eur(
          evidencia.precioCompra!
        )}). Diferencia: ${eur(diferencia)} de IVA de más.`

  return {
    ...base,
    code: 'REGIMEN_INCOHERENTE',
    severidad: 'bloqueante',
    message:
      'Este coche se compró a un particular (contrato de compraventa, sin factura ' +
      'de compra): no hay IVA soportado que deducir. Facturarlo con IVA general ' +
      `te hace ingresar IVA sobre el precio total (${eur(ivaGeneral)} sobre ` +
      `${eur(total)}) ${margen} Lo correcto es emitir en REBU. Si aun así la ` +
      'operación va en régimen general, confirmá para emitir igualmente.',
  }
}

/**
 * Evidencia de compra del vehículo desde la DB. Nunca lanza por falta de datos:
 * sin matrícula, sin snapshot o sin registros devuelve lo que sepa (y el
 * resultado será 'desconocido' → aviso, no bloqueo).
 */
export async function cargarEvidenciaCompra(
  db: Db,
  args: { vehiculoId?: number | null; matricula?: string | null }
): Promise<EvidenciaCompra> {
  let esDeposito = false
  let precioCompra: number | null = null
  if (args.vehiculoId != null) {
    const v = await db.query<{
      tipo: string | null
      precioCompra: string | number | null
    }>(`SELECT tipo, "precioCompra" FROM "Vehiculo" WHERE id = $1`, [
      args.vehiculoId,
    ])
    const row = v.rows[0]
    esDeposito = esDepositoVehiculoTipo(row?.tipo)
    precioCompra = row?.precioCompra != null ? Number(row.precioCompra) : null
  }

  const plates = args.matricula
    ? await aliasDeMatricula(db, args.matricula)
    : []
  if (plates.length === 0) {
    return { ...EVIDENCIA_VACIA, esDeposito, precioCompra }
  }

  const fuentes: string[] = []
  // 1. Registro unificado de facturas: una fila 'coche-compra' con la matrícula
  //    (o un alias) ES una factura de compra → empresa. Muchas filas tienen la
  //    matrícula NULL, así que la ausencia no prueba nada.
  const reg = await db.query<{
    hash_contenido: string
    categoria: string
    matricula: string | null
  }>(
    `SELECT hash_contenido, categoria, matricula
       FROM facturas_registro
      WHERE categoria = 'coche-compra' AND matricula = ANY($1)`,
    [plates]
  )
  let facturaCompra = reg.rows.length > 0
  if (facturaCompra) fuentes.push('facturas_registro')

  // 2. Snapshot de la carpeta del coche en OneDrive: hash contra el registro
  //    primero, nombre después (analizarCarpeta). Es la ÚNICA fuente que puede
  //    ver un contrato de compraventa: un particular no factura.
  let contratoCompra = false
  const tabla = await db.query<{ reg: string | null }>(
    `SELECT to_regclass('public.expedientes_carpetas') AS reg`
  )
  if (tabla.rows[0]?.reg) {
    const snap = await db.query<{
      archivos: { nombre: string; hash?: string | null }[]
    }>(
      `SELECT archivos FROM expedientes_carpetas WHERE matricula_norm = ANY($1)`,
      [plates]
    )
    const archivos = snap.rows.flatMap((r) =>
      Array.isArray(r.archivos) ? r.archivos : []
    )
    if (archivos.length > 0) {
      const registros: RegistroHash[] = reg.rows.map((r) => ({
        hash: r.hash_contenido,
        categoria: r.categoria,
        matricula: r.matricula,
      }))
      const { docs } = analizarCarpeta(archivos, {
        hashes: indexarRegistros(registros),
        matricula: plates[0],
      })
      if (docs.facturaCompra || docs.contratoCompra)
        fuentes.push('carpeta-onedrive')
      facturaCompra = facturaCompra || docs.facturaCompra
      contratoCompra = docs.contratoCompra
    }
  }

  return { facturaCompra, contratoCompra, esDeposito, precioCompra, fuentes }
}

/**
 * Chequeo completo (DB + reglas) para el emisor. Best-effort: si la consulta de
 * evidencia falla, devuelve null (la emisión NUNCA se rompe por esto).
 */
export async function chequearRegimen(
  db: Db,
  args: {
    invoiceType: InvoiceType
    total: number
    vehiculoId?: number | null
    matricula?: string | null
  }
): Promise<AvisoRegimen | null> {
  if (args.invoiceType !== 'VAT') return null
  let evidencia: EvidenciaCompra
  try {
    evidencia = await cargarEvidenciaCompra(db, {
      vehiculoId: args.vehiculoId,
      matricula: args.matricula,
    })
  } catch (err) {
    console.error(
      '[origenCompra] no se pudo cargar la evidencia de compra:',
      err
    )
    return null
  }
  return evaluarRegimen({
    invoiceType: args.invoiceType,
    total: args.total,
    evidencia,
  })
}
