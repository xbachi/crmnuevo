/**
 * POST /api/fiscal/registro/[id]/validar — el botón central de la bandeja.
 *
 * "Validada" significa: un humano miró el PDF y se hace responsable de que estos
 * números entren al 303. Por eso acá SÍ se bloquea lo que el PATCH deja pasar.
 *
 * Acepta los mismos campos que el PATCH y reusa la MISMA función
 * (aplicarCorrecciones): el flujo real es ver el error, arreglarlo y validar, y
 * obligar a dos requests solo invita a que la UI valide sin guardar.
 *
 * DOS RECHAZOS DUROS (409):
 *  · Sin líneas o con el cuadre KO → MATH_KO. Una factura sin desglose no puede
 *    entrar al 303: el modelo pide base y cuota por tipo de IVA, no un total. Y un
 *    cuadre que no da significa que no sabemos cuál de los dos números es el
 *    bueno. Acá nació el incidente de los importes de 47.104 € y 156.372 € que el
 *    extractor sacó de "el número más grande del PDF" sin que nada lo cuestionara.
 *  · NIF inválido → NIF_INVALIDO, salvo force+motivo. Un NIF mal en el libro es un
 *    requerimiento de Hacienda. Se puede forzar (proveedor extranjero raro que el
 *    validador no conoce) pero queda el motivo escrito en la auditoría.
 *
 * El rechazo hace ROLLBACK: las correcciones NO se guardan si no se pudo validar.
 * Es deliberado — "validar" es una operación atómica, y guardar a medias dejaría
 * al usuario sin saber qué quedó aplicado. Para guardar sin validar está el PATCH.
 *
 * La auditoría de 'validar' incluye extraccion_raw junto al diff: es el insumo
 * para saber qué campo falla siempre en cada plantilla y arreglar la extracción
 * en n8n en vez de seguir corrigiendo a mano.
 *
 * Auth: admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { registrarCambio, RegistroInmutableError } from '@/lib/fiscalAudit'
import { PeriodoCerradoError } from '@/lib/periodoLock'
import {
  aplicarCorrecciones,
  RegistroNoEncontradoError,
  ValidacionError,
} from '@/lib/fiscalRegistroEdit'
import { serializarRegistro } from '@/lib/fiscalApi'

export const maxDuration = 30

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response
  const actor = `uid:${auth.session.uid}`

  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: `id inválido: "${idStr}"` }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const force = body.force === true || body.force === 'true'
  const motivo = String(body.motivo ?? '').trim() || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const r = await aplicarCorrecciones(client, id, body)

    // ── Guard 1: desglose ─────────────────────────────────────────────────────
    const erroresCuadre = [...r.erroresLineas, ...r.math.errores]
    if (r.lineas.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error:
            'No se puede validar una factura sin desglose: el 303 declara base y cuota por tipo de IVA, no un importe total. Cargá al menos una línea.',
          code: 'MATH_KO',
          cuadre: { ok: false, errores: erroresCuadre },
        },
        { status: 409 }
      )
    }
    if (!r.math.ok) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: `El desglose no cuadra con el importe de la factura, así que no se puede validar: ${erroresCuadre.join('; ')}`,
          code: 'MATH_KO',
          cuadre: {
            ok: false,
            baseTotal: r.math.baseTotal,
            cuotaTotal: r.math.cuotaTotal,
            calculado: r.math.calculado,
            declarado: r.math.declarado,
            diferencia: r.math.diferencia,
            errores: erroresCuadre,
          },
        },
        { status: 409 }
      )
    }

    // ── Guard 2: NIF ──────────────────────────────────────────────────────────
    // Solo false bloquea. NULL = "sin verificar" (las 188 filas viejas): no se
    // puede exigir un NIF que el pipeline nunca extrajo, o la bandeja entera
    // queda invalidable.
    const nifValido = r.despues.nif_valido
    if (nifValido === false && !(force && motivo)) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: `El NIF ${String(r.despues.nif_proveedor ?? '')} no supera la validación. Corregilo en la factura o en la ficha del proveedor; si de verdad es correcto (proveedor extranjero que el validador no reconoce), validá con force y un motivo — queda registrado en la auditoría.`,
          code: 'NIF_INVALIDO',
          nifProveedor: r.despues.nif_proveedor ?? null,
        },
        { status: 409 }
      )
    }

    // ── Validar ───────────────────────────────────────────────────────────────
    const upd = await client.query(
      `UPDATE facturas_registro
          SET estado = 'validada',
              validada_por = $2,
              validada_at = NOW(),
              datos_incompletos = false,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, actor]
    )
    const final = upd.rows[0]

    await registrarCambio(client, {
      tabla: 'facturas_registro',
      filaId: id,
      accion: 'validar',
      cambios: {
        ...r.cambios,
        estado: { antes: r.antes.estado, despues: 'validada' },
        // Qué leyó la máquina vs qué firmó el humano. Comparar estos dos campos a
        // lo largo del tiempo dice qué plantilla de extracción hay que arreglar.
        extraccion_raw: { antes: r.antes.extraccion_raw ?? null, despues: null },
        valores_validados: {
          antes: null,
          despues: {
            numeroFactura: final.numero_factura,
            importe: Number(final.importe),
            fechaFactura: final.fecha_factura,
            baseTotal: Number(final.base_total),
            cuotaIvaTotal: Number(final.cuota_iva_total),
            nifProveedor: final.nif_proveedor,
            tipoOperacion: final.tipo_operacion,
            deducible: final.deducible,
          },
        },
        ...(force && nifValido === false
          ? { nif_invalido_forzado: { antes: null, despues: true } }
          : {}),
      },
      actor,
      motivo: motivo ?? undefined,
    })

    await client.query('COMMIT')

    return NextResponse.json({
      ok: true,
      ...serializarRegistro({ ...final, lineas: r.lineas.length }),
      lineas: r.lineas,
      cuadre: {
        ok: true,
        baseTotal: r.math.baseTotal,
        cuotaTotal: r.math.cuotaTotal,
        calculado: r.math.calculado,
        declarado: r.math.declarado,
        diferencia: r.math.diferencia,
        errores: [],
      },
      mensaje: `Factura validada. Entra en el ${final.trimestre_declarado ?? '—'}T de ${final.anio_declarado ?? '—'} con base ${Number(final.base_total ?? 0).toFixed(2)} € y cuota ${Number(final.cuota_iva_total ?? 0).toFixed(2)} €.`,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})

    if (err instanceof RegistroNoEncontradoError) {
      return NextResponse.json({ error: `No existe la factura ${id}` }, { status: 404 })
    }
    if (err instanceof ValidacionError) {
      return NextResponse.json({ error: err.message, errores: err.errores }, { status: 400 })
    }
    if (err instanceof RegistroInmutableError) {
      return NextResponse.json(
        { error: err.message, code: 'REGISTRO_INMUTABLE', estado: err.estado },
        { status: 409 }
      )
    }
    if (err instanceof PeriodoCerradoError) {
      return NextResponse.json(
        { error: err.message, code: 'PERIODO_CERRADO', anio: err.anio, mes: err.mes },
        { status: 409 }
      )
    }

    console.error('[fiscal/registro/[id]/validar] POST:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'No se pudo validar la factura' }, { status: 500 })
  } finally {
    client.release()
  }
}
