/**
 * Conversión de RÉGIMEN de una factura de venta ya emitida (VAT ↔ REBU) EN EL
 * LUGAR, conservando el MISMO número — sin emitir rectificativa.
 *
 * Caso motivador: F-2026-4233 (VW Taigo) se emitió con IVA general pero el coche
 * se compró a un particular → debe ser REBU. Aún NO se entregó, así que se
 * corrige en el lugar en vez de rectificar.
 *
 * Por qué es seguro para la cadena Verifactu-lite (facturacionRegistro.ts):
 * `computeHash` hashea SOLO nif | numero_serie | fecha | tipo_registro |
 * importe_total | hash_anterior. La cuota de IVA NO entra en el hash. Una
 * conversión de régimen NO cambia el `total_amount` (sólo el desglose), así que
 * el eslabón de esta factura y los posteriores siguen válidos. Por eso este
 * flujo NO inserta ni modifica `facturacion_registros`.
 *
 * INVARIANTE DURA: el total nuevo debe ser EXACTO al viejo. Si cambiara → aborta
 * con TOTAL_CAMBIARIA (rompería la cadena). Una conversión pura nunca lo cambia;
 * el guard existe para que nadie use este endpoint para otra cosa.
 *
 * Todo lo fiscal (UPDATE de la fila + audit) va en UNA transacción. El PDF, el
 * resync de costo/beneficio, el recálculo del expediente y el archivado en
 * gestoría son best-effort FUERA de la transacción (mismo criterio que la
 * emisión y la rectificativa): si fallan, la conversión ya quedó commiteada.
 */

import { pool } from '@/lib/direct-database'
import { generateAndAttachPdf } from '@/lib/invoiceService'
import { notifyGestoriaInvoice } from '@/lib/gestoriaWebhook'
import { resyncVehiculoRowToCB } from '@/lib/costoBeneficio'
import { recalcularExpediente } from '@/lib/expedientes'
import {
  verifyChainRows,
  type FacturacionRegistroRow,
} from '@/lib/facturacionRegistro'
import {
  computeConvertedAmounts,
  round2,
  type RegimenTarget,
} from '@/lib/invoiceConvertAmounts'
import type { Invoice, InvoiceStatus } from '@/lib/invoiceRepository'

export class ConvertirError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ConvertirError'
  }
}

/** Estados con una factura VIGENTE cuyo desglose se puede recomponer. */
const CONVERTIBLE_STATUSES: InvoiceStatus[] = ['ISSUED', 'PDF_PENDING']

export interface ConvertirOptions {
  invoiceId: number
  target: RegimenTarget
  userId?: string | null
  userRole?: string | null
  /** No esperar al PDF/CB/expediente/gestoría: se devuelven como
   *  `runNotifications` para que el route los corra con after(). */
  deferNotifications?: boolean
}

export interface ConvertirResult {
  invoice: Invoice
  /** Ya estaba en el régimen destino: no se tocó nada (idempotente). */
  sinCambios: boolean
  /** Verificación defensiva de la cadena tras el commit (read-only). */
  cadenaOk: boolean
  /** margen ≤ 0 en VAT→REBU (coche a pérdida): REBU con cuota 0. */
  marginNoPositivo: boolean
  /** IVA/cuota antes − después (Taigo: 3776,53 − 565,79 = 3210,74). */
  diferenciaIvaAntesDespues: number
  /** El PDF no se pudo regenerar: la fila quedó en PDF_PENDING. */
  pdfPendiente: boolean
  /** Sólo con `deferNotifications:true`. Nunca lanza. */
  runNotifications?: () => Promise<void>
}

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Lanza ConvertirError si la factura no se puede convertir en el lugar. */
export function assertConvertible(inv: Invoice): void {
  if (inv.invoice_type !== 'VAT' && inv.invoice_type !== 'REBU') {
    throw new ConvertirError(
      'NO_CONVERTIBLE',
      `Sólo se convierten facturas VAT o REBU (esta es ${inv.invoice_type}).`,
      409
    )
  }
  if (inv.rectifies_invoice_id != null) {
    throw new ConvertirError(
      'NO_CONVERTIBLE',
      'Una factura rectificativa no se puede convertir.',
      409
    )
  }
  if (inv.rectified_by_invoice_id != null || inv.status === 'RECTIFIED') {
    throw new ConvertirError(
      'NO_CONVERTIBLE',
      'Una factura ya rectificada no se puede convertir.',
      409
    )
  }
  if (!CONVERTIBLE_STATUSES.includes(inv.status)) {
    throw new ConvertirError(
      'NO_CONVERTIBLE',
      `Una factura en estado ${inv.status} no se puede convertir.`,
      409
    )
  }
}

