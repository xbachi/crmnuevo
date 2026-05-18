/**
 * Aplica migración 0009 (tabla users) y crea los 2 usuarios iniciales
 * con scrypt. Si ya existen (por email) NO los pisa.
 *
 * Credenciales preservadas para no romper login a los usuarios reales:
 *   admin@sevencars.local  / malafama       (admin)
 *   asesor@sevencars.local / Sevencars2025   (asesor)
 *
 * IMPORTANTE: cambialas con el flow normal de update desde la UI
 * cuando esté listo, o con un UPDATE manual en SQL Editor.
 */
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
})

function hashPassword(plain) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

;(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'sql', '0009-users-auth.sql'), 'utf8')
  const c = await pool.connect()
  try {
    console.log('→ Aplicando migration 0009...')
    await c.query(sql)
    console.log('  ✓ tabla users creada')

    const seedUsers = [
      { email: 'admin@sevencars.local', password: 'malafama', role: 'admin', name: 'Admin' },
      { email: 'asesor@sevencars.local', password: 'Sevencars2025', role: 'asesor', name: 'Asesor' },
    ]

    for (const u of seedUsers) {
      const existing = await c.query('SELECT id FROM users WHERE email = $1', [u.email])
      if (existing.rows.length > 0) {
        console.log(`  - ${u.email} ya existe (id ${existing.rows[0].id}), skip`)
        continue
      }
      const hash = hashPassword(u.password)
      const r = await c.query(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [u.email, hash, u.role, u.name]
      )
      console.log(`  ✓ creado ${u.email} (role=${u.role}, id=${r.rows[0].id})`)
    }

    console.log('\n→ Estado final:')
    const r = await c.query('SELECT id, email, role, display_name, active FROM users ORDER BY id')
    r.rows.forEach((row) =>
      console.log(`  #${row.id}  ${row.email.padEnd(30)} role=${row.role}  active=${row.active}`)
    )
  } finally {
    c.release()
    await pool.end()
  }
})().catch((e) => {
  console.error('✗ Error:', e.message)
  process.exit(1)
})
