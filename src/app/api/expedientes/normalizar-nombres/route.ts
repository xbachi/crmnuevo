/**
 * POST /api/expedientes/normalizar-nombres
 * body: { year, quarter, dryRun?: boolean }   ← dryRun por defecto TRUE
 *
 * Renombra los archivos de las carpetas de expediente de OneDrive a la
 * convención canónica ({Tipo-Doc}-{Marca}-{Modelo}-{Matricula}.ext, ver
 * src/lib/nombreCanonico.ts): los nombres reales son un desastre
 * ("FRA.pdf", "factura-venta (1).pdf", "Contrrato compra-sandero.jpeg").
 *
 * QUÉ se toca: SÓLO lo identificado con certeza — por hash contra
 * facturas_registro, o por un nombre inequívoco. Un archivo ambiguo NO se toca
 * jamás (renombrarlo mal es peor que dejarlo feo), ni los que están en conflicto
 * (mismo contenido con nombre de otro documento: uno de los dos no existe).
 *
 * El renombrado físico lo hace el server (scripts/rename_expediente_files.js):
 * el CRM en Vercel no ve el mount rclone. Cada operación aplicada queda en
 * expedientes_renombres (nombre viejo → nombre nuevo) → reversible.
 *
 * Auth: sesión de admin. maxDuration 60: el mount rclone es lento.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { quarterRange } from '@/lib/facturasMonitor'
import { normPlate } from '@/lib/costoBeneficioSheet'
import {
  analizarCarpeta,
  indexarRegistros,
  matriculaFromCarpeta,
  type ArchivoExpediente,
  type RegistroHash,
} from '@/lib/expedienteDocs'
import { planNombresCarpeta, type ArchivoParaRenombrar } from '@/lib/nombreCanonico'
import {
  postRenombreWebhook,
  type OperacionBorrado,
  type OperacionRenombre,
} from '@/lib/renombreWebhook'

export const maxDuration = 60

interface CarpetaRow {
  mes: string
  carpeta: string
  matricula_norm: string | null
  archivos: ArchivoExpediente[]
}

interface Omitido {
  carpeta: string
  nombre: string
  motivo: string
}

export async function POST(request: NextRequest) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response

  let body: { year?: unknown; quarter?: unknown; dryRun?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const year = parseInt(String(body.year ?? new Date().getFullYear()), 10)
  const quarter = parseInt(String(body.quarter ?? ''), 10)
  if (![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: 'quarter debe ser 1, 2, 3 o 4' }, { status: 400 })
  }
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: 'year inválido' }, { status: 400 })
  }
  const dryRun = body.dryRun !== false // sólo escribe con dryRun:false explícito

  try {
    // 1. Snapshot de OneDrive (con hash por archivo): sin él no se sabe qué es
    //    cada archivo y renombrar sería adivinar.
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes_carpetas') AS reg`
    )
    if (!reg.rows[0]?.reg) {
      return NextResponse.json(
        {
          ok: false,
          verificable: false,
          nota: 'La tabla expedientes_carpetas no existe todavía — sin snapshot de OneDrive no se puede renombrar.',
        },
        { status: 409 }
      )
    }
    const snap = await pool.query<CarpetaRow>(
      `SELECT mes, carpeta, matricula_norm, archivos
         FROM expedientes_carpetas
        WHERE anio = $1 AND trimestre = $2
        ORDER BY mes, carpeta`,
      [year, quarter]
    )
    if (snap.rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          verificable: false,
          nota: `Sin snapshot de OneDrive para ${quarter}T ${year} — corré el escaneo de expedientes antes de renombrar.`,
        },
        { status: 409 }
      )
    }

    // 2. Registro de facturas (hash de contenido) → identidad real de cada PDF.
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
    const hashes = indexarRegistros(registros)

    // 3. Marca/modelo por matrícula (de las facturas del año: es la fuente que
    //    ya usa el webhook de gestoría). Sin marca/modelo el nombre canónico
    //    simplemente omite ese segmento.
    const { from } = quarterRange(year, 1)
    const { to } = quarterRange(year, 4)
    const veh = await pool.query<{
      vehicle_plate: string | null
      vehicle_make: string | null
      vehicle_model: string | null
    }>(
      `SELECT vehicle_plate, vehicle_make, vehicle_model
         FROM invoices
        WHERE vehicle_plate IS NOT NULL
          AND invoice_date >= $1 AND invoice_date < $2`,
      [from, to]
    )
    const coches = new Map<string, { marca: string | null; modelo: string | null }>()
    for (const v of veh.rows) {
      if (!v.vehicle_plate) continue
      const key = normPlate(v.vehicle_plate)
      if (!coches.has(key) || (!coches.get(key)!.marca && v.vehicle_make)) {
        coches.set(key, { marca: v.vehicle_make, modelo: v.vehicle_model })
      }
    }

    // 4. Plan por carpeta.
    const renombrar: OperacionRenombre[] = []
    const borrar: OperacionBorrado[] = []
    const omitidos: Omitido[] = []
    const yaCanonicos: { carpeta: string; nombre: string }[] = []

    for (const c of snap.rows) {
      const plate = c.matricula_norm
        ? normPlate(c.matricula_norm)
        : matriculaFromCarpeta(c.carpeta)
      const archivos = Array.isArray(c.archivos) ? c.archivos : []
      const analisis = analizarCarpeta(archivos, { hashes, matricula: plate })

      const seguros: ArchivoParaRenombrar[] = []
      for (const a of analisis.archivos) {
        if (a.estado === 'clasificado' && a.doc) {
          seguros.push({ nombre: a.nombre, doc: a.doc, hash: a.hash })
          continue
        }
        omitidos.push({
          carpeta: c.carpeta,
          nombre: a.nombre,
          motivo:
            a.motivo ??
            (a.estado === 'irrelevante'
              ? 'documento que no es de la checklist'
              : 'no identificado con certeza'),
        })
      }

      const coche = coches.get(plate ?? '') ?? { marca: null, modelo: null }
      const plan = planNombresCarpeta(seguros, {
        marca: coche.marca,
        modelo: coche.modelo,
        matricula: plate,
      })

      for (const r of plan.renombrar) {
        const hash = seguros.find((s) => s.nombre === r.de)?.hash ?? null
        renombrar.push({ mes: c.mes, carpeta: c.carpeta, de: r.de, a: r.a, hash })
      }
      for (const d of plan.duplicados) {
        const hash = seguros.find((s) => s.nombre === d.nombre)?.hash ?? null
        borrar.push({
          mes: c.mes,
          carpeta: c.carpeta,
          nombre: d.nombre,
          hash,
          duplicadoDe: d.duplicadoDe,
        })
      }
      for (const n of plan.yaCanonicos) yaCanonicos.push({ carpeta: c.carpeta, nombre: n })
    }

    const informeDry = {
      ok: true,
      dryRun: true,
      year,
      quarter,
      carpetas: snap.rows.length,
      renombrados: renombrar.map((r) => ({ carpeta: r.carpeta, de: r.de, a: r.a })),
      duplicados: borrar.map((b) => ({
        carpeta: b.carpeta,
        nombre: b.nombre,
        duplicadoDe: b.duplicadoDe,
      })),
      omitidos,
      yaCanonicos,
      fallidos: [] as { carpeta: string; nombre: string; motivo: string }[],
      nota: 'Simulación: no se renombró nada. Volvé a llamar con dryRun:false para aplicar.',
    }
    if (dryRun) return NextResponse.json(informeDry)

    // 5. Aplicar. La traza es obligatoria: sin la tabla de renombres no hay
    //    forma de deshacer, así que no se toca OneDrive.
    const regRen = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes_renombres') AS reg`
    )
    if (!regRen.rows[0]?.reg) {
      return NextResponse.json(
        {
          ok: false,
          nota: 'Falta la tabla expedientes_renombres (create-expedientes-renombres.sql) — sin traza no se renombra nada.',
        },
        { status: 409 }
      )
    }
    if (renombrar.length === 0 && borrar.length === 0) {
      return NextResponse.json({ ...informeDry, dryRun: false, nota: 'No había nada que renombrar.' })
    }

    const enviado = await postRenombreWebhook({ anio: year, trimestre: quarter, renombrar, borrar })
    if (!enviado.ok) {
      return NextResponse.json(
        { ok: false, dryRun: false, error: enviado.error ?? 'el receptor de renombrado falló' },
        { status: 502 }
      )
    }

    // carpeta+nombre → contexto de la operación pedida (mes, hash, duplicadoDe).
    const pedidas = new Map<string, { mes: string; hash: string | null; duplicadoDe?: string }>()
    const clave = (carpeta: string, nombre: string) => `${carpeta} ${nombre}`
    for (const r of renombrar) pedidas.set(clave(r.carpeta, r.de), { mes: r.mes, hash: r.hash })
    for (const b of borrar)
      pedidas.set(clave(b.carpeta, b.nombre), {
        mes: b.mes,
        hash: b.hash,
        duplicadoDe: b.duplicadoDe,
      })

    const renombrados: { carpeta: string; de: string; a: string }[] = []
    const duplicadosBorrados: { carpeta: string; nombre: string; duplicadoDe: string }[] = []
    const fallidos: { carpeta: string; nombre: string; motivo: string }[] = []

    for (const r of enviado.resultados ?? []) {
      const ctx = pedidas.get(clave(r.carpeta, r.nombre))
      if (!r.ok) {
        fallidos.push({
          carpeta: r.carpeta,
          nombre: r.nombre,
          motivo: r.motivo ?? 'el server omitió la operación',
        })
        continue
      }
      // ok:true + omitido = no hacía falta tocarlo (ya estaba bien): sin traza.
      if (r.accion === 'omitido') continue
      if (r.accion === 'renombrado') {
        renombrados.push({ carpeta: r.carpeta, de: r.nombre, a: r.destino ?? '' })
      } else {
        duplicadosBorrados.push({
          carpeta: r.carpeta,
          nombre: r.nombre,
          duplicadoDe: ctx?.duplicadoDe ?? '',
        })
      }
      await pool.query(
        `INSERT INTO expedientes_renombres
           (anio, trimestre, mes, carpeta, nombre_original, nombre_nuevo, hash, accion, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          year,
          quarter,
          ctx?.mes ?? '',
          r.carpeta,
          r.nombre,
          r.destino ?? null,
          ctx?.hash ?? null,
          r.accion,
          String(auth.session.uid),
        ]
      )
    }

    return NextResponse.json({
      ok: fallidos.length === 0,
      dryRun: false,
      year,
      quarter,
      carpetas: snap.rows.length,
      renombrados,
      duplicados: duplicadosBorrados,
      omitidos,
      yaCanonicos,
      fallidos,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
