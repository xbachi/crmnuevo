/**
 * Vista unificada de ventas: retail (Deal) + B2B (venta_b2b) en una sola lista.
 *
 * Motivo: las dos vías de venta vivían en módulos que no se veían entre sí y
 * un mismo coche se llegó a facturar por las dos (R-2026-025 desde el deal y
 * R-2026-026 desde la venta B2B). "Ventas" tiene que ser literalmente todas.
 *
 * Criterio fiscal (el mismo de /api/comisiones y chequeoExpedientes):
 *   - factura activa  → status ISSUED|IMPORTED|PDF_PENDING e invoice_type <> 'RECTIFYING'
 *   - factura anulada → status RECTIFIED|VOIDED (la original rectificada y la anulada)
 * Una venta con su única factura RECTIFIED queda marcada como anulada y NO
 * suma en los contadores. Una venta todavía sin factura sí aparece y cuenta,
 * marcada como no facturada.
 *
 * Todo se resuelve en UNA query (UNION ALL + agregados con FILTER): el pool
 * está capado a pocas conexiones y no se puede traer todo a JS para filtrar.
 */

export const ACTIVE_INVOICE_STATUSES = ['ISSUED', 'IMPORTED', 'PDF_PENDING']
export const VOID_INVOICE_STATUSES = ['RECTIFIED', 'VOIDED']

export type VentaTipo = 'retail' | 'b2b'
export type TipoFiltro = 'todas' | VentaTipo
export type EstadoFiltro =
  | 'todos'
  | 'nuevo'
  | 'reservado'
  | 'vendido'
  | 'facturado'
  | 'anulado'

export const TIPOS_FILTRO: TipoFiltro[] = ['todas', 'retail', 'b2b']
export const ESTADOS_FILTRO: EstadoFiltro[] = [
  'todos',
  'nuevo',
  'reservado',
  'vendido',
  'facturado',
  'anulado',
]

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export interface VentasFiltros {
  tipo: TipoFiltro
  estado: EstadoFiltro
  q: string
  desde: string | null // YYYY-MM-DD inclusive
  hasta: string | null // YYYY-MM-DD exclusive
  page: number // 1-based
  pageSize: number
  /** Referencia para los KPIs "del mes" / "del trimestre". */
  now?: Date
}

/** Fila cruda tal como la devuelve la query. */
export interface VentaRowDb {
  tipo: VentaTipo
  id: number
  numero: string | null
  fecha: string | null
  estado: string
  importe: string | number | null
  cliente: string | null
  cliente_id: number | null
  marca: string | null
  modelo: string | null
  matricula: string | null
  factura_numero: string | null
  facturada: boolean
  anulada: boolean
  cuenta_venta: boolean
}

export interface VentaUnificada {
  key: string
  tipo: VentaTipo
  id: number
  numero: string | null
  fecha: string | null
  estado: string
  importe: number | null
  cliente: string | null
  vehiculo: string | null
  matricula: string | null
  facturada: boolean
  facturaNumero: string | null
  anulada: boolean
  cuentaVenta: boolean
  /** Ficha real de la venta: el deal, o el cliente B2B (la venta B2B vive ahí). */
  href: string
}

/** Límites del mes y del trimestre en curso (YYYY-MM-DD, `fin` exclusivo). */
export function periodosDe(now: Date) {
  const y = now.getFullYear()
  const m = now.getMonth() // 0-11
  const iso = (year: number, month0: number) =>
    `${year}-${String(month0 + 1).padStart(2, '0')}-01`
  const trimStart = Math.floor(m / 3) * 3
  return {
    mesInicio: iso(y, m),
    mesFin: m === 11 ? iso(y + 1, 0) : iso(y, m + 1),
    trimestreInicio: iso(y, trimStart),
    trimestreFin:
      trimStart + 3 > 11 ? iso(y + 1, 0) : iso(y, trimStart + 3),
  }
}

/**
 * Query única: página + total + contadores por tipo/estado + KPIs mes/trimestre.
 * Orden y paginación en SQL (nunca traer todo y cortar en JS).
 */
