/**
 * POST /api/gestoria/factura  — registro unificado de facturas (dedup + ruteo).
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
 * Body: {
 *   proveedor: string,
 *   categoria: 'gestoria'|'coche-servicio'|'coche-compra',
 *   hashContenido: string,           // md5 de los bytes del PDF (obligatorio)
 *   numeroFactura?: string,
 *   importe?: number|string,
 *   fechaFactura?: string,           // YYYY-MM-DD
 *   matricula?: string,
 *   nombreArchivo?: string,
 *   fuente?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { parseImporte } from '@/lib/gastoImporte'
import {
  CATEGORIAS,
  periodoFromDate,
  carpetaDestino,
  isValidIsoDate,
  normPlate,
  type Categoria,
} from '@/lib/facturasRegistro'
import {
  normalizeNumeroFacturaKey,
  normalizeProveedorKey,
} from '@/lib/gastoInvoiceIdentity'

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-webhook-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const proveedor = String(b.proveedor ?? '').trim()
  const categoria = String(b.categoria ?? '').trim() as Categoria
  const hash = String(b.hashContenido ?? '')
    .trim()
    .toLowerCase()
  if (!proveedor)
    return NextResponse.json({ error: 'proveedor requerido' }, { status: 400 })
  if (!CATEGORIAS.includes(categoria)) {
    return NextResponse.json(
      {
        error: `categoria inválida: "${categoria}". Válidas: ${CATEGORIAS.join(', ')}`,
      },
      { status: 400 }
    )
  }
  if (!/^[a-f0-9]{32}$/.test(hash)) {
    return NextResponse.json(
      { error: 'hashContenido debe ser un MD5 hexadecimal de 32 caracteres' },
      { status: 400 }
    )
  }

  const numero = b.numeroFactura ? String(b.numeroFactura).trim() : null
  const importe = b.importe != null ? parseImporte(b.importe) : null
  const fecha = b.fechaFactura ? String(b.fechaFactura).trim() : null
  const matricula = b.matricula ? normPlate(String(b.matricula)) : null
  const nombre = b.nombreArchivo ? String(b.nombreArchivo).trim() : null
  const fuente = b.fuente ? String(b.fuente).trim() : 'email'

  if (b.importe != null && importe == null) {
    return NextResponse.json({ error: 'importe inválido' }, { status: 400 })
  }
  if (!fecha) {
    return NextResponse.json(
      {
        error: 'fechaFactura requerida para determinar el período',
        code: 'INVOICE_DATE_REQUIRED',
      },
      { status: 422 }
    )
  }
  if (!isValidIsoDate(fecha)) {
    return NextResponse.json(
      { error: 'fechaFactura debe tener formato YYYY-MM-DD' },
      { status: 400 }
    )
  }
  if (categoria.startsWith('coche-') && !matricula) {
    return NextResponse.json(
      {
        error: 'matricula requerida para facturas de vehículo',
        code: 'VEHICLE_PLATE_REQUIRED',
      },
      { status: 422 }
    )
  }

  const proveedorKey = normalizeProveedorKey(proveedor)
  const numeroKey = numero ? normalizeNumeroFacturaKey(numero) : null
  if (numero && !numeroKey) {
    return NextResponse.json(
      { error: 'numeroFactura no contiene letras ni números' },
      { status: 400 }
    )
  }

  const { anio, trimestre, mes } = periodoFromDate(fecha)
  const destino = carpetaDestino(categoria, matricula, anio, mes)

  try {
    const ins = await pool.query(
      `INSERT INTO facturas_registro
         (proveedor, categoria, numero_factura, hash_contenido, importe, fecha_factura,
          anio, trimestre, mes, matricula, ruta, nombre_archivo, fuente)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (hash_contenido) DO NOTHING
       RETURNING id`,
      [
        proveedor,
        categoria,
        numero,
        hash,
        importe,
        fecha,
        anio,
        trimestre,
        mes,
        matricula,
        destino.ruta,
        nombre,
        fuente,
      ]
    )

    if (ins.rows.length > 0) {
      return NextResponse.json({
        ok: true,
        duplicado: false,
        id: ins.rows[0].id,
        destino,
        periodo: { anio, trimestre, mes },
      })
    }

    // conflicto por hash → duplicado exacto
    const dup = await pool.query(
      `SELECT id, ruta, nombre_archivo FROM facturas_registro WHERE hash_contenido = $1 LIMIT 1`,
      [hash]
    )
    return NextResponse.json({
      ok: true,
      duplicado: true,
      motivo: 'hash',
      existente: dup.rows[0] ?? null,
      destino,
      periodo: { anio, trimestre, mes },
    })
  } catch (err) {
    const e = err as { code?: string; constraint?: string; message?: string }
    // 23505 = unique_violation → duplicado por (proveedor, numero_factura)
    if (e.code === '23505') {
      const dup = await pool.query(
        `SELECT id, ruta, nombre_archivo, hash_contenido FROM facturas_registro
           WHERE LOWER(REGEXP_REPLACE(BTRIM(proveedor), '\\s+', ' ', 'g')) = $1
             AND UPPER(REGEXP_REPLACE(BTRIM(numero_factura), '[^A-Za-z0-9]+', '', 'g')) = $2
           LIMIT 1`,
        [proveedorKey, numeroKey]
      )
      return NextResponse.json({
        ok: true,
        duplicado: true,
        motivo: 'numero',
        existente: dup.rows[0] ?? null,
        destino,
        periodo: { anio, trimestre, mes },
      })
    }
    return NextResponse.json(
      { ok: false, error: e.message ?? String(err) },
      { status: 500 }
    )
  }
}