/**
 * Convierte el régimen de `invoiceId` a `target`, en el lugar. Transacción:
 *   1. FOR UPDATE sobre la factura + guardas (NO_CONVERTIBLE).
 *   2. Idempotente: si ya está en `target` → sinCambios, sin escribir.
 *   3. VAT→REBU: precio de compra del vehículo (SIN_PRECIO_COMPRA si falta).
 *   4. Recalcula el desglose (total intacto) + guard TOTAL_CAMBIARIA.
 *   5. UPDATE de la fila (invoice_type + importes). Número/serie/fecha/pdf key
 *      intactos. NO se toca la numeración ni `facturacion_registros`.
 *   6. Audit log de la conversión.
 * Post-commit (best-effort): verificación de la cadena, PDF del nuevo régimen,
 * resync CB, recálculo del expediente y archivado en gestoría.
 */
export async function convertirRegimen(
  opts: ConvertirOptions
): Promise<ConvertirResult> {
  const target = opts.target
  if (target !== 'VAT' && target !== 'REBU') {
    throw new ConvertirError('TARGET_INVALIDO', `target inválido: ${target}`, 400)
  }

  const client = await pool.connect()
  let ctx: {
    inv: Invoice
    updated: Invoice
    ivaAntes: number
    ivaDespues: number
    marginNoPositivo: boolean
  }
  try {
    await client.query('BEGIN')

    const res = await client.query<Invoice>(
      `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
      [opts.invoiceId]
    )
    const inv = res.rows[0]
    if (!inv) {
      throw new ConvertirError('NOT_FOUND', 'Factura no encontrada.', 404)
    }

    assertConvertible(inv)

    // Idempotente: ya está en el régimen destino → no se escribe nada.
    if (inv.invoice_type === target) {
      await client.query('ROLLBACK')
      return {
        invoice: inv,
        sinCambios: true,
        cadenaOk: true,
        marginNoPositivo: false,
        diferenciaIvaAntesDespues: 0,
        pdfPendiente: false,
      }
    }

    const oldTotal = num(inv.total_amount)
    if (oldTotal == null) {
      throw new ConvertirError(
        'INVALID_AMOUNT',
        `Importe total inválido: ${inv.total_amount}`,
        500
      )
    }

    // VAT→REBU necesita el precio de compra: la cuota va sobre el margen.
    let precioCompra: number | null = null
    if (target === 'REBU') {
      if (inv.vehiculo_id == null) {
        throw new ConvertirError(
          'SIN_PRECIO_COMPRA',
          'La factura no tiene vehículo asociado; no se puede calcular el margen REBU.',
          409
        )
      }
      const vRes = await client.query<{ precioCompra: string | number | null }>(
        `SELECT "precioCompra" FROM "Vehiculo" WHERE id = $1`,
        [inv.vehiculo_id]
      )
      precioCompra = num(vRes.rows[0]?.precioCompra)
      if (precioCompra == null || precioCompra <= 0) {
        throw new ConvertirError(
          'SIN_PRECIO_COMPRA',
          `El vehículo ${inv.vehiculo_id} no tiene precio de compra; no se puede calcular el margen REBU sin inventarlo.`,
          409,
          { vehiculoId: inv.vehiculo_id }
        )
      }
    }

    const amounts = computeConvertedAmounts({ total: oldTotal, target, precioCompra })

    // INVARIANTE DURA: el total no puede cambiar (rompería la cadena).
    if (round2(amounts.total_amount) !== round2(oldTotal)) {
      throw new ConvertirError(
        'TOTAL_CAMBIARIA',
        `La conversión cambiaría el total (${oldTotal} → ${amounts.total_amount}); abortada para no romper la cadena Verifactu.`,
        409,
        { totalViejo: oldTotal, totalNuevo: amounts.total_amount }
      )
    }

    const upd = await client.query<Invoice>(
      `UPDATE invoices
          SET invoice_type = $1,
              taxable_base = $2,
              vat_rate = $3,
              vat_amount = $4,
              rebu_margin = $5,
              rebu_taxable_base = $6,
              rebu_vat_amount = $7,
              updated_at = NOW()
        WHERE id = $8
        RETURNING *`,
      [
        target,
        amounts.taxable_base,
        amounts.vat_rate,
        amounts.vat_amount,
        amounts.rebu_margin,
        amounts.rebu_taxable_base,
        amounts.rebu_vat_amount,
        inv.id,
      ]
    )
    const updated = upd.rows[0]

    // IVA/cuota antes vs. después (para el reporte a la gestora).
    const ivaAntes =
      inv.invoice_type === 'VAT'
        ? num(inv.vat_amount) ?? round2(oldTotal - oldTotal / 1.21)
        : num(inv.rebu_vat_amount) ?? 0
    const ivaDespues =
      target === 'VAT' ? amounts.vat_amount ?? 0 : amounts.rebu_vat_amount ?? 0

    await client.query(
      `INSERT INTO invoice_audit_logs
         (invoice_id, action, old_values_json, new_values_json, reason, user_id, user_role)
       VALUES ($1, 'REGIME_CONVERTED', $2, $3, $4, $5, $6)`,
      [
        inv.id,
        JSON.stringify({
          invoice_type: inv.invoice_type,
          taxable_base: inv.taxable_base,
          vat_rate: inv.vat_rate,
          vat_amount: inv.vat_amount,
          rebu_margin: inv.rebu_margin,
          rebu_taxable_base: inv.rebu_taxable_base,
          rebu_vat_amount: inv.rebu_vat_amount,
          total_amount: inv.total_amount,
        }),
        JSON.stringify({
          invoice_type: target,
          taxable_base: amounts.taxable_base,
          vat_rate: amounts.vat_rate,
          vat_amount: amounts.vat_amount,
          rebu_margin: amounts.rebu_margin,
          rebu_taxable_base: amounts.rebu_taxable_base,
          rebu_vat_amount: amounts.rebu_vat_amount,
          total_amount: amounts.total_amount,
        }),
        `Conversión de régimen en el lugar ${inv.invoice_type}→${target} (mismo número ${inv.full_invoice_number}); total intacto, sin rectificativa.`,
        opts.userId ?? null,
        opts.userRole ?? null,
      ]
    )

    await client.query('COMMIT')
    ctx = {
      inv,
      updated,
      ivaAntes,
      ivaDespues,
      marginNoPositivo: amounts.marginNoPositivo,
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  // ---- A partir de acá la conversión YA está commiteada. Nada revierte. ----

  const diferenciaIvaAntesDespues = round2(ctx.ivaAntes - ctx.ivaDespues)

  // Verificación DEFENSIVA de la cadena (read-only). La conversión no inserta
  // ni altera registros, así que la cadena debe seguir intacta; si apareciera
  // una rotura es preexistente → se deja un audit de alerta, no se revierte.
  let cadenaOk = true
  try {
    const rows = await pool.query<FacturacionRegistroRow>(
      `SELECT * FROM facturacion_registros ORDER BY id ASC`
    )
    const roturas = verifyChainRows(rows.rows)
    cadenaOk = roturas.length === 0
    if (!cadenaOk) {
      console.error(
        `[invoiceConvertRegimen] ALERTA: cadena rota tras convertir ${ctx.updated.full_invoice_number}:`,
        roturas
      )
      await auditar(
        ctx.updated.id,
        'CHAIN_ALERT',
        { roturas },
        `Cadena Verifactu con roturas tras convertir ${ctx.updated.full_invoice_number} (preexistentes; la conversión no toca la cadena).`,
        opts.userId ?? null
      )
    }
  } catch (chainErr) {
    console.error(
      `[invoiceConvertRegimen] no se pudo verificar la cadena tras ${ctx.updated.full_invoice_number}:`,
      chainErr
    )
  }

  // PDF del nuevo régimen (mismo camino que la emisión: buildInvoicePdf elige el
  // generador REBU/IVA por invoice_type). Best-effort: si falla, PDF_PENDING.
  let invoiceForResp = ctx.updated
  let pdfBytes: Uint8Array | null = null
  let pdfPendiente = false
  try {
    const attached = await generateAndAttachPdf(ctx.updated)
    invoiceForResp = attached.invoice
    pdfBytes = attached.pdf
  } catch (pdfErr) {
    pdfPendiente = true
    console.error(
      `[invoiceConvertRegimen] PDF falló para ${ctx.updated.full_invoice_number}:`,
      pdfErr
    )
    try {
      const back = await pool.query<Invoice>(
        `UPDATE invoices SET status = 'PDF_PENDING', updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [ctx.updated.id]
      )
      invoiceForResp = back.rows[0] ?? { ...ctx.updated, status: 'PDF_PENDING' }
    } catch {
      invoiceForResp = { ...ctx.updated, status: 'PDF_PENDING' }
    }
    await auditar(
      ctx.updated.id,
      'STATUS_CHANGED',
      {
        status: 'PDF_PENDING',
        error: (pdfErr as Error)?.message ?? String(pdfErr),
      },
      'Conversión de régimen commiteada; el PDF del nuevo régimen no se pudo generar.',
      opts.userId ?? null
    )
  }

  // Post-proceso fuera del camino crítico: CB, expediente y gestoría. Reusa los
  // hooks existentes; ninguno revierte la conversión.
  const runNotifications = async () => {
    // Costo/Beneficio: la fila del coche llevaba el desglose del régimen viejo.
    if (invoiceForResp.vehiculo_id != null) {
      try {
        await resyncVehiculoRowToCB(
          invoiceForResp.vehiculo_id,
          undefined,
          `convert-regimen:${invoiceForResp.full_invoice_number}`
        )
      } catch (cbErr) {
        console.error('[invoiceConvertRegimen] resync CB falló:', cbErr)
      }
    }

    // Expediente: retail-vat ↔ retail-rebu, luego recálculo de la checklist
    // (REBU exige contrato-venta). Sólo re-tipifica expedientes retail (no pisa
    // deposito/b2b).
    try {
      const nuevoTipo = target === 'REBU' ? 'retail-rebu' : 'retail-vat'
      const expRes = await pool.query<{ id: number }>(
        `UPDATE expedientes
            SET tipo_operacion = $1, updated_at = NOW()
          WHERE numero_factura = $2
            AND tipo_operacion IN ('retail-vat', 'retail-rebu')
        RETURNING id`,
        [nuevoTipo, invoiceForResp.full_invoice_number]
      )
      const expId = expRes.rows[0]?.id
      if (expId != null) await recalcularExpediente(pool, expId)
    } catch (expErr) {
      console.error('[invoiceConvertRegimen] recálculo expediente falló:', expErr)
    }

    // Archivado en OneDrive/GESTORIA: reemplaza la copia archivada por la del
    // nuevo régimen (aún no se entregó, así que reemplazar es correcto).
    if (pdfBytes) {
      try {
        await notifyGestoriaInvoice({
          numeroFactura: invoiceForResp.full_invoice_number,
          fechaISO: fechaISO(invoiceForResp.invoice_date),
          matricula: invoiceForResp.vehicle_plate,
          marca: invoiceForResp.vehicle_make,
          modelo: invoiceForResp.vehicle_model,
          tipo: target,
          pdfBase64: Buffer.from(pdfBytes).toString('base64'),
        })
      } catch (gErr) {
        console.error('[invoiceConvertRegimen] archivado gestoría falló:', gErr)
      }
    }
  }

  const result: ConvertirResult = {
    invoice: invoiceForResp,
    sinCambios: false,
    cadenaOk,
    marginNoPositivo: ctx.marginNoPositivo,
    diferenciaIvaAntesDespues,
    pdfPendiente,
  }

  if (opts.deferNotifications) {
    return { ...result, runNotifications }
  }
  await runNotifications()
  return result
}

/** Audit best-effort del post-proceso. Nunca lanza. */
async function auditar(
  invoiceId: number,
  action: string,
  values: Record<string, unknown>,
  reason: string,
  userId: string | null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason, user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, action, JSON.stringify(values), reason, userId]
    )
  } catch (err) {
    console.error('[invoiceConvertRegimen] audit log falló:', err)
  }
}

function fechaISO(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10)
}
