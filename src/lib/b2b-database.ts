/**
 * Helpers de DB para el módulo B2B (cliente_b2b + venta_b2b).
 * Usa el mismo `pool` raw de @/lib/direct-database (pg.Pool capped at 3
 * connections, política del proyecto).
 */

import { pool } from '@/lib/direct-database'

// =============================================================================
// Tipos
// =============================================================================

export type ClienteB2BTipo = 'empresa' | 'autonomo' | 'profesional'

export interface ClienteB2B {
  id: number
  tipo: ClienteB2BTipo
  razon_social: string
  cif_nif: string
  contacto_nombre: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
  codigo_postal: string | null
  provincia: string | null
  notas: string | null
  activo: boolean
  created_at: Date
  updated_at: Date
}

export type FormaPagoB2B = 'transferencia' | 'efectivo' | 'financiado' | 'otro'
export type VentaB2BStatus = 'BORRADOR' | 'PDF_PENDING' | 'FIRMADO' | 'ANULADO'

export interface VentaB2B {
  id: number
  numero: string
  cliente_b2b_id: number
  vehiculo_id: number | null
  vehiculo_marca: string | null
  vehiculo_modelo: string | null
  vehiculo_matricula: string | null
  vehiculo_bastidor: string | null
  vehiculo_kms: number | null
  vehiculo_anio: number | null
  vehiculo_fecha_matriculacion: string | null
  fecha_venta: Date
  lugar_venta: string
  precio_venta: string // numeric en pg → string
  forma_pago: FormaPagoB2B
  notas: string | null
  notas_estado_vehiculo: string | null
  pdf_url: string | null
  pdf_storage_key: string | null
  pdf_generated_at: Date | null
  status: VentaB2BStatus
  created_at: Date
  updated_at: Date
}

export interface VentaB2BWithCliente extends VentaB2B {
  cliente_razon_social: string
  cliente_cif_nif: string
}

// =============================================================================
// CRUD: cliente_b2b
// =============================================================================

export async function listClientesB2B(): Promise<ClienteB2B[]> {
  const { rows } = await pool.query<ClienteB2B>(
    `SELECT * FROM cliente_b2b
      WHERE activo = TRUE
      ORDER BY created_at DESC`
  )
  return rows
}

export async function getClienteB2BById(id: number): Promise<ClienteB2B | null> {
  const { rows } = await pool.query<ClienteB2B>(
    `SELECT * FROM cliente_b2b WHERE id = $1 LIMIT 1`,
    [id]
  )
  return rows[0] ?? null
}

export interface CreateClienteB2BInput {
  tipo: ClienteB2BTipo
  razon_social: string
  cif_nif: string
  contacto_nombre?: string | null
  telefono?: string | null
  email?: string | null
  direccion?: string | null
  ciudad?: string | null
  codigo_postal?: string | null
  provincia?: string | null
  notas?: string | null
}

export async function createClienteB2B(
  input: CreateClienteB2BInput
): Promise<ClienteB2B> {
  const { rows } = await pool.query<ClienteB2B>(
    `INSERT INTO cliente_b2b
       (tipo, razon_social, cif_nif, contacto_nombre, telefono, email,
        direccion, ciudad, codigo_postal, provincia, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.tipo,
      input.razon_social.trim(),
      input.cif_nif.trim().toUpperCase(),
      input.contacto_nombre ?? null,
      input.telefono ?? null,
      input.email ?? null,
      input.direccion ?? null,
      input.ciudad ?? null,
      input.codigo_postal ?? null,
      input.provincia ?? null,
      input.notas ?? null,
    ]
  )
  return rows[0]
}

export async function updateClienteB2B(
  id: number,
  input: Partial<CreateClienteB2BInput>
): Promise<ClienteB2B | null> {
  // Construye SET dinámico solo con los campos provistos
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    fields.push(`${k} = $${idx++}`)
    values.push(typeof v === 'string' ? v.trim() : v)
  }
  if (fields.length === 0) return getClienteB2BById(id)
  fields.push(`updated_at = NOW()`)
  values.push(id)
  const { rows } = await pool.query<ClienteB2B>(
    `UPDATE cliente_b2b SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  )
  return rows[0] ?? null
}

