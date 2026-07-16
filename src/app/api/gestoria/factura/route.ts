/**
 * POST /api/gestoria/factura  — registro unificado de facturas (dedup + ruteo + capa fiscal).
 *
 * Lo llama n8n al recibir/archivar una factura. Registra en `facturas_registro`
 * (fuente de verdad) y responde si es DUPLICADA y en qué CARPETA va.
 *
 * Dedup garantizado por la DB:
 *   · hash_contenido UNIQUE → mismo PDF exacto nunca dos veces
 *   · (proveedor, numero_factura) UNIQUE → mismo comprobante re-generado
 *
 * Auth: X-Webhook-Secret (mismo que /vehiculos/gasto). En whitelist del middleware.
 *
 * COMPATIBILIDAD: este endpoint alimenta todo el sistema y n8n no se toca. TODOS
 * los campos fiscales son OPCIONALES: sin ellos el comportamiento es idéntico al
 * de siempre y la fila queda `estado='registrada'`. Además tolera que las
 * migraciones fiscales no estén aplicadas (ver facturaEsquema).
 *
 * Un problema FISCAL nunca devuelve 500: la factura se registra igual como
 * `pendiente-validar` con los errores en la respuesta. Perder el documento es
 * peor que registrarlo dudoso.
 *
 * Body: {
 *   proveedor: string,
 *   categoria: 'gestoria'|'coche-servicio'|'coche-compra',
 *   hashContenido: string,           // md5 de los bytes del PDF (obligatorio)
 *   numeroFactura?: string,
 *   importe?: number|string,
 *   fechaFactura?: string,           // YYYY-MM-DD
 *   matricula?: string,
 *   nombreArchivo?: string,
 *   fuente?: string,
 *   // ── capa fiscal (todo opcional) ──
 *   nifProveedor?: string,
 *   fechaOperacion?: string,         // YYYY-MM-DD (devengo; puede diferir de la emisión)
 *   tipoOperacion?: string,          // interior|intracomunitaria|importacion|isp|exenta|rebu-compra|suplido
 *   deducible?: string,              // si|no|parcial|duda
 *   deduciblePct?: number,
 *   subcategoria?: string,
 *   lineas?: [{ tipoLinea?, tipoIva?, base, cuota?, concepto?, retencionPct?, deducible? }],
 *   extraccion?: { metodo?: 'regex'|'pdftotext'|'llm'|'manual', confianza?: number, raw?: object }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient } from 'pg'
import { pool } from '@/lib/direct-database'
import { parseImporte } from '@/lib/gastoImporte'
import { CATEGORIAS, periodoFromDate, carpetaDestino, normPlate, type Categoria } from '@/lib/facturasRegistro'
import { esPeriodoCerrado } from '@/lib/periodoLock'
import { detectarEsquemaFiscal } from '@/lib/facturaEsquema'
import { validarNif } from '@/lib/nifValidator'
import { registrarCambio, assertRegistroMutable } from '@/lib/fiscalAudit'
import {
  parseLineas,
  chequearMatematica,
  decidirEstado,
  TIPOS_OPERACION,
  DEDUCIBLES,
  type LineaFiscal,
} from '@/lib/facturaFiscal'

interface ProveedorRow {
  id: number
  nif: string | null
  pais: string | null
  tipo_operacion_defecto: string | null
  deducible_defecto: string | null
  subcategoria_defecto: string | null
  validacion_auto: boolean | null
}

/** Enum-safe: valor fuera del dominio → fallback + error visible (nunca al CHECK). */
function enDominio<T extends string>(
  valor: unknown,
  dominio: readonly T[],
  campo: string,
  errores: string[]
): T | null {
  if (valor == null || valor === '') return null
  const v = String(valor).toLowerCase().trim()
  if ((dominio as readonly string[]).includes(v)) return v as T
  errores.push(`${campo} inválido "${v}" (válidos: ${dominio.join(', ')}); ignorado`)
  return null
}

