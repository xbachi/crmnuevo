const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

// Recomputa gastosMecanica y gastosLimpieza = SUM(gasto_facturas del tipo) para
// los vehículos afectados por la dedup. Solo esas dos columnas (los borrados
// fueron mecauto y world-detailing). Reporta antes/después. --apply para escribir.
const APPLY = process.argv.includes('--apply')
const AFFECTED = [287, 290, 295, 350, 352, 353, 355, 366, 367, 372, 373, 375, 380, 388, 392, 393, 395]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } })
  let cambios = 0
  for (const vid of AFFECTED) {
    const mec = await pool.query(
      `SELECT COALESCE(SUM(importe),0) s FROM gasto_facturas WHERE vehiculo_id=$1 AND tipo IN ('mecauto')`, [vid])
    const lim = await pool.query(
      `SELECT COALESCE(SUM(importe),0) s FROM gasto_facturas WHERE vehiculo_id=$1 AND tipo IN ('world','world-detailing','worlddetailing','limpieza')`, [vid])
    const cur = await pool.query(`SELECT id, matricula, "gastosMecanica", "gastosLimpieza" FROM "Vehiculo" WHERE id=$1`, [vid])
    const v = cur.rows[0]
    if (!v) { console.log(`  veh=${vid} NO EXISTE`); continue }
    const newMec = Number(mec.rows[0].s), newLim = Number(lim.rows[0].s)
    const oldMec = Number(v.gastosMecanica || 0), oldLim = Number(v.gastosLimpieza || 0)
    if (Math.abs(newMec - oldMec) > 0.001 || Math.abs(newLim - oldLim) > 0.001) {
      cambios++
      console.log(`  veh=${vid} ${v.matricula}: Mecanica ${oldMec}→${newMec}  Limpieza ${oldLim}→${newLim}`)
      if (APPLY) {
        await pool.query(`UPDATE "Vehiculo" SET "gastosMecanica"=$1, "gastosLimpieza"=$2 WHERE id=$3`, [newMec, newLim, vid])
      }
    }
  }
  console.log(`\n${APPLY ? 'APLICADO' : 'DRY-RUN'}: ${cambios} vehículos con cambio`)
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
