import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { parseImporte } from '@/lib/gastoImporte'
import { TIPO_A_CAMPO, normPlate, campoParaTipo, tiposCanonicos } from '@/lib/gastoMapping'
import { validarImporte } from '@/lib/gastoRangos'
import { extraerNumeroCanonico } from '@/lib/facturaNumero'
import { esPeriodoCerrado } from '@/lib/periodoLock'

/**
 * POST /api/vehiculos/gasto
 *
 * Lo llama el flujo de n8n cuando descarga y archiva una factura de proveedor.
 * Carga el importe en el campo de gastos del vehículo (por matrícula/referencia)
 * de forma idempotente: cada nº de factura se aplica una sola vez (tabla
 * gasto_facturas), y el campo del Vehiculo pasa a ser la SUMA de las facturas
 * de ese tipo (soporta varias facturas del mismo proveedor por coche).
 *
 * Auth: X-Webhook-Secret (mismo secreto que el resto del flujo n8n). En la
 * whitelist del middleware.
 *
 * Body: {
 *   matricula?: string, referencia?: string,   // al menos uno
 *   tipo: 'mecauto'|'fergo'|'world'|'compra'|'transporte'|'itv',
 *   importe: number|string,                     // total con IVA
 *   numeroFactura: string,
 *   proveedor?: string,
 *   esAbono?: boolean,        // requerido para importes negativos (abonos)
 *   allowDuplicado?: boolean  // saltea el 409 de duplicado por nº canónico
 * }
 */

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-webhook-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const tipoRaw = String(b.tipo ?? '').toLowerCase().trim()
  const campo = campoParaTipo(tipoRaw)
  if (!campo) {
    return NextResponse.json(
      { error: `tipo inválido: "${tipoRaw}". Válidos: ${Object.keys(TIPO_A_CAMPO).join(', ')}` },
      { status: 400 }
    )
  }
  const importe = parseImporte(b.importe)
  if (importe == null) {
    return NextResponse.json({ error: `importe inválido: ${JSON.stringify(b.importe)}` }, { status: 400 })
  }
  // Abonos: un importe negativo solo se acepta con esAbono: true explícito.
  const esAbono = b.esAbono === true || String(b.esAbono ?? '') === '1' || String(b.esAbono ?? '').toLowerCase() === 'true'
  if (importe < 0 && !esAbono) {
    return NextResponse.json(
      { error: 'importe negativo sin esAbono', hint: 'si es un abono/nota de crédito reenviá con esAbono: true' },
      { status: 422 }
    )
  }
  // Guarda anti-basura: rechaza importes fuera del rango del campo (evita cargar
  // valores absurdos por errores de extracción). `force=1` permite saltearla.
  // Para abonos se valida el valor absoluto (el rango está definido en positivo).
  const rango = validarImporte(campo, Math.abs(importe))
  const force = String(b.force ?? '') === '1' || new URL(request.url).searchParams.get('force') === '1'
  if (!rango.ok && !force) {
    return NextResponse.json(
      { error: 'importe fuera de rango', detalle: rango.reason, hint: 'verificá el valor; si es correcto reenviá con force=1' },
      { status: 422 }
    )
  }
  const numeroFactura = b.numeroFactura ? String(b.numeroFactura).trim() : null
  if (!numeroFactura) {
    return NextResponse.json({ error: 'numeroFactura requerido (idempotencia)' }, { status: 400 })
  }
  const matricula = b.matricula ? String(b.matricula).trim() : null
  const referencia = b.referencia ? String(b.referencia).trim() : null
  if (!matricula && !referencia) {
    return NextResponse.json({ error: 'matricula o referencia requerida' }, { status: 400 })
  }
  const proveedor = b.proveedor ? String(b.proveedor).trim() : tipoRaw

  // Cierre mensual: los gastos se cargan en tiempo real, así que se valida la
  // fecha ACTUAL — si el mes corriente figura cerrado, algo raro pasa (reloj,
  // cierre por error) y no hay que tocar números ya entregados a gestoría.
  const hoy = new Date().toISOString().slice(0, 10)
  if (await esPeriodoCerrado(pool, hoy).catch(() => false)) {
    return NextResponse.json(
      {
        error: `el período ${hoy.slice(0, 7)} (mes actual) está cerrado; gasto no cargado`,
        code: 'PERIODO_CERRADO',
        hint: 'reabrí el período desde /api/admin/periodos si corresponde y reenviá',
      },
      { status: 409 }
    )
  }

  // 1) resolver vehículo
  const vres = matricula
    ? await pool.query(
        `SELECT id, matricula FROM "Vehiculo"
          WHERE REPLACE(REPLACE(REPLACE(UPPER(matricula),' ',''),'-',''),'.','') = $1
          LIMIT 1`,
        [normPlate(matricula)]
      )
    : await pool.query(`SELECT id, matricula FROM "Vehiculo" WHERE referencia = $1 LIMIT 1`, [referencia])
  const vehiculo = vres.rows[0]
  if (!vehiculo) {
    return NextResponse.json(
      { error: 'vehículo no encontrado', matricula, referencia, tipo: tipoRaw },
      { status: 404 }
    )
  }

  // 2) dedup REAL por nº canónico de factura (auditoría C-03): numero_factura
  // es el filename del PDF, así que la misma factura con dos nombres pasaba el
  // UNIQUE. Si ya hay un gasto con el mismo nº real para este coche → 409, sin
  // insertar y sin resync. `allowDuplicado: true` (flag explícito, distinto de
  // force) lo saltea. Se compara contra los tipos que comparten campo (world ≡
  // world-detailing ≡ limpieza). Filas con el MISMO filename no cuentan: esas
  // son reintentos idempotentes que resuelve el ON CONFLICT.
  const canonTipos = tiposCanonicos(campo)
  const numeroCanonico = extraerNumeroCanonico(numeroFactura, proveedor)
  const allowDuplicado =
    b.allowDuplicado === true || String(b.allowDuplicado ?? '') === '1' || String(b.allowDuplicado ?? '').toLowerCase() === 'true'
  if (numeroCanonico && !allowDuplicado) {
    const dupRes = await pool.query(
      `SELECT id, numero_factura, importe, matricula, tipo, created_at
         FROM gasto_facturas
        WHERE tipo = ANY($1) AND numero_canonico = $2 AND vehiculo_id = $3
          AND numero_factura <> $4
        LIMIT 1`,
      [canonTipos, numeroCanonico, vehiculo.id, numeroFactura]
    )
    const dup = dupRes.rows[0]
    if (dup) {
      return NextResponse.json(
        {
          duplicado: true,
          numeroCanonico,
          existente: {
            id: dup.id,
            numeroFactura: dup.numero_factura,
            importe: Number(dup.importe),
            matricula: dup.matricula,
            tipo: dup.tipo,
            createdAt: dup.created_at,
          },
          hint: 'misma factura ya cargada con otro nombre de archivo; si es un cargo real distinto reenviá con allowDuplicado: true',
        },
        { status: 409 }
      )
    }
  }

  // 3) libro de facturas (idempotente por tipo+numeroFactura)
  await pool.query(
    `INSERT INTO gasto_facturas (vehiculo_id, matricula, tipo, numero_factura, numero_canonico, importe, proveedor)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tipo, numero_factura)
       DO UPDATE SET importe = EXCLUDED.importe, vehiculo_id = EXCLUDED.vehiculo_id,
                     matricula = EXCLUDED.matricula, proveedor = EXCLUDED.proveedor,
                     numero_canonico = EXCLUDED.numero_canonico, updated_at = NOW()`,
    [vehiculo.id, vehiculo.matricula, tipoRaw, numeroFactura, numeroCanonico, importe, proveedor]
  )

  // 4) recomputar el campo del Vehiculo = SUMA de facturas de ese tipo
  const sumRes = await pool.query(
    `SELECT COALESCE(SUM(importe),0) AS total FROM gasto_facturas
      WHERE vehiculo_id = $1 AND tipo = ANY($2)`,
    [vehiculo.id, canonTipos]
  )
  const total = Number(sumRes.rows[0].total)
  // campo viene de una whitelist (TIPO_A_CAMPO) → seguro interpolarlo
  await pool.query(`UPDATE "Vehiculo" SET "${campo}" = $1 WHERE id = $2`, [total, vehiculo.id])

  // Reflejar el costo en CB 2026 si el coche ya tiene fila (venta emitida).
  // Best-effort + timeout: no bloquea ni falla la respuesta a n8n.
  let cbResync: string | null = null
  try {
    const { resyncVehiculoRowToCB } = await import('@/lib/costoBeneficio')
    let timer: ReturnType<typeof setTimeout> | undefined
    const r = await Promise.race([
      resyncVehiculoRowToCB(vehiculo.id, 'CB 2026', 'auto-expense'),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 8000)
      }),
    ])
    clearTimeout(timer)
    cbResync = r ? `${r.action}: ${r.detail}` : 'timeout'
  } catch (err) {
    cbResync = `error: ${(err as Error)?.message ?? err}`
  }

  return NextResponse.json({
    cbResync,
    ok: true,
    vehiculoId: vehiculo.id,
    matricula: vehiculo.matricula,
    campo,
    nuevoValor: total,
    facturaAplicada: numeroFactura,
    ...(rango.warn ? { aviso: rango.warn } : {}),
  })
}