/**
 * Proveedor del maestro por nombre canónico o alias (case-insensitive: los alias
 * se guardan como vinieron, así que se comparan en minúsculas de los dos lados).
 * NO se crea si no existe: dar de alta una ficha es criterio humano (/fiscal/proveedores).
 */
async function resolverProveedor(nombre: string): Promise<ProveedorRow | null> {
  const r = await pool.query<ProveedorRow>(
    `SELECT id, nif, pais, tipo_operacion_defecto, deducible_defecto,
            subcategoria_defecto, validacion_auto
       FROM proveedores
      WHERE activo
        AND (lower(nombre) = $1
             OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE lower(a) = $1))
      LIMIT 1`,
    [nombre]
  )
  return r.rows[0] ?? null
}

async function insertarLineas(client: PoolClient, registroId: number, lineas: LineaFiscal[]): Promise<void> {
  for (const l of lineas) {
    await client.query(
      `INSERT INTO facturas_registro_lineas
         (registro_id, orden, tipo_linea, tipo_iva, base, cuota, retencion_pct, concepto, deducible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [registroId, l.orden, l.tipoLinea, l.tipoIva, l.base, l.cuota, l.retencionPct ?? null, l.concepto ?? null, l.deducible ?? null]
    )
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-webhook-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const proveedor = String(b.proveedor ?? '').toLowerCase().trim()
  const categoria = String(b.categoria ?? '').trim() as Categoria
  const hash = String(b.hashContenido ?? '').trim()
  if (!proveedor) return NextResponse.json({ error: 'proveedor requerido' }, { status: 400 })
  if (!CATEGORIAS.includes(categoria)) {
    return NextResponse.json({ error: `categoria inválida: "${categoria}". Válidas: ${CATEGORIAS.join(', ')}` }, { status: 400 })
  }
  if (!hash) return NextResponse.json({ error: 'hashContenido requerido (dedup)' }, { status: 400 })

  const numero = b.numeroFactura ? String(b.numeroFactura).trim() : null
  const importeBody = b.importe != null ? parseImporte(b.importe) : null
  const fecha = b.fechaFactura ? String(b.fechaFactura).trim() : null
  const matricula = b.matricula ? normPlate(String(b.matricula)) : null
  const nombre = b.nombreArchivo ? String(b.nombreArchivo).trim() : null
  const fuente = b.fuente ? String(b.fuente).trim() : 'email'

  const { anio, trimestre, mes } = periodoFromDate(fecha)
  const destino = carpetaDestino(categoria, matricula, anio, mes)

  // Cierre mensual: si la fecha de la factura cae en un mes ya cerrado, no se
  // registra. El PDF existe igual en OneDrive; el 409 avisa a n8n/el operador
  // que ese período ya se entregó a gestoría (n8n lo loguea).
  if (fecha && (await esPeriodoCerrado(pool, fecha).catch(() => false))) {
    return NextResponse.json(
      {
        error: `el período ${anio}-${String(mes).padStart(2, '0')} está cerrado; la factura no se registró`,
        code: 'PERIODO_CERRADO',
        hint: 'el documento quedó archivado en OneDrive pero el período ya se entregó a gestoría; reabrí el período desde /api/admin/periodos si corresponde y reenviá',
        periodo: { anio, trimestre, mes },
      },
      { status: 409 }
    )
  }

  // ── Capa fiscal. Todo lo de acá abajo degrada en silencio: si el esquema no
  //    está o los datos vienen mal, se registra igual con lo que se sepa.
  const esquema = await detectarEsquemaFiscal(pool)
  const errores: string[] = []

  const prov = esquema.proveedores ? await resolverProveedor(proveedor).catch(() => null) : null
  const proveedorConocido = prov != null

  // Los *_defecto del proveedor son FALLBACK: lo que manda el body siempre gana.
  const tipoOperacion =
    enDominio(b.tipoOperacion, TIPOS_OPERACION, 'tipoOperacion', errores) ??
    enDominio(prov?.tipo_operacion_defecto, TIPOS_OPERACION, 'tipo_operacion_defecto del proveedor', errores) ??
    'interior'
  const deducible =
    enDominio(b.deducible, DEDUCIBLES, 'deducible', errores) ??
    enDominio(prov?.deducible_defecto, DEDUCIBLES, 'deducible_defecto del proveedor', errores) ??
    'duda'
  const subcategoria =
    (b.subcategoria ? String(b.subcategoria).trim() : null) ?? prov?.subcategoria_defecto ?? null
  const deduciblePct = b.deduciblePct != null ? parseImporte(b.deduciblePct) : null

  // NIF: body > ficha del proveedor. Sin NIF por ningún lado → null/null, porque
  // "no sé" NO es "inválido" (un false acá dispararía alarmas falsas en /revision).
  const nifCrudo = b.nifProveedor ? String(b.nifProveedor).trim() : (prov?.nif ?? null)
  const nifRes = nifCrudo ? validarNif(nifCrudo, prov?.pais ?? 'ES') : null
  const nifProveedor = nifRes?.normalizado || null
  const nifValido: boolean | null = nifRes ? nifRes.valido : null
  if (nifRes && !nifRes.valido) errores.push(`NIF ${nifRes.normalizado}: ${nifRes.motivo ?? 'inválido'}`)

  const { lineas, errores: erroresLineas } = parseLineas(b.lineas)
  errores.push(...erroresLineas)
  const tieneLineas = lineas.length > 0
  const chequeo = chequearMatematica(lineas, importeBody)
  // El cuadre sólo opina si hay algo que cuadrar: el body de siempre (importe sin
  // desglose) no es una factura mala, es una factura sin extraer → nada de ruido.
  if (tieneLineas) errores.push(...chequeo.errores)

  // Si vienen líneas cuadradas pero sin importe, el total lo dan las líneas.
  const importeDerivado = tieneLineas && importeBody == null
  const importe = importeDerivado ? chequeo.calculado : importeBody

  const extraccion = (b.extraccion ?? {}) as Record<string, unknown>
  const metodo = extraccion.metodo ? String(extraccion.metodo).trim() : null
  const confianzaCruda = extraccion.confianza != null ? parseImporte(extraccion.confianza) : null
  // NUMERIC(3,2): fuera de 0..1 no entra.
  const confianza = confianzaCruda != null ? Math.min(1, Math.max(0, confianzaCruda)) : null
  const raw = extraccion.raw != null ? JSON.stringify(extraccion.raw) : null

  const { estado, datosIncompletos } = decidirEstado({
    tieneLineas,
    mathOk: chequeo.ok,
    confianza,
    nifValido,
    proveedorConocido,
    validacionAuto: !!prov?.validacion_auto,
    deducible,
  })

  const fechaOperacion = b.fechaOperacion ? String(b.fechaOperacion).trim() : null
  const baseTotal = tieneLineas ? chequeo.baseTotal : null
  const cuotaTotal = tieneLineas ? chequeo.cuotaTotal : null

  const fiscal = {
    estado,
    baseTotal,
    cuotaTotal,
    mathOk: chequeo.ok,
    errores,
    nifValido,
    proveedorId: prov?.id ?? null,
    lineas: lineas.length,
    importe,
    importeDerivado,
  }

  // Cuando hay líneas hay que insertar cabecera + líneas + audit atómicamente: una
  // cabecera con base_total y sin líneas es peor que ninguna (el 303 la cuenta mal).
  const conLineas = esquema.fiscal && esquema.lineas && tieneLineas

  try {
    const cols = esquema.fiscal
      ? `INSERT INTO facturas_registro
           (proveedor, categoria, numero_factura, hash_contenido, importe, fecha_factura,
            anio, trimestre, mes, matricula, ruta, nombre_archivo, fuente,
            proveedor_id, nif_proveedor, nif_valido, fecha_operacion, base_total, cuota_iva_total,
            tipo_operacion, deducible, deducible_pct, subcategoria_gasto, estado, datos_incompletos,
            anio_declarado, trimestre_declarado, extraccion_metodo, extraccion_confianza, extraccion_raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                 $14,$15,$16,$17,$18,$19,
                 COALESCE($20,'interior'), COALESCE($21,'duda'), $22, $23,
                 COALESCE($24,'registrada'), COALESCE($25,false),
                 $26,$27,$28,$29,$30::jsonb)
         ON CONFLICT (hash_contenido) DO NOTHING
         RETURNING id`
      : `INSERT INTO facturas_registro
           (proveedor, categoria, numero_factura, hash_contenido, importe, fecha_factura,
            anio, trimestre, mes, matricula, ruta, nombre_archivo, fuente)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (hash_contenido) DO NOTHING
         RETURNING id`

    const base = [proveedor, categoria, numero, hash, importe, fecha, anio, trimestre, mes, matricula, destino.ruta, nombre, fuente]
    const params = esquema.fiscal
      ? [
          ...base,
          prov?.id ?? null, nifProveedor, nifValido, fechaOperacion, baseTotal, cuotaTotal,
          tipoOperacion, deducible, deduciblePct, subcategoria, estado, datosIncompletos,
          // Imputación = período natural. Las tardías son Fase 2.
          anio, trimestre, metodo, confianza, raw,
        ]
      : base

    let insertedId: number | null = null

    if (conLineas) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const ins = await client.query(cols, params)
        if (ins.rows.length > 0) {
          insertedId = ins.rows[0].id
          await insertarLineas(client, insertedId!, lineas)
          await registrarCambio(client, {
            tabla: 'facturas_registro',
            filaId: insertedId!,
            accion: 'crear',
            cambios: {
              estado: { antes: null, despues: estado },
              base_total: { antes: null, despues: baseTotal },
              cuota_iva_total: { antes: null, despues: cuotaTotal },
              tipo_operacion: { antes: null, despues: tipoOperacion },
              deducible: { antes: null, despues: deducible },
              nif_proveedor: { antes: null, despues: nifProveedor },
              proveedor_id: { antes: null, despues: prov?.id ?? null },
              lineas: { antes: null, despues: lineas.length },
            },
            actor: 'n8n',
          })
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    } else {
      const ins = await pool.query(cols, params)
      if (ins.rows.length > 0) insertedId = ins.rows[0].id
    }

    if (insertedId != null) {
      return NextResponse.json({ ok: true, duplicado: false, id: insertedId, destino, periodo: { anio, trimestre, mes }, fiscal })
    }

    // conflicto por hash → duplicado exacto
    const dup = await pool.query(
      esquema.fiscal
        ? `SELECT id, ruta, nombre_archivo, estado, base_total FROM facturas_registro WHERE hash_contenido = $1 LIMIT 1`
        : `SELECT id, ruta, nombre_archivo FROM facturas_registro WHERE hash_contenido = $1 LIMIT 1`,
      [hash]
    )
    const existente = dup.rows[0] ?? null

    // Enriquecimiento: la fila vieja existe como ARCHIVO (estado 'registrada', sin
    // líneas) y ahora n8n vuelve a pasar el mismo PDF ya con datos fiscales. Se
    // completa en vez de re-archivar — así los 183 documentos de 2026 se cierran
    // sin tocar OneDrive. Sólo desde 'registrada': nada validado/declarado se pisa.
    const enriquecido = existente ? await enriquecer(existente) : false

    return NextResponse.json({
      ok: true, duplicado: true, motivo: 'hash',
      existente, destino, periodo: { anio, trimestre, mes },
      fiscal: { ...fiscal, enriquecido },
    })
  } catch (err) {
    const e = err as { code?: string; constraint?: string; message?: string }
    // 23505 = unique_violation → duplicado por (proveedor, numero_factura)
    if (e.code === '23505') {
      const dup = await pool.query(
        `SELECT id, ruta, nombre_archivo, hash_contenido FROM facturas_registro
           WHERE proveedor = $1 AND numero_factura = $2 LIMIT 1`,
        [proveedor, numero]
      )
      return NextResponse.json({
        ok: true, duplicado: true, motivo: 'numero',
        existente: dup.rows[0] ?? null, destino, periodo: { anio, trimestre, mes }, fiscal,
      })
    }
    return NextResponse.json({ ok: false, error: e.message ?? String(err) }, { status: 500 })
  }

  /** Completa una fila 'registrada' sin líneas con los datos fiscales recién extraídos. */
  async function enriquecer(existente: { id: number; estado?: string | null }): Promise<boolean> {
    if (!conLineas || !existente?.id) return false
    try {
      assertRegistroMutable(existente)
    } catch {
      return false
    }
    if (String(existente.estado ?? '') !== 'registrada') return false

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Re-chequeo bajo transacción: sólo si SIGUE sin líneas y sin datos (otro
      // reproceso concurrente pudo haberla completado entre el SELECT y el lock).
      const cur = await client.query(
        `SELECT id, estado, base_total FROM facturas_registro WHERE id = $1 FOR UPDATE`,
        [existente.id]
      )
      const row = cur.rows[0]
      if (!row || String(row.estado) !== 'registrada' || row.base_total != null) {
        await client.query('ROLLBACK')
        return false
      }
      const n = await client.query(
        `SELECT count(*)::int AS n FROM facturas_registro_lineas WHERE registro_id = $1`,
        [existente.id]
      )
      if ((n.rows[0]?.n ?? 0) > 0) {
        await client.query('ROLLBACK')
        return false
      }

      await client.query(
        `UPDATE facturas_registro SET
           importe = COALESCE(importe, $2), proveedor_id = COALESCE(proveedor_id, $3),
           nif_proveedor = COALESCE(nif_proveedor, $4), nif_valido = COALESCE(nif_valido, $5),
           fecha_operacion = COALESCE(fecha_operacion, $6), base_total = $7, cuota_iva_total = $8,
           tipo_operacion = COALESCE($9,'interior'), deducible = COALESCE($10,'duda'),
           deducible_pct = COALESCE(deducible_pct, $11), subcategoria_gasto = COALESCE(subcategoria_gasto, $12),
           estado = COALESCE($13,'registrada'), datos_incompletos = COALESCE($14,false),
           extraccion_metodo = COALESCE($15, extraccion_metodo),
           extraccion_confianza = COALESCE($16, extraccion_confianza),
           extraccion_raw = COALESCE($17::jsonb, extraccion_raw)
         WHERE id = $1`,
        [
          existente.id, importe, prov?.id ?? null, nifProveedor, nifValido, fechaOperacion,
          baseTotal, cuotaTotal, tipoOperacion, deducible, deduciblePct, subcategoria,
          estado, datosIncompletos, metodo, confianza, raw,
        ]
      )
      await insertarLineas(client, existente.id, lineas)
      await registrarCambio(client, {
        tabla: 'facturas_registro',
        filaId: existente.id,
        accion: 'editar',
        cambios: {
          estado: { antes: 'registrada', despues: estado },
          base_total: { antes: null, despues: baseTotal },
          cuota_iva_total: { antes: null, despues: cuotaTotal },
          lineas: { antes: 0, despues: lineas.length },
        },
        actor: 'n8n',
        motivo: 'reproceso de un documento ya archivado: se completan los datos fiscales extraídos',
      })
      await client.query('COMMIT')
      return true
    } catch {
      await client.query('ROLLBACK').catch(() => {})
      return false // el duplicado se responde igual: enriquecer es best-effort
    } finally {
      client.release()
    }
  }
}
