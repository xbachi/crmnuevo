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
 * el CRM en Vercel no ve el mount rclone.
 *
 * TRAZA PRIMERO (incidente 2T 2026): se manda el trimestre en LOTES y, antes de
 * cada lote, la intención de cada operación queda en expedientes_renombres con
 * estado='pendiente'; el resultado del server la confirma ('aplicado' /
 * 'fallido' / 'omitido'). Si la función muere en el medio queda el rastro de qué
 * se iba a hacer — que es exactamente lo que faltó cuando el renombrado se
 * ejecutó y el 502 se llevó puesta la traza.
 *
 * Se corta antes del límite de la función (maxDuration 60) y se devuelve
 * { completado:false, restantes, siguienteLote } en vez de morir con un 502: la
 * UI vuelve a llamar y la corrida CONTINÚA (lo ya renombrado sale como canónico
 * porque el plan se recalcula sobre snapshot + traza aplicada).
 *
 * Auth: sesión de admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { quarterRange } from '@/lib/facturasMonitor'
import { normPlate } from '@/lib/costoBeneficioSheet'
import { cargarAliasIndex, canonPlate } from '@/lib/aliasMatriculas'
import {
  analizarCarpeta,
  indexarRegistros,
  matriculaFromCarpeta,
  type ArchivoExpediente,
  type RegistroHash,
} from '@/lib/expedienteDocs'
import { planNombresCarpeta, type ArchivoParaRenombrar } from '@/lib/nombreCanonico'
import {
  aplicarTraza,
  armarLotes,
  claveOp,
  esBorrado,
  esRenombre,
  type Op,
  type TrazaRow,
} from '@/lib/renombrePlan'
import {
  postRenombreWebhook,
  type OperacionBorrado,
  type OperacionRenombre,
} from '@/lib/renombreWebhook'

export const maxDuration = 60

