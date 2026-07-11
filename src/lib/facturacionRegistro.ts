/**
 * Registro de facturación con hash encadenado ("Verifactu-lite").
 *
 * Cadena de integridad inspirada en el RD 1007/2023 (Verifactu): cada alta o
 * anulación de factura genera un registro en `facturacion_registros` cuyo
 * hash incluye el hash del registro anterior. Borrar o alterar una factura
 * emitida rompe la cadena de forma detectable
 * (GET /api/admin/verifactu/verify-chain).
 *
 * IMPORTANTE: esto es PREPARACIÓN para Verifactu — cadena de integridad
 * interna, pendiente de homologación. NO implementa el envío a la AEAT ni
 * constituye cumplimiento legal del RD 1007/2023.
 */

import { createHash } from 'crypto'
import type { PoolClient } from 'pg'

export type TipoRegistro = 'alta' | 'anulacion'

/** NIF del emisor (Sevencars) — overrideable por env para tests/otras empresas. */
export function getEmpresaNif(): string {
  return process.env.EMPRESA_NIF || 'B75939868'
}

export interface RegistroHashFields {
  nifEmisor: string
  /** full_invoice_number, p.ej. "F-2026-4236". */
  numeroSerie: string
  /** Fecha de expedición en formato YYYY-MM-DD. */
  fechaExpedicion: string
  tipoRegistro: TipoRegistro
  /** Importe total con exactamente 2 decimales, p.ej. "12500.00". */
  importeTotal: string
}

export interface FacturacionRegistroRow {
  id: number
  invoice_id: number | null
  tipo_registro: TipoRegistro
  numero_serie: string
  fecha_expedicion: string | Date
  nif_emisor: string
  importe_total: string | number
  hash_anterior: string | null
  hash_actual: string
  qr_payload: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

/** Normaliza una fecha (Date o string ISO) a YYYY-MM-DD. */
export function normalizeFecha(fecha: string | Date): string {
  if (fecha instanceof Date) return fecha.toISOString().slice(0, 10)
  return fecha.slice(0, 10)
}

/** Normaliza un importe (number o string numérico) a "####.##" (2 decimales). */
export function normalizeImporte(importe: number | string): string {
  const n = typeof importe === 'number' ? importe : Number(importe)
  if (!Number.isFinite(n)) {
    throw new Error(`[facturacionRegistro] importe inválido: ${importe}`)
  }
  return n.toFixed(2)
}

/**
 * Huella SHA-256 (hex) del registro. Concatenación DETERMINISTA, separada
 * por '|', en este orden exacto (mismo espíritu que la huella Verifactu):
 *
 *   nif_emisor | numero_serie | fecha(YYYY-MM-DD) | tipo_registro
 *     | importe_total(2 decimales) | hash_anterior (o '' en el primer eslabón)
 *
 * Cualquier cambio en el orden o el formato invalida toda la cadena emitida:
 * NO modificar sin plan de migración de la cadena.
 */
export function computeHash(
  campos: RegistroHashFields,
  hashAnterior: string | null
): string {
  const payload = [
    campos.nifEmisor,
    campos.numeroSerie,
    campos.fechaExpedicion,
    campos.tipoRegistro,
    campos.importeTotal,
    hashAnterior ?? '',
  ].join('|')
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

/**
 * Payload del QR con el formato de la URL de validación de la AEAT.
 * PRE-PRODUCCIÓN: apunta al entorno de pruebas de la AEAT (prewww2) y está
 * pendiente de homologación; no es un QR Verifactu válido legalmente.
 */
export function buildQrPayload(args: {
  nifEmisor: string
  numeroSerie: string
  /** YYYY-MM-DD */
  fechaExpedicion: string
  /** "####.##" */
  importeTotal: string
}): string {
  const [yyyy, mm, dd] = args.fechaExpedicion.split('-')
  const fecha = `${dd}-${mm}-${yyyy}`
  const params = new URLSearchParams({
    nif: args.nifEmisor,
    numserie: args.numeroSerie,
    fecha,
    importe: args.importeTotal,
  })
  return `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?${params.toString()}`
}

export interface AppendRegistroOptions {
  tipoRegistro: TipoRegistro
  invoiceId: number | null
  numeroSerie: string
  fechaExpedicion: string | Date
  importeTotal: number | string
  metadata?: Record<string, unknown> | null
}

/**
 * Añade un eslabón a la cadena DENTRO de la transacción del caller (recibe
 * su PoolClient; acá no hay BEGIN/COMMIT). Si este INSERT falla, la emisión
 * o anulación entera hace rollback — decisión deliberada: una factura sin
 * eslabón en la cadena no debe existir.
 *
 * Serialización: advisory lock transaccional sobre la tabla (cubre el caso
 * de cadena vacía, donde no hay fila que lockear) + FOR UPDATE sobre el
 * último eslabón. Sólo un caller a la vez puede extender la cadena.
 */
export async function appendRegistro(
  client: PoolClient,
  opts: AppendRegistroOptions
): Promise<FacturacionRegistroRow> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('facturacion_registros'))`
  )
  const last = await client.query<{ hash_actual: string }>(
    `SELECT hash_actual FROM facturacion_registros ORDER BY id DESC LIMIT 1 FOR UPDATE`
  )
  const hashAnterior = last.rows[0]?.hash_actual ?? null

  const campos: RegistroHashFields = {
    nifEmisor: getEmpresaNif(),
    numeroSerie: opts.numeroSerie,
    fechaExpedicion: normalizeFecha(opts.fechaExpedicion),
    tipoRegistro: opts.tipoRegistro,
    importeTotal: normalizeImporte(opts.importeTotal),
  }
  const hashActual = computeHash(campos, hashAnterior)
  const qrPayload = buildQrPayload({
    nifEmisor: campos.nifEmisor,
    numeroSerie: campos.numeroSerie,
    fechaExpedicion: campos.fechaExpedicion,
    importeTotal: campos.importeTotal,
  })

  const inserted = await client.query<FacturacionRegistroRow>(
    `INSERT INTO facturacion_registros
       (invoice_id, tipo_registro, numero_serie, fecha_expedicion, nif_emisor,
        importe_total, hash_anterior, hash_actual, qr_payload, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      opts.invoiceId,
      campos.tipoRegistro,
      campos.numeroSerie,
      campos.fechaExpedicion,
      campos.nifEmisor,
      campos.importeTotal,
      hashAnterior,
      hashActual,
      qrPayload,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
    ]
  )
  return inserted.rows[0]
}

export interface ChainBreak {
  id: number
  esperado: string
  encontrado: string
}

/**
 * Verifica la cadena recomputando cada hash desde el génesis (hash anterior
 * ESPERADO, no el almacenado). Alterar o quitar un eslabón rompe la
 * verificación desde ese punto en adelante — es el comportamiento buscado.
 * Filas ordenadas por id ASC.
 */
export function verifyChainRows(rows: FacturacionRegistroRow[]): ChainBreak[] {
  const roturas: ChainBreak[] = []
  let prevHash: string | null = null
  for (const row of rows) {
    const esperado = computeHash(
      {
        nifEmisor: row.nif_emisor,
        numeroSerie: row.numero_serie,
        fechaExpedicion: normalizeFecha(row.fecha_expedicion),
        tipoRegistro: row.tipo_registro,
        importeTotal: normalizeImporte(row.importe_total),
      },
      prevHash
    )
    if (esperado !== row.hash_actual) {
      roturas.push({ id: row.id, esperado, encontrado: row.hash_actual })
    }
    prevHash = esperado
  }
  return roturas
}
