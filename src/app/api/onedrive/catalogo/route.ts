/**
 * GET /api/onedrive/catalogo
 *
 * Catálogo de solo lectura (matrícula → nº de carpeta) para que el script de
 * OneDrive resuelva el expediente de un vehículo sin tocar la DB. No escribe
 * nada; protegido por X-Admin-Secret (mismo patrón que /api/admin/verifactu).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type VehiculoRow = {
  referencia: string | null
  marca: string | null
  modelo: string | null
  matricula: string | null
  matricula_norm: string | null
  tipo: string | null
}

/**
 * Letra canónica del tipo. En DB hoy son 'C'|'I'|'D'|'R'|'M', pero quedan
 * valores legacy tipo 'Coche R' / 'Deposito Venta'.
 */
function normalizarTipo(tipo: string | null | undefined): string {
  const t = String(tipo ?? '')
    .trim()
    .toUpperCase()
  if (!t) return ''
  if (t.startsWith('COCHE R')) return 'R'
  if (t.startsWith('D')) return 'D'
  if (t.startsWith('R')) return 'R'
  return t.charAt(0)
}

/**
 * Nº de carpeta del expediente. `null` cuando la referencia no mapea a ninguna
 * carpeta conocida (p.ej. 'MAN-E9961BDJ-15169'): no inventamos número.
 */
function refCarpeta(
  referencia: string | null | undefined,
  tipo: string | null | undefined
): string | null {
  const t = normalizarTipo(tipo)
  const ref = String(referencia ?? '').trim()

  // Referencia ya prefijada: '#D-38', 'D-38', 'R11' → 'D-38' / 'R-11'.
  const m = ref.match(/^#?([DRIC])-?(\d+)$/i)
  if (m) return `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`

  const n = parseInt(ref.replace(/[^0-9]/g, ''), 10)
  if (Number.isNaN(n)) return null

  let numero: string | null = null
  if (n >= 1000 && n <= 1099) numero = String(n % 100)
  else if (n >= 1100 && n <= 1199) numero = String(100 + (n % 100))
  if (numero === null) return null

  return t === 'D' || t === 'R' ? `${t}-${numero}` : numero
}

export async function GET(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || !safeEqual(got, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const { rows } = await pool.query<VehiculoRow>(
      `SELECT referencia, marca, modelo, matricula, matricula_norm, tipo
         FROM "Vehiculo"
        WHERE matricula_norm IS NOT NULL AND matricula_norm <> ''`
    )

    const vehiculos = rows.map((v) => ({
      matricula: String(v.matricula ?? '').trim(),
      matriculaNorm: v.matricula_norm,
      ref: refCarpeta(v.referencia, v.tipo),
      marca: String(v.marca ?? '').trim(),
      modelo: String(v.modelo ?? '').trim(),
      tipo: normalizarTipo(v.tipo),
    }))

    return NextResponse.json({ ok: true, total: vehiculos.length, vehiculos })
  } catch (err) {
    console.error('[GET /api/onedrive/catalogo]', err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
