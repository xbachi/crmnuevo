const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

/**
 * Cambio de matrícula con historial (tabla vehiculo_matriculas).
 * Mismo camino que POST /api/vehiculos/[id]/matricula, para correr contra la DB.
 *
 * Requiere create-vehiculo-matriculas.sql aplicado.
 *
 * DRY-RUN por defecto. Para aplicar hay que pasar --apply.
 *
 * Caso real (BMW M2, bastidor WBS1J51010VD15935):
 *   node scripts/cambiar-matricula.js --id 398 --nueva 5439NNW \
 *     --motivo "matrícula provisional sustituida por definitiva (cambio de titular, justificante DGT)" \
 *     --apply
 *
 * La carpeta de OneDrive (83-Bmw-M2-5732BDR), la fila de CB 2026 y la factura
 * R-2026-027 NO se tocan: se quedan con la provisional y el alias hace el cruce.
 */
const normPlate = (s) => String(s || '').replace(/[\s.\-]/g, '').toUpperCase()

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : def
}

async function main() {
  const id = parseInt(arg('id', ''), 10)
  const nueva = String(arg('nueva', '')).trim().replace(/\s+/g, ' ').toUpperCase()
  const motivo = arg('motivo', null)
  const apply = process.argv.includes('--apply')
  if (!id || !normPlate(nueva)) {
    console.error('uso: node scripts/cambiar-matricula.js --id <n> --nueva <MATRICULA> [--motivo "..."] [--apply]')
    process.exit(1)
  }
  const nuevaNorm = normPlate(nueva)

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })
  const client = await pool.connect()
  try {
    const tabla = await client.query(`SELECT to_regclass('public.vehiculo_matriculas') AS reg`)
    if (!tabla.rows[0].reg) throw new Error('falta aplicar create-vehiculo-matriculas.sql')

    await client.query('BEGIN')
    const veh = await client.query(
      `SELECT id, matricula, bastidor, marca, modelo FROM "Vehiculo" WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (veh.rows.length === 0) throw new Error(`vehículo ${id} no existe`)
    const v = veh.rows[0]
    const actual = v.matricula || ''
    const actualNorm = normPlate(actual)
    console.log(`vehículo ${id}: ${v.marca} ${v.modelo} (${v.bastidor})`)
    console.log(`  actual : ${actual || '(sin matrícula)'}`)
    console.log(`  nueva  : ${nueva}`)
    console.log(`  motivo : ${motivo || '(sin motivo)'}`)
    if (actualNorm === nuevaNorm) throw new Error('la matrícula nueva es igual a la actual')

    const otro = await client.query(
      `SELECT vehiculo_id FROM vehiculo_matriculas WHERE matricula_norm = $1 AND vehiculo_id <> $2
       UNION
       SELECT id FROM "Vehiculo" WHERE matricula_norm = $1 AND id <> $2`,
      [nuevaNorm, id]
    )
    if (otro.rows.length > 0) {
      throw new Error(`la matrícula ${nueva} ya pertenece al vehículo ${otro.rows[0].vehiculo_id}`)
    }

    if (actualNorm) {
      await client.query(
        `INSERT INTO vehiculo_matriculas (vehiculo_id, matricula, es_actual)
         VALUES ($1, $2, TRUE) ON CONFLICT (vehiculo_id, matricula_norm) DO NOTHING`,
        [id, actual]
      )
      await client.query(
        `UPDATE vehiculo_matriculas SET es_actual = FALSE, hasta = COALESCE(hasta, CURRENT_DATE)
          WHERE vehiculo_id = $1 AND matricula_norm = $2`,
        [id, actualNorm]
      )
    }
    await client.query(
      `UPDATE vehiculo_matriculas SET es_actual = FALSE, hasta = COALESCE(hasta, CURRENT_DATE)
        WHERE vehiculo_id = $1 AND es_actual AND matricula_norm <> $2`,
      [id, nuevaNorm]
    )
    await client.query(
      `INSERT INTO vehiculo_matriculas (vehiculo_id, matricula, desde, motivo, es_actual)
       VALUES ($1, $2, CURRENT_DATE, $3, TRUE)
       ON CONFLICT (vehiculo_id, matricula_norm)
       DO UPDATE SET es_actual = TRUE, hasta = NULL,
                     motivo = COALESCE(EXCLUDED.motivo, vehiculo_matriculas.motivo)`,
      [id, nueva, motivo]
    )
    await client.query(`UPDATE "Vehiculo" SET matricula = $1 WHERE id = $2`, [nueva, id])

    const hist = await client.query(
      `SELECT matricula, desde, hasta, es_actual, motivo FROM vehiculo_matriculas
        WHERE vehiculo_id = $1 ORDER BY es_actual DESC, id DESC`,
      [id]
    )
    console.log('\nhistorial resultante:')
    for (const h of hist.rows) {
      console.log(
        `  ${h.es_actual ? '→' : ' '} ${h.matricula}  desde=${h.desde || '-'} hasta=${h.hasta || '-'}  ${h.motivo || ''}`
      )
    }

    if (apply) {
      await client.query('COMMIT')
      console.log('\nAPLICADO.')
    } else {
      await client.query('ROLLBACK')
      console.log('\nDRY-RUN (nada guardado). Repetí con --apply.')
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('ERROR:', e.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