/** Operaciones por llamada al webhook. El mount rclone tarda ~1s por archivo. */
const OPS_POR_LOTE = 8
/** Presupuesto de trabajo del handler: margen real contra los 60s de la función. */
const PRESUPUESTO_MS = 45_000
/** Nunca esperar al server más de esto (ni más de lo que quede de presupuesto). */
const WEBHOOK_MAX_MS = 25_000

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
  const inicio = Date.now()
  const restaPresupuesto = () => PRESUPUESTO_MS - (Date.now() - inicio)

  try {
    // 0. Alias de matrícula: la carpeta puede tener la matrícula vieja del coche
    //    y la factura/registro la nueva (o al revés) — es el mismo coche.
    const alias = await cargarAliasIndex(pool)
    const canon = (p: string) => canonPlate(alias, p)

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

    // 4. Traza: lo YA aplicado se proyecta sobre el snapshot (el cron sólo lo
    //    refresca a las 21:15), y las intenciones pendientes se reusan en vez de
    //    duplicar filas. Sin esto, la segunda corrida repetiría renombrados.
    const trazaMeta = await pool.query<{ reg: string | null; tiene_estado: boolean }>(
      `SELECT to_regclass('public.expedientes_renombres') AS reg,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'expedientes_renombres' AND column_name = 'estado'
              ) AS tiene_estado`
    )
    const hayTraza = Boolean(trazaMeta.rows[0]?.reg)
    const tieneEstado = Boolean(trazaMeta.rows[0]?.tiene_estado)

    let traza: TrazaRow[] = []
    if (hayTraza) {
      const filas = await pool.query<TrazaRow>(
        `SELECT id, carpeta, nombre_original, nombre_nuevo, accion,
                ${tieneEstado ? 'estado' : `'aplicado'::text AS estado`}
           FROM expedientes_renombres
          WHERE anio = $1 AND trimestre = $2
          ORDER BY id`,
        [year, quarter]
      )
      traza = filas.rows
    }
    const trazaPorCarpeta = new Map<string, TrazaRow[]>()
    for (const t of traza) {
      if (!trazaPorCarpeta.has(t.carpeta)) trazaPorCarpeta.set(t.carpeta, [])
      trazaPorCarpeta.get(t.carpeta)!.push(t)
    }
    // Intención sin confirmar (la corrida anterior murió): se reusa su fila.
    const pendientes = new Map<string, number>()
    for (const t of traza) {
      if (t.estado === 'pendiente') pendientes.set(claveOp(t.carpeta, t.nombre_original), t.id)
    }

    const cochesCanon = new Map<string, { marca: string | null; modelo: string | null }>()
    for (const [plate, datos] of coches) cochesCanon.set(canon(plate), datos)

    // 5. Plan por carpeta, sobre el estado REAL (snapshot + traza aplicada).
    const ops: Op[] = []
    const omitidos: Omitido[] = []
    const yaCanonicos: { carpeta: string; nombre: string }[] = []

    for (const c of snap.rows) {
      const plate = c.matricula_norm
        ? normPlate(c.matricula_norm)
        : matriculaFromCarpeta(c.carpeta)
      const archivos = aplicarTraza(
        Array.isArray(c.archivos) ? c.archivos : [],
        trazaPorCarpeta.get(c.carpeta) ?? []
      )
      const analisis = analizarCarpeta(archivos, { hashes, matricula: plate, alias })

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

      const coche = cochesCanon.get(plate ? canon(plate) : '') ?? { marca: null, modelo: null }
      const plan = planNombresCarpeta(seguros, {
        marca: coche.marca,
        modelo: coche.modelo,
        matricula: plate,
      })

      for (const d of plan.duplicados) {
        ops.push({
          tipo: 'borrar',
          mes: c.mes,
          carpeta: c.carpeta,
          nombre: d.nombre,
          destino: null,
          hash: seguros.find((s) => s.nombre === d.nombre)?.hash ?? null,
          duplicadoDe: d.duplicadoDe,
        })
      }
      for (const r of plan.renombrar) {
        ops.push({
          tipo: 'renombrar',
          mes: c.mes,
          carpeta: c.carpeta,
          nombre: r.de,
          destino: r.a,
          hash: seguros.find((s) => s.nombre === r.de)?.hash ?? null,
        })
      }
      for (const n of plan.yaCanonicos) yaCanonicos.push({ carpeta: c.carpeta, nombre: n })
    }

    const total = ops.length
    const informeDry = {
      ok: true,
      dryRun: true,
      completado: true,
      year,
      quarter,
      carpetas: snap.rows.length,
      total,
      procesados: 0,
      restantes: total,
      siguienteLote: ops[0]?.carpeta ?? null,
      renombrados: ops
        .filter(esRenombre)
        .map((o) => ({ carpeta: o.carpeta, de: o.nombre, a: o.destino })),
      duplicados: ops
        .filter(esBorrado)
        .map((o) => ({ carpeta: o.carpeta, nombre: o.nombre, duplicadoDe: o.duplicadoDe })),
      omitidos,
      yaCanonicos,
      fallidos: [] as { carpeta: string; nombre: string; motivo: string }[],
      nota: 'Simulación: no se renombró nada. Volvé a llamar con dryRun:false para aplicar.',
    }
    if (dryRun) return NextResponse.json(informeDry)

    // 6. Aplicar. Sin traza (o sin la columna estado) no se toca OneDrive: es la
    //    única forma de poder deshacer, y de sobrevivir a que la función muera.
    if (!hayTraza) {
      return NextResponse.json(
        {
          ok: false,
          nota: 'Falta la tabla expedientes_renombres (create-expedientes-renombres.sql) — sin traza no se renombra nada.',
        },
        { status: 409 }
      )
    }
    if (!tieneEstado) {
      return NextResponse.json(
        {
          ok: false,
          nota: 'Falta la columna estado en expedientes_renombres (add-expedientes-renombres-estado.sql) — sin registrar la intención ANTES de renombrar no se toca OneDrive.',
        },
        { status: 409 }
      )
    }
    if (total === 0) {
      return NextResponse.json({
        ...informeDry,
        dryRun: false,
        restantes: 0,
        siguienteLote: null,
        nota: 'No había nada que renombrar.',
      })
    }

    const renombrados: { carpeta: string; de: string; a: string }[] = []
    const duplicadosBorrados: { carpeta: string; nombre: string; duplicadoDe: string }[] = []
    const fallidos: { carpeta: string; nombre: string; motivo: string }[] = []
    const lotes = armarLotes(ops, OPS_POR_LOTE)

    let procesados = 0
    let completado = true
    let errorLote: string | null = null

    for (const lote of lotes) {
      // Cortar limpio antes del límite de la función: mejor devolver el progreso
      // y que la UI siga llamando que morir con un 502 a mitad de un renombrado.
      if (restaPresupuesto() <= 5_000) {
        completado = false
        break
      }

      // 6a. INTENCIÓN primero: si la función muere ahora, queda el rastro.
      const ids = await registrarIntencion(lote, { year, quarter, uid: String(auth.session.uid), pendientes })

      const renombrar: OperacionRenombre[] = lote
        .filter(esRenombre)
        .map((o) => ({ mes: o.mes, carpeta: o.carpeta, de: o.nombre, a: o.destino, hash: o.hash }))
      const borrar: OperacionBorrado[] = lote.filter(esBorrado).map((o) => ({
        mes: o.mes,
        carpeta: o.carpeta,
        nombre: o.nombre,
        hash: o.hash,
        duplicadoDe: o.duplicadoDe,
      }))

      const enviado = await postRenombreWebhook(
        { anio: year, trimestre: quarter, renombrar, borrar },
        { timeoutMs: Math.max(5_000, Math.min(WEBHOOK_MAX_MS, restaPresupuesto())) }
      )

      // 6b. El webhook no contestó (timeout / red / 5xx): NO se sabe si el server
      //     llegó a renombrar → las intenciones quedan 'pendiente'. Marcarlas como
      //     fallidas sería mentir en la dirección opuesta.
      if (!enviado.ok) {
        completado = false
        errorLote = enviado.error ?? 'el receptor de renombrado falló'
        break
      }

      // 6c. Confirmar con el resultado real, operación por operación.
      const porClave = new Map(
        (enviado.resultados ?? []).map((r) => [claveOp(r.carpeta, r.nombre), r])
      )
      for (const op of lote) {
        const id = ids.get(claveOp(op.carpeta, op.nombre))
        const r = porClave.get(claveOp(op.carpeta, op.nombre))
        if (!r) continue // el server no lo reportó: queda 'pendiente' (no se inventa nada)
        procesados++

        if (!r.ok) {
          const motivo = r.motivo ?? 'el server omitió la operación'
          fallidos.push({ carpeta: op.carpeta, nombre: op.nombre, motivo })
          if (id) await confirmar(id, { estado: 'fallido', motivo })
          continue
        }
        if (r.accion === 'omitido') {
          // ok:true + omitido = no hacía falta tocarlo (ya estaba bien).
          if (id) await confirmar(id, { estado: 'omitido', motivo: r.motivo ?? null })
          continue
        }
        if (r.accion === 'renombrado') {
          renombrados.push({ carpeta: r.carpeta, de: r.nombre, a: r.destino ?? '' })
        } else {
          duplicadosBorrados.push({
            carpeta: r.carpeta,
            nombre: r.nombre,
            duplicadoDe: esBorrado(op) ? op.duplicadoDe : (r.destino ?? ''),
          })
        }
        if (id) {
          await confirmar(id, {
            estado: 'aplicado',
            accion: r.accion,
            nombreNuevo: r.destino ?? null,
            motivo: r.motivo ?? null,
          })
        }
      }
    }

    const restantes = total - procesados
    const siguiente = ops[procesados]
    return NextResponse.json({
      ok: fallidos.length === 0 && !errorLote && completado,
      dryRun: false,
      completado: completado && restantes === 0,
      year,
      quarter,
      carpetas: snap.rows.length,
      total,
      procesados,
      restantes,
      siguienteLote: restantes > 0 && siguiente ? siguiente.carpeta : null,
      renombrados,
      duplicados: duplicadosBorrados,
      omitidos,
      yaCanonicos,
      fallidos,
      ...(errorLote ? { error: errorLote } : {}),
      ...(restantes > 0
        ? {
            nota: `Lote parcial: ${procesados} de ${total} operaciones. Volvé a aplicar para continuar (lo ya renombrado no se vuelve a tocar).`,
          }
        : {}),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

/**
 * Una fila por operación ANTES de ejecutarla (estado 'pendiente'). Devuelve
 * carpeta+nombre → id para confirmarla después. Si ya había una intención sin
 * confirmar de una corrida anterior se REUSA: la traza no se duplica.
 */
async function registrarIntencion(
  lote: Op[],
  ctx: { year: number; quarter: number; uid: string; pendientes: Map<string, number> }
): Promise<Map<string, number>> {
  const ids = new Map<string, number>()
  const nuevas: Op[] = []
  for (const op of lote) {
    const previa = ctx.pendientes.get(claveOp(op.carpeta, op.nombre))
    if (previa) ids.set(claveOp(op.carpeta, op.nombre), previa)
    else nuevas.push(op)
  }
  if (nuevas.length === 0) return ids

  const valores: unknown[] = []
  const tuplas = nuevas.map((op, i) => {
    const b = i * 9
    valores.push(
      ctx.year,
      ctx.quarter,
      op.mes,
      op.carpeta,
      op.nombre,
      op.destino,
      op.hash,
      op.tipo === 'borrar' ? 'borrado' : 'renombrado',
      ctx.uid
    )
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},'pendiente')`
  })
  const res = await pool.query<{ id: number; carpeta: string; nombre_original: string }>(
    `INSERT INTO expedientes_renombres
       (anio, trimestre, mes, carpeta, nombre_original, nombre_nuevo, hash, accion, user_id, estado)
     VALUES ${tuplas.join(',')}
     RETURNING id, carpeta, nombre_original`,
    valores
  )
  for (const row of res.rows ?? []) ids.set(claveOp(row.carpeta, row.nombre_original), row.id)
  return ids
}

/** Confirma la intención con lo que el server DIJO que pasó (nunca con lo pedido). */
async function confirmar(
  id: number,
  r: { estado: string; accion?: string; nombreNuevo?: string | null; motivo?: string | null }
): Promise<void> {
  await pool.query(
    `UPDATE expedientes_renombres
        SET estado = $2,
            accion = COALESCE($3, accion),
            nombre_nuevo = COALESCE($4, nombre_nuevo),
            motivo = $5
      WHERE id = $1`,
    [id, r.estado, r.accion ?? null, r.nombreNuevo ?? null, r.motivo ?? null]
  )
}
