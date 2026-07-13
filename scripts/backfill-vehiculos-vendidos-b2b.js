/**
 * Backfill: coches vendidos por B2B que siguieron figurando en stock.
 *
 * Hasta el fix, crear/facturar una venta_b2b no tocaba "Vehiculo".estado (el
 * flujo retail sí lo hace, ver updateDeal en src/lib/direct-database.ts). Esos
 * coches siguen contando como stock: KPI de vendidos, "Ventas por mes" y
 * stock-aging (capital inmovilizado) leen Vehiculo.estado.
 *
 * Marca VENDIDO los vehículos con una venta B2B VIGENTE. Vigente = mismo
 * criterio fiscal que src/lib/ventasUnificadas.ts:
 *   status <> 'ANULADO' Y (tiene factura activa Ó no tiene ninguna anulada)
 * Una venta ANULADA, o cuya única factura quedó RECTIFIED/VOIDED, NO marca
 * nada (es justo el caso peligroso: el coche volvió a stock a propósito).
 *
 * "updatedAt" se fija a fecha_venta, no a NOW(): getVentasPorMes agrupa el
 * gráfico por Vehiculo."updatedAt" y con NOW() todas las ventas viejas caerían
 * en el mes actual.
 *
 * Uso:
 *   node scripts/backfill-vehiculos-vendidos-b2b.js            # dry-run (default)
 *   node scripts/backfill-vehiculos-vendidos-b2b.js --apply    # escribe
 */
/* eslint-disable @typescript-eslint/no-require-imports -- script de node pelado, sin transpilar */
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

// Espejo de ventaB2BVigenteSql() en src/lib/b2b-database.ts.
const VIGENTE = `(
  vb.status <> 'ANULADO'
  AND (
    EXISTS (
      SELECT 1 FROM invoices i
       WHERE i.b2b_venta_id = vb.id
         AND i.status IN ('ISSUED', 'IMPORTED', 'PDF_PENDING')
         AND i.invoice_type <> 'RECTIFYING'
    )
    OR NOT EXISTS (
      SELECT 1 FROM invoices i
       WHERE i.b2b_venta_id = vb.id
         AND i.status IN ('RECTIFIED', 'VOIDED')
    )
  )
)`

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })

  try {
    // Un vehículo puede tener más de una venta B2B vigente (reventa): nos
    // quedamos con la más reciente sólo para la fecha del UPDATE.
    const { rows: candidatos } = await pool.query(
      `SELECT DISTINCT ON (vb.vehiculo_id)
              vb.vehiculo_id, vb.id AS venta_id, vb.numero, vb.status,
              vb.fecha_venta,
              v.referencia, v.marca, v.modelo, v.matricula,
              COALESCE(v.estado, '') AS estado, v."dealActivoId"
         FROM venta_b2b vb
         JOIN "Vehiculo" v ON v.id = vb.vehiculo_id
        WHERE vb.vehiculo_id IS NOT NULL
          AND UPPER(TRIM(COALESCE(v.estado, ''))) <> 'VENDIDO'
          AND ${VIGENTE}
        ORDER BY vb.vehiculo_id, vb.fecha_venta DESC, vb.id DESC`
    )

    // Un deal retail reclamando el mismo coche = conflicto real: no se toca.
    const aMarcar = candidatos.filter((r) => r.dealActivoId == null)
    const conflictos = candidatos.filter((r) => r.dealActivoId != null)

    console.log(
      `\n=== Backfill vehículos vendidos por B2B (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`
    )
    console.log(`Candidatos: ${candidatos.length}`)
    console.log(`  → a marcar VENDIDO: ${aMarcar.length}`)
    console.log(`  → en conflicto (los reclama un deal): ${conflictos.length}\n`)

    for (const r of aMarcar) {
      console.log(
        `  [${r.numero}] ${r.status.padEnd(11)} veh ${String(r.vehiculo_id).padStart(4)} ` +
          `${(r.referencia || '-').padEnd(8)} ${(r.matricula || '-').padEnd(9)} ` +
          `${r.marca || ''} ${r.modelo || ''} | estado '${r.estado}' → 'VENDIDO' ` +
          `| updatedAt → ${new Date(r.fecha_venta).toISOString().slice(0, 10)}`
      )
    }
    for (const r of conflictos) {
      console.log(
        `  ⚠️  CONFLICTO [${r.numero}] veh ${r.vehiculo_id} (${r.matricula}) ` +
          `lo reclama el deal ${r.dealActivoId} — revisar a mano, NO se toca`
      )
    }

    // Info: coches marcados VENDIDO cuya única venta B2B está anulada y no
    // tienen deal. Se listan pero NO se tocan (pueden venir de una venta retail
    // vieja o de una carga manual).
    const { rows: sospechosos } = await pool.query(
      `SELECT v.id, v.referencia, v.matricula, v.estado, v."dealActivoId"
         FROM "Vehiculo" v
        WHERE UPPER(TRIM(COALESCE(v.estado, ''))) = 'VENDIDO'
          AND v."dealActivoId" IS NULL
          AND EXISTS (SELECT 1 FROM venta_b2b vb WHERE vb.vehiculo_id = v.id)
          AND NOT EXISTS (
                SELECT 1 FROM venta_b2b vb
                 WHERE vb.vehiculo_id = v.id AND ${VIGENTE})
        ORDER BY v.id`
    )
    if (sospechosos.length > 0) {
      console.log(
        `\nℹ️  ${sospechosos.length} coche(s) VENDIDO cuya venta B2B está anulada (sólo informativo, no se tocan):`
      )
      for (const s of sospechosos) {
        console.log(`     veh ${s.id} ${s.referencia || '-'} ${s.matricula || '-'}`)
      }
    }

    if (!APPLY) {
      console.log('\nDry-run: no se escribió nada. Re-corré con --apply.\n')
      return
    }

    let ok = 0
    for (const r of aMarcar) {
      const res = await pool.query(
        `UPDATE "Vehiculo"
            SET estado = 'VENDIDO', "updatedAt" = $2::timestamptz
          WHERE id = $1
            AND UPPER(TRIM(COALESCE(estado, ''))) <> 'VENDIDO'
            AND "dealActivoId" IS NULL`,
        [r.vehiculo_id, r.fecha_venta]
      )
      ok += res.rowCount ?? 0
    }
    console.log(`\n✅ ${ok} vehículo(s) marcados VENDIDO.\n`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
