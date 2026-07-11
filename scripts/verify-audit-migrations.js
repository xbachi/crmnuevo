const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })

  const dupCheck = await pool.query(`
    SELECT numero_factura, COUNT(*) FROM automation_logs
    WHERE numero_factura IS NOT NULL
    GROUP BY numero_factura HAVING COUNT(*) > 1
  `)
  console.log('automation_logs duplicados restantes:', dupCheck.rows.length)

  const idx1 = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename='automation_logs' AND indexname='idx_automation_logs_numero_factura_unique'`)
  console.log('idx_automation_logs_numero_factura_unique existe:', idx1.rows.length === 1)

  const col1 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='gasto_facturas' AND column_name='numero_canonico'`)
  console.log('gasto_facturas.numero_canonico existe:', col1.rows.length === 1)

  const tbl1 = await pool.query(`SELECT to_regclass('public.webhook_outbox') AS t`)
  console.log('webhook_outbox existe:', tbl1.rows[0].t !== null)

  const cols2 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='costobeneficio_logs' AND column_name IN ('source','cell_ref','previous_value','new_value','vehiculo_id','dry_run') ORDER BY column_name`)
  console.log('costobeneficio_logs nuevas columnas:', cols2.rows.map(r => r.column_name).join(', '))

  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
