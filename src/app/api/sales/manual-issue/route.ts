import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { issueInvoice, InvoiceServiceError } from '@/lib/invoiceService'
import type { InvoiceType } from '@/lib/invoiceRepository'
import { requireApiSession } from '@/lib/apiAuth'

/**
 * POST /api/sales/manual-issue
 *
 * "Manual" invoice flow used by /generador-facturas: the operator types
 * the buyer + vehicle data on a form (no pre-existing Deal). This
 * endpoint creates a Cliente / Vehiculo / Deal in the background and
 * then issues a fiscal invoice through the same correlative service
 * used everywhere else.
 *
 * If a Cliente with the same DNI exists, it is reused. Same for Vehiculo
 * with the same matricula. Otherwise minimal records are inserted.
 *
 * Body:
 *   {
 *     invoiceType: 'VAT' | 'REBU',
 *     cliente: { nombre, apellidos, dni, telefono?, email?, direccion?, ciudad?, provincia?, codPostal? },
 *     vehiculo: { marca, modelo, matricula, bastidor?, kms?, color?, fechaMatriculacion?, año? },
 *     factura: { importeTotal, importeSena?, formaPagoSena? }
 *   }
 *
 * Idempotency-Key header is honoured (recommended).
 */
export async function POST(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const client = await pool.connect()
  try {
    const body = await request.json().catch(() => ({}))
    const invoiceType = (body?.invoiceType ?? 'VAT') as InvoiceType
    if (!['VAT', 'REBU'].includes(invoiceType)) {
      return NextResponse.json(
        { error: 'invoiceType debe ser VAT o REBU' },
        { status: 400 }
      )
    }

    const c = body?.cliente ?? {}
    const v = body?.vehiculo ?? {}
    const f = body?.factura ?? {}

    if (!c.nombre || !c.apellidos || !c.dni) {
      return NextResponse.json(
        { error: 'Faltan datos del cliente (nombre, apellidos, dni).' },
        { status: 400 }
      )
    }
    if (!v.marca || !v.modelo || !v.matricula) {
      return NextResponse.json(
        { error: 'Faltan datos del vehículo (marca, modelo, matrícula).' },
        { status: 400 }
      )
    }
    const importeTotal = Number(f.importeTotal)
    if (!Number.isFinite(importeTotal) || importeTotal <= 0) {
      return NextResponse.json(
        { error: 'El importe total debe ser mayor a 0.' },
        { status: 400 }
      )
    }

    await client.query('BEGIN')

    // 1) Cliente: find by DNI or create. Match ignoring case AND all whitespace
    // (incl. internal spaces) so a recurring client isn't duplicated (and
    // doesn't hit the UNIQUE(dni)).
    const dniNorm = String(c.dni).replace(/\s+/g, '')
    let clienteId: number
    const existingCliente = await client.query<{ id: number }>(
      `SELECT id FROM "Cliente" WHERE UPPER(REPLACE(dni, ' ', '')) = UPPER($1) LIMIT 1`,
      [dniNorm]
    )
    if (existingCliente.rows.length > 0) {
      clienteId = existingCliente.rows[0].id
    } else {
      const insRes = await client.query<{ id: number }>(
        `INSERT INTO "Cliente" (nombre, apellidos, email, telefono, dni,
                                 direccion, ciudad, "codigoPostal", provincia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          c.nombre,
          c.apellidos,
          c.email ?? null,
          c.telefono ?? null,
          dniNorm,
          c.direccion ?? null,
          c.ciudad ?? null,
          c.codPostal ?? null,
          c.provincia ?? null,
        ]
      )
      clienteId = insRes.rows[0].id
    }

    // 2) Vehiculo: find by matricula (or by bastidor) or create. Match the
    // plate/VIN ignoring case AND all whitespace (incl. internal spaces, e.g.
    // "2320 KNT" vs "2320KNT") so we reuse an existing car instead of hitting
    // UNIQUE(matricula)/UNIQUE(bastidor) on a retry.
    const matriculaNorm = String(v.matricula).replace(/\s+/g, '').toUpperCase()
    const bastidor =
      v.bastidor && String(v.bastidor).replace(/\s+/g, '')
        ? String(v.bastidor).replace(/\s+/g, '').toUpperCase()
        : null
    let vehiculoId: number
    const existingVehiculo = await client.query<{ id: number }>(
      `SELECT id FROM "Vehiculo"
       WHERE UPPER(REPLACE(matricula, ' ', '')) = $1
          OR ($2::text IS NOT NULL AND UPPER(REPLACE(bastidor, ' ', '')) = $2)
       LIMIT 1`,
      [matriculaNorm, bastidor]
    )
    if (existingVehiculo.rows.length > 0) {
      vehiculoId = existingVehiculo.rows[0].id
    } else {
      // Build a synthetic referencia (the column is unique). Use the plate
      // plus a short random suffix so retries with the same plate but
      // different cases don't collide.
      const suffix = Date.now().toString().slice(-5)
      const referencia = `MAN-${matriculaNorm}-${suffix}`
      const insRes = await client.query<{ id: number }>(
        `INSERT INTO "Vehiculo" (referencia, marca, modelo, matricula, bastidor,
                                  kms, tipo, estado, orden, color,
                                  "fechaMatriculacion", año)
         VALUES ($1, $2, $3, $4, $5, $6, 'M', 'VENDIDO', 0, $7, $8, $9)
         RETURNING id`,
        [
          referencia,
          v.marca,
          v.modelo,
          matriculaNorm,
          bastidor,
          v.kms ?? 0,
          v.color ?? null,
          v.fechaMatriculacion || null,
          v.año ?? null,
        ]
      )
      vehiculoId = insRes.rows[0].id
    }

    // 3) Deal: reuse the car's active deal for THIS client (so a car already in
    //    the CRM gets invoiced on its own deal instead of a duplicate). A
    //    reservation for a DIFFERENT client is left untouched → fresh deal.
    let dealId: number
    const activeDeal = await client.query<{ id: number }>(
      `SELECT id FROM "Deal"
        WHERE "vehiculoId" = $1 AND "clienteId" = $2
          AND estado NOT IN ('facturado', 'cancelado')
          AND (factura IS NULL OR factura = '')
        ORDER BY id DESC LIMIT 1`,
      [vehiculoId, clienteId]
    )
    if (activeDeal.rows.length > 0) {
      dealId = activeDeal.rows[0].id
      // Refresh the deal amounts with what the operator typed, so the invoice
      // reflects the form data (issueInvoice reads the deal, not the form).
      await client.query(
        `UPDATE "Deal"
            SET "importeTotal" = $1, "importeSena" = $2, "formaPagoSena" = $3
          WHERE id = $4`,
        [
          importeTotal,
          Number(f.importeSena) || 0,
          f.formaPagoSena ?? null,
          dealId,
        ]
      )
    } else {
      const dealNumero = `MAN-${Date.now()}`
      const dealRes = await client.query<{ id: number }>(
        `INSERT INTO "Deal" (numero, "clienteId", "vehiculoId", estado,
                              "importeTotal", "importeSena", "formaPagoSena",
                              observaciones)
         VALUES ($1, $2, $3, 'facturado', $4, $5, $6, $7)
         RETURNING id`,
        [
          dealNumero,
          clienteId,
          vehiculoId,
          importeTotal,
          Number(f.importeSena) || 0,
          f.formaPagoSena ?? null,
          'Deal creado automáticamente desde /generador-facturas para emisión fiscal correlativa.',
        ]
      )
      dealId = dealRes.rows[0].id
    }

    await client.query('COMMIT')

    // 4) Issue the invoice through the same atomic service as everywhere else
    const idempotencyKey =
      request.headers.get('Idempotency-Key') ||
      request.headers.get('idempotency-key') ||
      null

    const result = await issueInvoice({
      dealId,
      invoiceType,
      idempotencyKey,
      allowDuplicate: body?.allowDuplicate === true,
      userId: String(auth.session.uid),
      userRole: auth.session.role,
    })

    // Mark the car as sold and point its active deal at the issued one.
    // Best-effort: the invoice is already issued, so a failure here must not
    // turn a successful issuance into an error.
    try {
      await client.query(
        `UPDATE "Vehiculo"
            SET estado = 'VENDIDO', "dealActivoId" = $1, "updatedAt" = NOW()
          WHERE id = $2`,
        [dealId, vehiculoId]
      )
    } catch (e) {
      console.error(
        '[manual-issue] no se pudo marcar el vehículo como vendido:',
        e
      )
    }

    return NextResponse.json(
      { ...result, dealId, clienteId, vehiculoId },
      { status: result.alreadyExisted ? 200 : 201 }
    )
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err instanceof InvoiceServiceError) {
      if (err.code === 'VEHICLE_ALREADY_INVOICED') {
        return NextResponse.json(
          { error: err.message, code: err.code, existing: err.details },
          { status: 409 }
        )
      }
      const status =
        err.code === 'SALE_NOT_FOUND'
          ? 404
          : err.code === 'NO_SEQUENCE'
            ? 409
            : 400
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status }
      )
    }
    const e = err as {
      code?: string
      constraint?: string
      detail?: string
      column?: string
    }
    if (e?.code === '23505') {
      const con = e.constraint ?? ''
      const campo = con.includes('dni')
        ? 'el DNI del cliente'
        : con.includes('bastidor')
          ? 'el bastidor (VIN)'
          : con.includes('matricula')
            ? 'la matrícula'
            : con.includes('referencia')
              ? 'la referencia interna'
              : con.includes('numero')
                ? 'el número de operación'
                : 'un dato único'
      return NextResponse.json(
        {
          error: `Ya existe un registro con ${campo}. Revisalo o usá el coche/cliente existente.`,
          detail: e.detail,
          constraint: e.constraint,
        },
        { status: 409 }
      )
    }
    if (e?.code === '23502') {
      return NextResponse.json(
        {
          error: `Falta un campo obligatorio${e.column ? `: ${e.column}` : ''}.`,
          detail: e.detail,
        },
        { status: 400 }
      )
    }
    console.error('[manual-issue]', err)
    return NextResponse.json(
      { error: 'Error interno emitiendo factura manual' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