export function buildVentasUnificadasQuery(f: VentasFiltros): {
  sql: string
  params: unknown[]
} {
  const pageSize = Math.min(Math.max(1, f.pageSize), MAX_PAGE_SIZE)
  const page = Math.max(1, f.page)
  const { mesInicio, mesFin, trimestreInicio, trimestreFin } = periodosDe(
    f.now ?? new Date()
  )

  const params: unknown[] = [
    ACTIVE_INVOICE_STATUSES, // $1
    VOID_INVOICE_STATUSES, // $2
    f.tipo, // $3
    f.estado, // $4
    f.q.trim(), // $5
    f.desde, // $6
    f.hasta, // $7
    pageSize, // $8
    (page - 1) * pageSize, // $9
    mesInicio, // $10
    mesFin, // $11
    trimestreInicio, // $12
    trimestreFin, // $13
  ]

  const sql = `
    WITH factura_activa AS (
      SELECT i.deal_id, i.b2b_venta_id, i.full_invoice_number,
             i.invoice_date, i.total_amount
        FROM invoices i
       WHERE i.status = ANY($1::text[])
         AND i.invoice_type <> 'RECTIFYING'
    ),
    factura_anulada AS (
      SELECT i.deal_id, i.b2b_venta_id
        FROM invoices i
       WHERE i.status = ANY($2::text[])
    ),
    unificadas AS (
      SELECT
        'retail'::text AS tipo,
        d.id,
        d.numero,
        COALESCE(fa.invoice_date::date, d."fechaVentaFirmada"::date,
                 d."fechaFacturada"::date, d."createdAt"::date) AS fecha,
        d.estado::text AS estado,
        COALESCE(d."importeTotal", fa.total_amount)::numeric AS importe,
        NULLIF(TRIM(CONCAT_WS(' ', c.nombre, c.apellidos)), '') AS cliente,
        d."clienteId" AS cliente_id,
        ve.marca, ve.modelo, ve.matricula,
        fa.full_invoice_number AS factura_numero,
        (fa.full_invoice_number IS NOT NULL) AS facturada,
        (fa.full_invoice_number IS NULL AND an.hit IS NOT NULL) AS anulada
      FROM "Deal" d
      LEFT JOIN "Cliente" c ON c.id = d."clienteId"
      LEFT JOIN "Vehiculo" ve ON ve.id = d."vehiculoId"
      LEFT JOIN LATERAL (
        SELECT f.full_invoice_number, f.invoice_date, f.total_amount
          FROM factura_activa f WHERE f.deal_id = d.id LIMIT 1
      ) fa ON TRUE
      LEFT JOIN LATERAL (
        SELECT 1 AS hit FROM factura_anulada f WHERE f.deal_id = d.id LIMIT 1
      ) an ON TRUE

      UNION ALL

      SELECT
        'b2b'::text AS tipo,
        vb.id,
        vb.numero,
        COALESCE(fa.invoice_date::date, vb.fecha_venta::date) AS fecha,
        (CASE
           WHEN vb.status = 'ANULADO' THEN 'anulado'
           WHEN fa.full_invoice_number IS NOT NULL THEN 'facturado'
           ELSE 'vendido'
         END)::text AS estado,
        COALESCE(vb.precio_venta, fa.total_amount)::numeric AS importe,
        cb.razon_social AS cliente,
        vb.cliente_b2b_id AS cliente_id,
        vb.vehiculo_marca AS marca,
        vb.vehiculo_modelo AS modelo,
        vb.vehiculo_matricula AS matricula,
        fa.full_invoice_number AS factura_numero,
        (fa.full_invoice_number IS NOT NULL) AS facturada,
        (vb.status = 'ANULADO'
         OR (fa.full_invoice_number IS NULL AND an.hit IS NOT NULL)) AS anulada
      FROM venta_b2b vb
      LEFT JOIN cliente_b2b cb ON cb.id = vb.cliente_b2b_id
      LEFT JOIN LATERAL (
        SELECT f.full_invoice_number, f.invoice_date, f.total_amount
          FROM factura_activa f WHERE f.b2b_venta_id = vb.id LIMIT 1
      ) fa ON TRUE
      LEFT JOIN LATERAL (
        SELECT 1 AS hit FROM factura_anulada f WHERE f.b2b_venta_id = vb.id LIMIT 1
      ) an ON TRUE
    ),
    con_flags AS (
      SELECT u.*,
             (NOT u.anulada
              AND (u.facturada OR u.tipo = 'b2b'
                   OR u.estado IN ('vendido', 'facturado'))) AS cuenta_venta
        FROM unificadas u
    ),
    filtradas AS (
      SELECT * FROM con_flags cf
       WHERE ($3 = 'todas' OR cf.tipo = $3)
         AND ($4 = 'todos'
              OR ($4 = 'anulado' AND cf.anulada)
              OR ($4 <> 'anulado' AND cf.estado = $4 AND NOT cf.anulada))
         AND ($5 = '' OR (
              COALESCE(cf.numero, '') ILIKE '%' || $5 || '%'
           OR COALESCE(cf.cliente, '') ILIKE '%' || $5 || '%'
           OR COALESCE(cf.marca, '') ILIKE '%' || $5 || '%'
           OR COALESCE(cf.modelo, '') ILIKE '%' || $5 || '%'
           OR COALESCE(cf.matricula, '') ILIKE '%' || $5 || '%'
           OR COALESCE(cf.factura_numero, '') ILIKE '%' || $5 || '%'))
         AND ($6::date IS NULL OR cf.fecha >= $6::date)
         AND ($7::date IS NULL OR cf.fecha < $7::date)
    )
    SELECT json_build_object(
      'rows', (
        SELECT COALESCE(json_agg(p ORDER BY p.fecha DESC NULLS LAST, p.tipo, p.id DESC), '[]'::json)
          FROM (
            SELECT tipo, id, numero, fecha::text AS fecha, estado, importe,
                   cliente, cliente_id, marca, modelo, matricula,
                   factura_numero, facturada, anulada, cuenta_venta
              FROM filtradas
             ORDER BY fecha DESC NULLS LAST, tipo, id DESC
             LIMIT $8 OFFSET $9
          ) p
      ),
      'total', (SELECT COUNT(*) FROM filtradas),
      'contadores', (
        SELECT json_build_object(
          'todas', COUNT(*),
          'retail', COUNT(*) FILTER (WHERE tipo = 'retail'),
          'b2b', COUNT(*) FILTER (WHERE tipo = 'b2b'),
          'nuevo', COUNT(*) FILTER (WHERE estado = 'nuevo' AND NOT anulada),
          'reservado', COUNT(*) FILTER (WHERE estado = 'reservado' AND NOT anulada),
          'vendido', COUNT(*) FILTER (WHERE estado = 'vendido' AND NOT anulada),
          'facturado', COUNT(*) FILTER (WHERE estado = 'facturado' AND NOT anulada),
          'anulado', COUNT(*) FILTER (WHERE anulada)
        ) FROM con_flags
      ),
      'totales', (
        SELECT json_build_object(
          'mesVentas', COUNT(*) FILTER (
            WHERE cuenta_venta AND fecha >= $10::date AND fecha < $11::date),
          'mesImporte', COALESCE(SUM(importe) FILTER (
            WHERE cuenta_venta AND fecha >= $10::date AND fecha < $11::date), 0),
          'mesB2B', COUNT(*) FILTER (
            WHERE cuenta_venta AND tipo = 'b2b'
              AND fecha >= $10::date AND fecha < $11::date),
          'trimestreVentas', COUNT(*) FILTER (
            WHERE cuenta_venta AND fecha >= $12::date AND fecha < $13::date),
          'trimestreImporte', COALESCE(SUM(importe) FILTER (
            WHERE cuenta_venta AND fecha >= $12::date AND fecha < $13::date), 0),
          'trimestreB2B', COUNT(*) FILTER (
            WHERE cuenta_venta AND tipo = 'b2b'
              AND fecha >= $12::date AND fecha < $13::date),
          'sinFacturar', COUNT(*) FILTER (WHERE cuenta_venta AND NOT facturada)
        ) FROM con_flags
      )
    ) AS payload
  `

  return { sql, params }
}

