/**
 * Backfill de expedientes (deal jacket) para facturas ya emitidas.
 *
 * Crea un expediente por cada invoice ISSUED/IMPORTED de 2026 (retail y B2B)
 * que no tenga uno, infiriendo el tipo de operación:
 *   b2b_venta_id ≠ NULL          → 'b2b'
 *   Vehiculo.tipo ~ deposito     → 'deposito'
 *   invoice_type = 'REBU'        → 'retail-rebu'
 *   resto (VAT)                  → 'retail-vat'
 * y marcando la checklist contra la evidencia disponible (automation_logs +
 * facturas_registro categoria 'coche-compra'). Imprime resumen por estado.
 *
 * Uso:
 *   node scripts/backfill-expedientes.js            # dry-run (default)
 *   node scripts/backfill-expedientes.js --apply    # escribe los INSERT
 *
 * Requiere aplicar antes create-expedientes.sql.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- script de node pelado, sin transpilar */
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const YEAR = 2026

// ─────────────────────────────────────────────────────────────────────────────
// Origen: src/lib/expedienteChecklist.ts — MISMA lógica, duplicada acá porque
// este script corre con node pelado (sin transpilar TS). Si tocás las reglas
// allá, replicá el cambio acá.
// ─────────────────────────────────────────────────────────────────────────────
const ITEM_LABELS = {
  'factura-venta': 'Factura de venta',
  'contrato-venta': 'Contrato de venta',
  'factura-compra': 'Factura de compra',
  'contrato-compra': 'Contrato de compra',
  'contrato-deposito': 'Contrato de depósito',
}
const item = (clave, requerido) => ({ clave, label: ITEM_LABELS[clave], requerido })

function checklistRequerida(tipo) {
  const base = [item('factura-venta', true), item('contrato-venta', true)]
  switch (tipo) {
    case 'retail-vat':
      return [...base, item('factura-compra', true)]
    case 'retail-rebu':
      return [...base, item('contrato-compra', true)]
    case 'b2b':
      return [...base, item('factura-compra', true), item('contrato-compra', false)]
    case 'deposito':
      return [...base, item('contrato-deposito', true)]
    default:
      throw new Error(`tipo de operación desconocido: ${tipo}`)
  }
}

function evaluarEstado(checklist) {
  const faltan = checklist.filter((i) => i.requerido && !i.presente)
  return faltan.length > 0 ? 'incompleto' : 'completo'
}

const normPlate = (s) => String(s).replace(/[\s.\-]/g, '').toUpperCase()

function esDepositoVehiculoTipo(tipo) {
  if (!tipo) return false
  const t = String(tipo)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return t === 'd' || t.includes('deposito') || t.includes('consignacion')
}

function inferirTipo(inv) {
  if (inv.b2b_venta_id != null) return 'b2b'
  if (esDepositoVehiculoTipo(inv.vehiculo_tipo)) return 'deposito'
  return inv.invoice_type === 'REBU' ? 'retail-rebu' : 'retail-vat'
}
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  try {
    const reg = await pool.query(`SELECT to_regclass('public.expedientes') AS reg`)
    if (!reg.rows[0].reg) {
      console.error('La tabla expedientes no existe. Aplicar create-expedientes.sql primero.')
      process.exitCode = 1
      return
    }

    // Facturas ISSUED/IMPORTED de 2026 (retail + B2B) sin expediente.
    const { rows: invoices } = await pool.query(
      `SELECT i.id, i.full_invoice_number, i.invoice_type, i.invoice_date::text AS invoice_date,
              i.deal_id, i.b2b_venta_id, i.vehiculo_id, i.vehicle_plate,
              v.tipo AS vehiculo_tipo
         FROM invoices i
         LEFT JOIN "Vehiculo" v ON v.id = i.vehiculo_id
         LEFT JOIN expedientes e ON e.numero_factura = i.full_invoice_number
        WHERE i.status IN ('ISSUED', 'IMPORTED')
          AND i.invoice_date >= $1 AND i.invoice_date < $2
          AND e.id IS NULL
        ORDER BY i.invoice_date, i.id`,
      [`${YEAR}-01-01`, `${YEAR + 1}-01-01`]
    )
    console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — ${invoices.length} facturas ${YEAR} sin expediente\n`)

    // Evidencia en lote: automation_logs por nº de factura, facturas_registro
    // (coche-compra) por matrícula.
    const { rows: logRows } = await pool.query(
      `SELECT DISTINCT ON (numero_factura)
              numero_factura, venta_guardada, compra_adjunta, contrato_enviado
         FROM automation_logs
        WHERE numero_factura IS NOT NULL
        ORDER BY numero_factura, created_at DESC`
    )
    const logs = new Map(logRows.map((r) => [r.numero_factura, r]))
    const { rows: compraRows } = await pool.query(
      `SELECT DISTINCT matricula FROM facturas_registro
        WHERE categoria = 'coche-compra' AND matricula IS NOT NULL`
    )
    const matriculasConCompra = new Set(compraRows.map((r) => r.matricula))

    const porEstado = {}
    const porTipo = {}
    for (const inv of invoices) {
      const tipo = inferirTipo(inv)
      const log = logs.get(inv.full_invoice_number)
      const plate = inv.vehicle_plate ? normPlate(inv.vehicle_plate) : null
      const compraOk =
        log?.compra_adjunta === true || (plate != null && matriculasConCompra.has(plate))
      const evidencia = {
        'factura-venta': log?.venta_guardada === true,
        'factura-compra': compraOk,
        'contrato-compra': compraOk,
        'contrato-venta': log?.contrato_enviado === true,
      }
      const checklist = checklistRequerida(tipo).map((def) => ({
        ...def,
        presente: evidencia[def.clave] === true,
      }))
      const estado = evaluarEstado(checklist)
      porEstado[estado] = (porEstado[estado] ?? 0) + 1
      porTipo[tipo] = (porTipo[tipo] ?? 0) + 1

      const faltan = checklist
        .filter((i) => i.requerido && !i.presente)
        .map((i) => i.clave)
        .join(', ')
      console.log(
        `${inv.full_invoice_number}  ${(plate ?? '—').padEnd(8)} ${tipo.padEnd(12)} → ${estado}` +
          (faltan ? `  (faltan: ${faltan})` : '')
      )

      if (APPLY) {
        await pool.query(
          `INSERT INTO expedientes
             (tipo_operacion, deal_id, b2b_venta_id, vehiculo_id, matricula,
              numero_factura, invoice_date, estado, checklist)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
           ON CONFLICT (numero_factura) DO NOTHING`,
          [
            tipo,
            inv.deal_id,
            inv.b2b_venta_id,
            inv.vehiculo_id,
            plate,
            inv.full_invoice_number,
            inv.invoice_date,
            estado,
            JSON.stringify(checklist),
          ]
        )
      }
    }

    console.log('\nResumen por estado:', porEstado)
    console.log('Resumen por tipo:  ', porTipo)
    if (!APPLY) console.log('\nDry-run: no se escribió nada. Correr con --apply para insertar.')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
