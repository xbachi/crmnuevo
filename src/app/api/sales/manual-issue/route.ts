import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { issueInvoice, InvoiceServiceError } from '@/lib/invoiceService'
import type { InvoiceType } from '@/lib/invoiceRepository'

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
// TODO: replace placeholder auth with real server-side auth (Task 2)
export async function POST(request: NextRequest) {
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

    // 1) Cliente: find by DNI or create
    let clienteId: number
    const existingCliente = await client.query<{ id: number }>(
      `SELECT id FROM "Cliente" WHERE dni = $1 LIMIT 1`,
      [c.dni]
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
          c.dni,
          c.direccion ?? null,
          c.ciudad ?? null,
          c.codPostal ?? null,
          c.provincia ?? null,
        ]
      )
      clienteId = insRes.rows[0].id
    }

    // 2) Vehiculo: find by matricula or create
    let vehiculoId: number
    const existingVehiculo = await client.query<{ id: number }>(
      `SELECT id FROM "Vehiculo" WHERE matricula = $1 LIMIT 1`,
      [v.matricula]
    )
    if (existingVehiculo.rows.length > 0) {
      vehiculoId = existingVehiculo.rows[0].id
    } else {
      // Build a synthetic referencia (the column is unique). Use the plate
      // plus a short random suffix so retries with the same plate but
      // different cases don't collide.
      const suffix = Date.now().toString().slice(-5)
      const referencia = `MAN-${v.matricula}-${suffix}`
      // `bastidor` is optional on the manual form. The column is UNIQUE but
      // nullable, and Postgres allows multiple NULLs, so leave it empty (NULL)
      // when not provided rather than inventing a fake VIN.
      const bastidor =
        v.bastidor && String(v.bastidor).trim() ? String(v.bastidor).trim() : null
      const insRes = await client.query<{ id: number }>(
        `INSERT INTO "Vehiculo" (referencia, marca, modelo, matricula, bastidor,
                                  kms, tipo, estado, orden, color,
                                  "fechaMatriculacion", año)
         VALUES ($1, $2, $3, $4, $5, $6, 'M', 'vendido', 0, $7, $8, $9)
         RETURNING id`,
        [
          referencia,
          v.marca,
          v.modelo,
          v.matricula,
          bastidor,
          v.kms ?? 0,
          v.color ?? null,
          v.fechaMatriculacion || null,
          v.año ?? null,
        ]
      )
      vehiculoId = insRes.rows[0].id
    }

    // 3) Deal: always create a fresh one for manual issuance
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
    const dealId = dealRes.rows[0].id

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
    })

    return NextResponse.json(
      { ...result, dealId, clienteId, vehiculoId },
      { status: result.alreadyExisted ? 200 : 201 }
    )
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err instanceof InvoiceServiceError) {
      const status =
        err.code === 'SALE_NOT_FOUND' ? 404 : err.code === 'NO_SEQUENCE' ? 409 : 400
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    const e = err as {
      code?: string
      constraint?: string
      detail?: string
      column?: string
    }
    if (e?.code === '23505') {
      return NextResponse.json(
        { error: 'Conflicto de datos al crear cliente / vehículo / deal.', detail: e.detail },
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
