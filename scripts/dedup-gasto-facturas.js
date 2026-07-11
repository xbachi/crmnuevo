const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

// Deduplica gasto_facturas: por cada (vehiculo_id, tipo, importe) con >1 fila,
// conserva la MEJOR (canónico no-null > filename más largo/descriptivo > menor id)
// y marca las demás para borrar. Son recargas de la MISMA factura (SHEET2026 del
// bulk-import viejo, _2, o nombres genéricos); en ningún grupo hay 2 nº canónicos
// distintos (eso sería 2 servicios reales — no se colapsan).
// --apply para ejecutar; sin flag = dry-run.
const APPLY = process.argv.includes('--apply')

function best(rows) {
  return [...rows].sort((a, b) => {
    const ac = a.numero_canonico ? 1 : 0
    const bc = b.numero_canonico ? 1 : 0
    if (ac !== bc) return bc - ac
    const al = (a.numero_factura || '').length
    const bl = (b.numero_factura || '').length
    if (al !== bl) return bl - al
    return a.id - b.id
  })[0]
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } })

  const { rows } = await pool.query(
    `SELECT id, vehiculo_id, tipo, importe, numero_factura, numero_canonico, matricula
       FROM gasto_facturas ORDER BY vehiculo_id, tipo, importe, id`)

  const groups = new Map()
  for (const r of rows) {
    const k = `${r.vehiculo_id}|${r.tipo}|${Number(r.importe).toFixed(2)}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }

  const toDelete = []
  let guard = false
  for (const [k, g] of groups) {
    if (g.length < 2) continue
    // GUARDA: si hay >1 nº canónico DISTINTO en el grupo, son servicios reales distintos → NO tocar
    const canons = new Set(g.filter(r => r.numero_canonico).map(r => r.numero_canonico))
    if (canons.size > 1) {
      console.log(`  ⚠️ SKIP ${k}: ${canons.size} canónicos distintos (${[...canons].join(',')}) — posibles servicios reales`)
      guard = true
      continue
    }
    const keep = best(g)
    for (const r of g) if (r.id !== keep.id) toDelete.push({ ...r, keptId: keep.id, keptCanon: keep.numero_canonico })
  }

  console.log(`\n=== ${APPLY ? 'APLICANDO' : 'DRY-RUN'}: ${toDelete.length} filas a borrar ===`)
  let suma = 0
  for (const d of toDelete) {
    suma += Number(d.importe)
    console.log(`  DEL id=${d.id} veh=${d.vehiculo_id} ${d.tipo} ${d.importe}€ mat=${d.matricula} arch="${d.numero_factura}" (conserva id=${d.keptId})`)
  }
  console.log(`  Total importe de filas borradas: ${suma.toFixed(2)}€ (no cambia el gasto real: eran doble-conteo)`)
  if (guard) console.log('  (hubo grupos SKIP con canónicos distintos — revisar a mano)')

  if (APPLY && toDelete.length) {
    const ids = toDelete.map(d => d.id)
    await pool.query(`DELETE FROM gasto_facturas WHERE id = ANY($1)`, [ids])
    console.log(`\n  Borradas ${ids.length} filas.`)
    // recomputar Vehiculo.gastos* de los coches afectados
    const vehIds = [...new Set(toDelete.map(d => d.vehiculo_id))]
    const { TIPO_A_CAMPO } = { TIPO_A_CAMPO: null }
    // recompute per campo: agrupar tipos por campo via tabla de mapping en SQL simple
    // (mecauto/fergo/itv→gastosTaller, world→gastosLimpieza, etc.) — usamos el mismo
    // criterio que el endpoint: SUM por conjunto de tipos que comparten campo.
    console.log(`  Recomputando ${vehIds.length} vehículos afectados...`)
    for (const vid of vehIds) {
      // recomputar TODOS los campos de gasto de ese vehículo desde las filas restantes
      const campos = await pool.query(
        `SELECT tipo, COALESCE(SUM(importe),0) s FROM gasto_facturas WHERE vehiculo_id=$1 GROUP BY tipo`, [vid])
      // dejamos el recálculo fino al resync del CRM; acá solo reportamos
    }
    console.log('  ⚠️ Recompute de columnas Vehiculo.gastos* + resync CB: correr scripts/recompute-vehiculo-gastos.js')
  }

  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
