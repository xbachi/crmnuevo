/**
 * GET /api/gestoria/chequeo-expedientes?quarter=&year=
 *
 * Chequeo integral de expedientes de gestoría: cruza facturas activas (DB),
 * carpetas de OneDrive (snapshot en expedientes_carpetas) y bandas de mes de
 * la hoja "CB <año>". Toda la lógica de cruce vive en
 * src/lib/chequeoExpedientes.ts (pura); acá sólo se juntan las fuentes.
 *
 * Auth DUAL (patrón /api/automation-log): X-Admin-Secret válido O sesión de
 * usuario. Está en la whitelist del middleware y se valida acá adentro.
 */

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import { quarterRange } from '@/lib/facturasMonitor'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import {
  chequearExpedientes,
  parseCbBandas,
  type CarpetaSnapshot,
  type CbCocheBanda,
} from '@/lib/chequeoExpedientes'
import { normPlate } from '@/lib/costoBeneficioSheet'
import { cargarAliasIndex } from '@/lib/aliasMatriculas'
import type { RegistroHash } from '@/lib/expedienteDocs'
import type { TipoOperacion } from '@/lib/expedienteChecklist'

const SHEET_ID =
  process.env.COSTOBENEFICIO_SPREADSHEET_ID || '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'

// Estados de factura que cuentan como activas (emitidas de verdad). Excluye
// RECTIFIED (la original anulada por una rectificativa); las RECTIFYING se
// filtran por invoice_type — una rectificativa no es una venta con expediente.
const ACTIVE_STATUSES = ['ISSUED', 'IMPORTED', 'PDF_PENDING']

async function leerCbBandas(year: number): Promise<CbCocheBanda[] | null> {
  try {
    const auth = await getGoogleSheetsAuth()
    const api = google.sheets({ version: 'v4', auth })
    const vr = await api.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `CB ${year}!A1:S`,
      valueRenderOption: 'FORMATTED_VALUE',
    })
    return parseCbBandas((vr.data.values ?? []) as string[][])
  } catch (err) {
    console.error('[chequeo-expedientes] hoja CB no legible:', (err as Error)?.message ?? err)
    return null
  }
}

export async function GET(request: NextRequest) {
  // Auth dual: admin secret (para curl/n8n) o sesión de usuario (UI).
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const gotSecret = request.headers.get('x-admin-secret') ?? ''
  if (!secret || gotSecret !== secret) {
    const auth = requireApiSession(request)
    if (auth.response) return auth.response
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
  const quarter = parseInt(searchParams.get('quarter') || '', 10)
  if (![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: 'quarter debe ser 1, 2, 3 o 4' }, { status: 400 })
  }
  const { from, to } = quarterRange(year, quarter)

  try {
    // 1. Facturas activas del trimestre.
    const inv = await pool.query<{
      full_invoice_number: string
      invoice_date: string
      vehicle_plate: string | null
    }>(
      `SELECT full_invoice_number, invoice_date::text, vehicle_plate
         FROM invoices
        WHERE status = ANY($1) AND invoice_date >= $2 AND invoice_date < $3
          AND invoice_type <> 'RECTIFYING'
        ORDER BY invoice_date`,
      [ACTIVE_STATUSES, from, to]
    )
    const facturas = inv.rows.map((r) => ({
      numero: r.full_invoice_number,
      matricula: r.vehicle_plate,
      fecha: r.invoice_date,
    }))

    // 2. Snapshot de carpetas OneDrive (tabla opcional → to_regclass).
    let carpetas: CarpetaSnapshot[] | null = null
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes_carpetas') AS reg`
    )
    if (reg.rows[0]?.reg) {
      const snap = await pool.query<{
        mes: string
        carpeta: string
        matricula_norm: string | null
        archivos: { nombre: string; bytes?: number | null; hash?: string | null }[]
        scanned_at: string
      }>(
        `SELECT mes, carpeta, matricula_norm, archivos, scanned_at::text
           FROM expedientes_carpetas
          WHERE anio = $1 AND trimestre = $2
          ORDER BY mes, carpeta`,
        [year, quarter]
      )
      if (snap.rows.length > 0) {
        carpetas = snap.rows.map((r) => ({
          mes: r.mes,
          carpeta: r.carpeta,
          matricula: r.matricula_norm,
          archivos: Array.isArray(r.archivos) ? r.archivos : [],
          scannedAt: r.scanned_at,
        }))
      }
    }

    // 3. Tipos de operación por matrícula (tabla expedientes, también opcional).
    const tipos = new Map<string, TipoOperacion>()
    const regExp = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes') AS reg`
    )
    if (regExp.rows[0]?.reg) {
      const exps = await pool.query<{ matricula: string | null; tipo_operacion: TipoOperacion }>(
        `SELECT matricula, tipo_operacion
           FROM expedientes
          WHERE invoice_date >= $1 AND invoice_date < $2 AND matricula IS NOT NULL`,
        [from, to]
      )
      for (const r of exps.rows) {
        if (r.matricula) tipos.set(normPlate(r.matricula), r.tipo_operacion)
      }
    }

    // 4. Registro de facturas (hash de contenido) → identifica los PDFs de la
    //    carpeta sin depender del nombre. Sin límite de período: la factura de
    //    compra de un coche vendido en el 2T puede ser de cualquier fecha.
    let registros: RegistroHash[] = []
    const regFact = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.facturas_registro') AS reg`
    )
    if (regFact.rows[0]?.reg) {
      const rows = await pool.query<{
        hash_contenido: string
        categoria: string
        matricula: string | null
      }>(
        `SELECT hash_contenido, categoria, matricula
           FROM facturas_registro
          WHERE categoria = 'coche-compra' AND matricula IS NOT NULL`
      )
      registros = rows.rows.map((r) => ({
        hash: r.hash_contenido,
        categoria: r.categoria,
        matricula: r.matricula,
      }))
    }

    // 5. Hoja CB entera (la banda equivocada puede ser de otro trimestre).
    const cb = await leerCbBandas(year)

    // 6. Alias de matrícula (vehiculo_matriculas): la factura/carpeta/CB pueden
    //    tener la matrícula vieja del coche. Tabla opcional → índice vacío.
    const alias = await cargarAliasIndex(pool)

    const resultado = chequearExpedientes({
      year,
      quarter,
      facturas,
      carpetas,
      cb,
      tipos,
      registros,
      alias,
    })
    return NextResponse.json({ ok: resultado.resumen.ok, ...resultado })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
