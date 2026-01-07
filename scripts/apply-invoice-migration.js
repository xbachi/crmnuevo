/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL')
  }

  const migrationPath = path.join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260107_add_invoice_ingestion',
    'migration.sql'
  )
  const sql = fs.readFileSync(migrationPath, 'utf8')

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
  })

  const client = await pool.connect()
  try {
    console.log('[INVOICES][MIGRATION] Applying:', migrationPath)
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log('[INVOICES][MIGRATION] OK')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[INVOICES][MIGRATION] FAILED', e)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error('[INVOICES][MIGRATION] Fatal', e)
  process.exit(1)
})
