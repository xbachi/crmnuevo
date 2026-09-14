/**
 * POST /api/admin/sheets-vehiculos/aviso
 *
 * Pone (o reescribe) una nota en A1 de cada pestaña gestionada por el CRM
 * ("Hoja generada por el CRM. Los cambios se hacen en el CRM."). Sólo toca la
 * nota (`fields: 'note'`): ni valores ni formato. Idempotente. El bloqueo por
 * permisos de las hojas se hace a mano.
 *
 * Protegido por X-Admin-Secret.
 */

import { NextRequest, NextResponse } from 'next/server'
import { google, type sheets_v4 } from 'googleapis'
import { getGoogleSheetsAuth, getSheetId } from '@/lib/googleSheets'
import { SHEETS_CONFIG } from '@/lib/sheetsConfig'
import { safeEqual } from '@/lib/secrets'

export const maxDuration = 60

export const NOTA_AVISO_CRM =
  'Hoja generada por el CRM. Los cambios se hacen en el CRM.'

type Hoja = 'VENTAS' | 'COMPRAS' | 'BASE_DATOS'

const PESTANAS_GESTIONADAS: Record<Hoja, string[]> = {
  VENTAS: ['Expo', 'Deposito', 'R'],
  COMPRAS: ['Compras', 'Deposito', 'R'],
  BASE_DATOS: ['Datos'],
}

function requestNotaA1(sheetId: number): sheets_v4.Schema$Request {
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 1,
      },
      rows: [{ values: [{ note: NOTA_AVISO_CRM }] }],
      fields: 'note',
    },
  }
}

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const pestanas: { hoja: Hoja; pestana: string; sheetId: number }[] = []
  const errores: string[] = []

  let sheets: sheets_v4.Sheets
  try {
    const auth = await getGoogleSheetsAuth()
    sheets = google.sheets({ version: 'v4', auth })
  } catch (err) {
    return NextResponse.json(
      { ok: false, errores: [(err as Error).message] },
      { status: 500 }
    )
  }

  for (const hoja of Object.keys(PESTANAS_GESTIONADAS) as Hoja[]) {
    const spreadsheetId = SHEETS_CONFIG.SPREADSHEET_IDS[hoja]
    const requests: sheets_v4.Schema$Request[] = []
    const resueltas: { hoja: Hoja; pestana: string; sheetId: number }[] = []
    for (const pestana of PESTANAS_GESTIONADAS[hoja]) {
      try {
        const sheetId = await getSheetId(spreadsheetId, pestana)
        requests.push(requestNotaA1(sheetId))
        resueltas.push({ hoja, pestana, sheetId })
      } catch (err) {
        errores.push(`${hoja}/${pestana}: ${(err as Error).message}`)
      }
    }
    if (requests.length === 0) continue
    try {
      // Una sola llamada por spreadsheet con todas sus notas.
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      })
      pestanas.push(...resueltas)
    } catch (err) {
      errores.push(`${hoja}: ${(err as Error).message}`)
    }
  }

  if (errores.length > 0) {
    return NextResponse.json({ ok: false, pestanas, errores }, { status: 500 })
  }
  return NextResponse.json({ ok: true, pestanas })
}
