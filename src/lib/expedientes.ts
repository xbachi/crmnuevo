/**
 * Acceso a datos del expediente de venta (tabla `expedientes`,
 * migración create-expedientes.sql).
 *
 * - crearExpedienteAlEmitir: fila 'incompleto' con la checklist inicial al
 *   emitir una factura. Los emisores (invoiceService / b2b-invoice-service)
 *   la llaman best-effort FUERA de la transacción de numeración: si falla,
 *   la emisión NO se rompe (try/catch en el caller).
 * - recalcularExpediente: re-evalúa cada item contra la evidencia disponible
 *   en DB (automation_logs + facturas_registro). Solo PROMUEVE items a
 *   presente; nunca desmarca lo que un humano marcó a mano.
 */

import type { Pool, PoolClient } from 'pg'
import {
  checklistInicial,
  evaluarEstado,
  inferirTipoOperacion,
  esDepositoVehiculoTipo,
  type ChecklistItem,
  type TipoOperacion,
  type EstadoExpediente,
} from '@/lib/expedienteChecklist'
import { normPlate } from '@/lib/facturasRegistro'
import { detectarDocs, CLAVE_A_DOC } from '@/lib/expedienteDocs'

type Db = Pool | PoolClient

export interface DatosEmision {
  /** Si el caller ya conoce el tipo (p. ej. un flujo de depósito), manda. */
  tipoOperacion?: TipoOperacion
  invoiceType?: string | null // 'VAT' | 'REBU'
  dealId?: number | null
  b2bVentaId?: number | null
  vehiculoId?: number | null
  matricula?: string | null
  numeroFactura: string
  invoiceDate?: string | Date | null
}

/**
 * Crea el expediente de una factura recién emitida (estado 'incompleto',
 * checklist toda en presente=false). Idempotente por numero_factura
 * (ON CONFLICT DO NOTHING → devuelve null si ya existía).
 *
 * Detección de 'deposito': si el caller no fija tipoOperacion, se consulta
 * Vehiculo.tipo ("Deposito Venta"/"Deposito"/"D" → depósito). Si no hay
 * vehiculo o la consulta falla, se cae a invoiceType (VAT/REBU) — nunca se
 * adivina depósito sin señal.
 */
export async function crearExpedienteAlEmitir(
  db: Db,
  datos: DatosEmision
): Promise<{ id: number; tipoOperacion: TipoOperacion } | null> {
  let tipo = datos.tipoOperacion
  if (!tipo) {
    let esDeposito = false
    if (datos.vehiculoId != null) {
      const v = await db.query<{ tipo: string | null }>(
        `SELECT tipo FROM "Vehiculo" WHERE id = $1`,
        [datos.vehiculoId]
      )
      esDeposito = esDepositoVehiculoTipo(v.rows[0]?.tipo)
    }
    tipo = inferirTipoOperacion({
      invoiceType: datos.invoiceType,
      esB2B: datos.b2bVentaId != null,
      esDeposito,
    })
  }

  const checklist = checklistInicial(tipo)
  const res = await db.query<{ id: number }>(
    `INSERT INTO expedientes
       (tipo_operacion, deal_id, b2b_venta_id, vehiculo_id, matricula,
        numero_factura, invoice_date, estado, checklist)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'incompleto', $8::jsonb)
     ON CONFLICT (numero_factura) DO NOTHING
     RETURNING id`,
    [
      tipo,
      datos.dealId ?? null,
      datos.b2bVentaId ?? null,
      datos.vehiculoId ?? null,
      datos.matricula ? normPlate(datos.matricula) : null,
      datos.numeroFactura,
      datos.invoiceDate ?? null,
      JSON.stringify(checklist),
    ]
  )
  if (res.rows.length === 0) return null
  return { id: res.rows[0].id, tipoOperacion: tipo }
}

export interface ResultadoRecalculo {
  id: number
  numeroFactura: string | null
  estadoAntes: EstadoExpediente
  estadoDespues: EstadoExpediente
  /** Claves promovidas a presente por evidencia en este recálculo. */
  itemsActualizados: string[]
  cambio: boolean
}

interface ExpedienteRow {
  id: number
  numero_factura: string | null
  matricula: string | null
  estado: EstadoExpediente
  checklist: ChecklistItem[]
}

/**
 * Re-evalúa la checklist de un expediente contra la evidencia en DB:
 *  - 'factura-venta'   ← automation_logs.venta_guardada
 *  - 'factura-compra'  ← automation_logs.compra_adjunta O facturas_registro
 *  - 'contrato-compra'   con categoria 'coche-compra' y la misma matrícula
 *  - 'contrato-venta'  ← automation_logs.contrato_enviado
 *  - 'contrato-deposito' → sin verificación automática en DB (lo marca el humano)
 *  - cualquier item     ← snapshot de OneDrive (expedientes_carpetas): si la
 *    carpeta del coche contiene un archivo que detectarDocs reconoce, el item
 *    se promueve con fuente 'carpeta-onedrive'.
 * Los items sin evidencia quedan como estaban. Actualiza estado con
 * evaluarEstado (degrada a 'incompleto' si falta un requerido).
 */
