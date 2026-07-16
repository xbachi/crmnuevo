/**
 * Backfill del maestro de proveedores desde facturas_registro.
 *
 * facturas_registro.proveedor es texto libre. Este script siembra `proveedores`
 * con un alta por proveedor distinto (nombre = el texto tal cual, aliases = [ese
 * texto], categoria_defecto = su categoría más frecuente) y luego enlaza
 * facturas_registro.proveedor_id.
 *
 * NO inventa NIFs: quedan NULL y se completan a mano en la ficha. Tampoco
 * fusiona variantes del mismo proveedor ("MECAUTO" vs "Mecauto SL"): eso es
 * criterio humano — se resuelve después agregando aliases a la ficha buena.
 *
 * Idempotente: ON CONFLICT DO NOTHING + sólo enlaza filas con proveedor_id NULL.
 *
 * Uso:
 *   node scripts/backfill-proveedores.js            # dry-run (default)
 *   node scripts/backfill-proveedores.js --apply    # escribe
 *
 * Requiere aplicar antes: create-proveedores.sql y add-facturas-registro-fiscal.sql.
 */
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(
    apply
      ? 'Modo APPLY: se escriben los INSERT/UPDATE.'
      : 'Modo DRY-RUN (default): no se escribe nada. Usá --apply para escribir.'
  )

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, // regla del proyecto: 1 conexión
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  try {
    // proveedores distintos + su categoría más frecuente (desempate alfabético,
    // determinista: dos corridas dan el mismo resultado)
    const { rows } = await pool.query(
      `SELECT fr.proveedor,
              COUNT(*)::int AS facturas,
              (SELECT x.categoria
                 FROM facturas_registro x
                WHERE x.proveedor = fr.proveedor
                GROUP BY x.categoria
                ORDER BY COUNT(*) DESC, x.categoria
                LIMIT 1) AS categoria_defecto
         FROM facturas_registro fr
        GROUP BY fr.proveedor
        ORDER BY fr.proveedor`
    )
    console.log(`\nfacturas_registro: ${rows.length} proveedores distintos`)

    const { rows: yaExisten } = await pool.query(`SELECT lower(nombre) AS n FROM proveedores`)
    const existentes = new Set(yaExisten.map((r) => r.n))

    let insertados = 0
    for (const r of rows) {
      const nombre = r.proveedor
      if (existentes.has(String(nombre).toLowerCase())) {
        console.log(`  = ya existe: "${nombre}" (${r.facturas} facturas)`)
        continue
      }
      insertados++
      if (apply) {
        await pool.query(
          `INSERT INTO proveedores (nombre, aliases, categoria_defecto)
                VALUES ($1, ARRAY[$1], $2)
           ON CONFLICT (lower(nombre)) DO NOTHING`,
          [nombre, r.categoria_defecto]
        )
      }
      console.log(
        `  ${apply ? '+' : '[dry-run] +'} "${nombre}" → categoria_defecto=${r.categoria_defecto} (${r.facturas} facturas, nif=NULL)`
      )
    }

    // enlace facturas_registro → proveedores (case-insensitive: mismo criterio
    // que ux_proveedores_nombre). Sólo filas sin enlazar → re-correr no pisa
    // asignaciones hechas a mano.
    const enlaceSql = `UPDATE facturas_registro fr
                          SET proveedor_id = p.id
                         FROM proveedores p
                        WHERE lower(p.nombre) = lower(fr.proveedor)
                          AND fr.proveedor_id IS NULL`
    let enlazadas
    if (apply) {
      const res = await pool.query(enlaceSql)
      enlazadas = res.rowCount
    } else {
      const { rows: prev } = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM facturas_registro fr
           JOIN proveedores p ON lower(p.nombre) = lower(fr.proveedor)
          WHERE fr.proveedor_id IS NULL`
      )
      enlazadas = prev[0].n // en dry-run sólo cuenta contra los proveedores YA existentes
    }

    const { rows: pend } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM facturas_registro WHERE proveedor_id IS NULL`
    )

    console.log(`\n=== Resumen (${apply ? 'APLICADO' : 'DRY-RUN'}) ===`)
    console.log(`  proveedores ${apply ? 'insertados' : 'a insertar'}: ${insertados}`)
    console.log(`  facturas ${apply ? 'enlazadas' : 'enlazables ahora'}: ${enlazadas}`)
    console.log(`  facturas sin proveedor_id ${apply ? 'tras el backfill' : 'antes del backfill'}: ${pend[0].n}`)
    if (!apply && insertados > 0) {
      console.log(`  (con --apply también se enlazarían las de los ${insertados} proveedores nuevos)`)
    }
    console.log(`\n  NIFs: quedan NULL a propósito — completar a mano en la ficha de cada proveedor.`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