export async function archiveClienteB2B(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE cliente_b2b SET activo = FALSE, updated_at = NOW() WHERE id = $1`,
    [id]
  )
  return (rowCount ?? 0) > 0
}

// =============================================================================
// CRUD: venta_b2b
// =============================================================================

/** Genera el próximo número de venta B2B (B2B-YYYY-NNNN). */
async function nextVentaB2BNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `B2B-${year}-`
  const { rows } = await pool.query<{ max_num: string | null }>(
    `SELECT MAX(numero) AS max_num FROM venta_b2b WHERE numero LIKE $1`,
    [`${prefix}%`]
  )
  let next = 1
  if (rows[0]?.max_num) {
    const m = rows[0].max_num.match(/-(\d+)$/)
    if (m) next = parseInt(m[1], 10) + 1
  }
  return `${prefix}${String(next).padStart(4, '0')}`
}

export interface CreateVentaB2BInput {
  cliente_b2b_id: number
  vehiculo_id?: number | null
  vehiculo_marca: string
  vehiculo_modelo: string
  vehiculo_matricula: string
  vehiculo_bastidor?: string | null
  vehiculo_kms?: number | null
  vehiculo_anio?: number | null
  vehiculo_fecha_matriculacion?: string | null
  fecha_venta: string // YYYY-MM-DD
  lugar_venta?: string
  precio_venta: number
  forma_pago: FormaPagoB2B
  notas?: string | null
  notas_estado_vehiculo?: string | null
}

export async function createVentaB2B(
  input: CreateVentaB2BInput
): Promise<VentaB2B> {
  const numero = await nextVentaB2BNumber()
  const { rows } = await pool.query<VentaB2B>(
    `INSERT INTO venta_b2b (
       numero, cliente_b2b_id, vehiculo_id,
       vehiculo_marca, vehiculo_modelo, vehiculo_matricula, vehiculo_bastidor,
       vehiculo_kms, vehiculo_anio, vehiculo_fecha_matriculacion,
       fecha_venta, lugar_venta, precio_venta, forma_pago,
       notas, notas_estado_vehiculo
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7,
       $8, $9, $10,
       $11, $12, $13, $14,
       $15, $16
     )
     RETURNING *`,
    [
      numero,
      input.cliente_b2b_id,
      input.vehiculo_id ?? null,
      input.vehiculo_marca,
      input.vehiculo_modelo,
      input.vehiculo_matricula,
      input.vehiculo_bastidor ?? null,
      input.vehiculo_kms ?? null,
      input.vehiculo_anio ?? null,
      input.vehiculo_fecha_matriculacion ?? null,
      input.fecha_venta,
      input.lugar_venta ?? 'Alaquàs',
      input.precio_venta,
      input.forma_pago,
      input.notas ?? null,
      input.notas_estado_vehiculo ?? null,
    ]
  )
  return rows[0]
}

export async function getVentaB2BById(id: number): Promise<VentaB2BWithCliente | null> {
  const { rows } = await pool.query<VentaB2BWithCliente>(
    `SELECT v.*,
            c.razon_social AS cliente_razon_social,
            c.cif_nif AS cliente_cif_nif
       FROM venta_b2b v
       JOIN cliente_b2b c ON c.id = v.cliente_b2b_id
      WHERE v.id = $1`,
    [id]
  )
  return rows[0] ?? null
}

export interface VentaB2BWithFactura extends VentaB2B {
  factura_id: number | null
  factura_numero: string | null
  factura_pdf_url: string | null
}

export async function listVentasB2BByCliente(
  clienteId: number
): Promise<VentaB2BWithFactura[]> {
  const { rows } = await pool.query<VentaB2BWithFactura>(
    `SELECT v.*,
            i.id AS factura_id,
            i.full_invoice_number AS factura_numero,
            i.pdf_url AS factura_pdf_url
       FROM venta_b2b v
       LEFT JOIN invoices i
         ON i.b2b_venta_id = v.id AND i.status <> 'VOIDED'
      WHERE v.cliente_b2b_id = $1
      ORDER BY v.fecha_venta DESC, v.id DESC`,
    [clienteId]
  )
  return rows
}

export async function updateVentaB2BPdf(
  id: number,
  pdfUrl: string,
  pdfStorageKey: string
): Promise<void> {
  await pool.query(
    `UPDATE venta_b2b
        SET pdf_url = $1, pdf_storage_key = $2,
            pdf_generated_at = NOW(), status = 'FIRMADO',
            updated_at = NOW()
      WHERE id = $3`,
    [pdfUrl, pdfStorageKey, id]
  )
}