export async function recalcularExpediente(
  db: Db,
  id: number
): Promise<ResultadoRecalculo | null> {
  const expRes = await db.query<ExpedienteRow>(
    `SELECT id, numero_factura, matricula, estado, checklist
       FROM expedientes WHERE id = $1`,
    [id]
  )
  const exp = expRes.rows[0]
  if (!exp) return null

  const evidencia = await buscarEvidencia(db, exp.numero_factura, exp.matricula)
  const carpeta = await buscarEvidenciaCarpeta(db, exp.matricula)

  const checklist: ChecklistItem[] = (exp.checklist ?? []).map((item) => {
    const porDb = evidencia[item.clave] === true
    const porCarpeta = carpeta[item.clave] === true
    const next: ChecklistItem = { ...item, presente: item.presente || porDb || porCarpeta }
    // Promovido SOLO por el snapshot → dejar rastro de la fuente.
    if (!item.presente && !porDb && porCarpeta && !next.nota) {
      next.nota = 'fuente: carpeta-onedrive'
    }
    return next
  })
  const itemsActualizados = checklist
    .filter((item, i) => item.presente && !(exp.checklist?.[i]?.presente ?? false))
    .map((item) => item.clave)

  const estadoDespues = evaluarEstado(checklist, exp.estado)
  const cambio = itemsActualizados.length > 0 || estadoDespues !== exp.estado
  if (cambio) {
    await db.query(
      `UPDATE expedientes
          SET checklist = $1::jsonb, estado = $2, updated_at = NOW()
        WHERE id = $3`,
      [JSON.stringify(checklist), estadoDespues, id]
    )
  }

  return {
    id: exp.id,
    numeroFactura: exp.numero_factura,
    estadoAntes: exp.estado,
    estadoDespues,
    itemsActualizados,
    cambio,
  }
}

/** Evidencia por clave de item. Ausencia de clave = no verificable. */
async function buscarEvidencia(
  db: Db,
  numeroFactura: string | null,
  matricula: string | null
): Promise<Record<string, boolean>> {
  let ventaGuardada = false
  let compraAdjunta = false
  let contratoEnviado = false
  if (numeroFactura) {
    const log = await db.query<{
      venta_guardada: boolean | null
      compra_adjunta: boolean | null
      contrato_enviado: boolean | null
    }>(
      `SELECT venta_guardada, compra_adjunta, contrato_enviado
         FROM automation_logs WHERE numero_factura = $1
        ORDER BY created_at DESC LIMIT 1`,
      [numeroFactura]
    )
    const row = log.rows[0]
    ventaGuardada = row?.venta_guardada === true
    compraAdjunta = row?.compra_adjunta === true
    contratoEnviado = row?.contrato_enviado === true
  }

  let registroCompra = false
  if (matricula) {
    const reg = await db.query(
      `SELECT 1 FROM facturas_registro
        WHERE categoria = 'coche-compra' AND matricula = $1
        LIMIT 1`,
      [normPlate(matricula)]
    )
    registroCompra = reg.rows.length > 0
  }

  return {
    'factura-venta': ventaGuardada,
    'factura-compra': compraAdjunta || registroCompra,
    'contrato-compra': compraAdjunta || registroCompra,
    'contrato-venta': contratoEnviado,
  }
}

/**
 * Evidencia desde el snapshot de OneDrive (expedientes_carpetas): los nombres
 * de archivo de la(s) carpeta(s) del coche pasados por detectarDocs. Tabla
 * opcional → to_regclass; sin tabla/matrícula/fila devuelve {} (no verificable).
 */
async function buscarEvidenciaCarpeta(
  db: Db,
  matricula: string | null
): Promise<Record<string, boolean>> {
  if (!matricula) return {}
  const reg = await db.query<{ reg: string | null }>(
    `SELECT to_regclass('public.expedientes_carpetas') AS reg`
  )
  if (!reg.rows[0]?.reg) return {}
  const res = await db.query<{ archivos: { nombre: string }[] }>(
    `SELECT archivos FROM expedientes_carpetas WHERE matricula_norm = $1`,
    [normPlate(matricula)]
  )
  if (res.rows.length === 0) return {}
  const archivos = res.rows.flatMap((r) => (Array.isArray(r.archivos) ? r.archivos : []))
  const docs = detectarDocs(archivos)
  const evidencia: Record<string, boolean> = {}
  for (const [clave, flag] of Object.entries(CLAVE_A_DOC)) {
    if (docs[flag]) evidencia[clave] = true
  }
  return evidencia
}