const num = (v: string | number | null): number | null => {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function mapVentaRow(row: VentaRowDb): VentaUnificada {
  const vehiculo =
    [row.marca, row.modelo].filter(Boolean).join(' ').trim() || null
  return {
    key: `${row.tipo}-${row.id}`,
    tipo: row.tipo,
    id: row.id,
    numero: row.numero,
    fecha: row.fecha,
    estado: row.estado,
    importe: num(row.importe),
    cliente: row.cliente,
    vehiculo,
    matricula: row.matricula,
    facturada: Boolean(row.facturada),
    facturaNumero: row.factura_numero,
    anulada: Boolean(row.anulada),
    cuentaVenta: Boolean(row.cuenta_venta),
    href:
      row.tipo === 'retail'
        ? `/deals/${row.id}`
        : `/clientes-b2b/${row.cliente_id ?? ''}`,
  }
}

/** Normaliza los query params de la request (con defaults seguros). */
export function parseVentasFiltros(sp: URLSearchParams): VentasFiltros {
  const tipoRaw = sp.get('tipo') ?? 'todas'
  const estadoRaw = sp.get('estado') ?? 'todos'
  const pageRaw = parseInt(sp.get('page') ?? '1', 10)
  const sizeRaw = parseInt(sp.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10)
  const isDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)

  return {
    tipo: (TIPOS_FILTRO as string[]).includes(tipoRaw)
      ? (tipoRaw as TipoFiltro)
      : 'todas',
    estado: (ESTADOS_FILTRO as string[]).includes(estadoRaw)
      ? (estadoRaw as EstadoFiltro)
      : 'todos',
    q: (sp.get('q') ?? '').slice(0, 100),
    desde: isDate(sp.get('desde')),
    hasta: isDate(sp.get('hasta')),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    pageSize:
      Number.isFinite(sizeRaw) && sizeRaw > 0
        ? Math.min(sizeRaw, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE,
  }
}
