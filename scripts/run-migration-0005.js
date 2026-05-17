const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
  max: 1,
})

async function run() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'sql', '0005-b2b-module.sql'),
    'utf8'
  )
  const client = await pool.connect()
  try {
    console.log('→ Ejecutando 0005-b2b-module.sql...')
    await client.query(sql)
    console.log('  ✓ Migración aplicada')

    console.log('\n→ Verificación:')
    const t1 = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'cliente_b2b' ORDER BY ordinal_position`
    )
    console.log(
      '  cliente_b2b columns:',
      t1.rows.map((r) => r.column_name).join(', ')
    )
    const t2 = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'venta_b2b' ORDER BY ordinal_position`
    )
    console.log(
      '  venta_b2b columns:',
      t2.rows.map((r) => r.column_name).join(', ')
    )
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((e) => {
  console.error('✗ Error:', e.message)
  process.exit(1)
})
