const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

// READ-ONLY. Analiza gasto_facturas para 3 categorías de la auditoría:
//  A) duplicados por nº canónico (mismo nº real, 2 filenames)
//  B) duplicados probables por (vehiculo_id, tipo, importe) con distinto filename
//     y SIN nº canónico compartido (los renombres genéricos)
//  C) facturas en facturas_registro (coche-servicio) sin gasto correspondiente
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } })

  console.log('=== A) Duplicados por numero_canonico ===')
  const a = await pool.query(`
    SELECT tipo, numero_canonico, vehiculo_id, COUNT(*) n, SUM(importe) suma,
           array_agg(id ORDER BY id) ids, array_agg(numero_factura ORDER BY id) archivos, array_agg(importe ORDER BY id) importes
    FROM gasto_facturas WHERE numero_canonico IS NOT NULL
    GROUP BY tipo, numero_canonico, vehiculo_id HAVING COUNT(*) > 1
    ORDER BY tipo, numero_canonico`)
  for (const r of a.rows) console.log(`  ${r.tipo} ${r.numero_canonico} veh=${r.vehiculo_id}: ids=${r.ids} imp=${r.importes}`)
  console.log(`  total grupos A: ${a.rows.length}`)

  console.log('\n=== B) Duplicados probables por (vehiculo_id, tipo, importe) distinto filename ===')
  const b = await pool.query(`
    SELECT vehiculo_id, tipo, importe, COUNT(*) n,
           array_agg(id ORDER BY id) ids,
           array_agg(numero_factura ORDER BY id) archivos,
           array_agg(numero_canonico ORDER BY id) canonicos,
           array_agg(matricula ORDER BY id) mats
    FROM gasto_facturas
    GROUP BY vehiculo_id, tipo, importe HAVING COUNT(*) > 1
    ORDER BY vehiculo_id, tipo`)
  for (const r of b.rows) {
    console.log(`  veh=${r.vehiculo_id} ${r.tipo} ${r.importe}€ x${r.n} mat=${r.mats[0]}`)
    for (let i = 0; i < r.ids.length; i++) console.log(`     id=${r.ids[i]} canon=${r.canonicos[i] || '-'} arch="${r.archivos[i]}"`)
  }
  console.log(`  total grupos B: ${b.rows.length}`)

  console.log('\n=== C) facturas_registro coche-servicio SIN gasto (por matrícula+importe aprox) ===')
  const c = await pool.query(`
    SELECT fr.id, fr.proveedor, fr.numero_factura, fr.importe, fr.matricula, fr.fecha_factura, fr.nombre_archivo
    FROM facturas_registro fr
    WHERE fr.categoria = 'coche-servicio' AND fr.matricula IS NOT NULL AND fr.importe IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM gasto_facturas g
        WHERE g.matricula = fr.matricula AND ABS(g.importe - fr.importe) < 0.01
      )
    ORDER BY fr.matricula, fr.fecha_factura`)
  for (const r of c.rows) console.log(`  reg#${r.id} ${r.proveedor} ${r.numero_factura} ${r.importe}€ mat=${r.matricula} fecha=${r.fecha_factura} arch="${r.nombre_archivo}"`)
  console.log(`  total C (registrada sin gasto): ${c.rows.length}`)

  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
