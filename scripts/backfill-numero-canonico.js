/**
 * Backfill de gasto_facturas.numero_canonico (auditoría C-03).
 *
 * Recorre gasto_facturas, extrae el nº canónico del filename guardado en
 * numero_factura y lo escribe en numero_canonico. Al final imprime los grupos
 * (tipo, numero_canonico, vehiculo_id) con count > 1: candidatos a limpieza
 * manual. NO borra nada.
 *
 * Uso:
 *   node scripts/backfill-numero-canonico.js            # dry-run (default)
 *   node scripts/backfill-numero-canonico.js --apply    # escribe los UPDATE
 *
 * Requiere aplicar antes fix-gasto-facturas-dedup.sql (columna numero_canonico).
 */
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

// ─────────────────────────────────────────────────────────────────────────────
// Origen: src/lib/facturaNumero.ts — MISMA lógica, duplicada acá porque este
// script corre con node pelado (sin transpilar TS). Si tocás los patrones allá,
// replicá el cambio acá.
// ─────────────────────────────────────────────────────────────────────────────
const EXT_RE = /\.(PDF|JPG|JPEG|PNG|TIF|TIFF|HEIC)$/
const COPIA_RE = /(?:[-_ ]?\(\d{1,2}\)|_\d{1,2}|[-_ ]+COPIA|[-_ ]+COPY)$/

function normalizarNombreFactura(filenameOrText) {
  let s = String(filenameOrText).toUpperCase().trim().replace(/\s+/g, ' ')
  s = s.replace(EXT_RE, '')
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(COPIA_RE, '').trim()
  }
  return s
}

const stripCeros = (d) => {
  const s = d.replace(/^0+/, '')
  return s === '' ? null : s
}

function familiaDeProveedor(proveedor) {
  const p = String(proveedor ?? '').toLowerCase()
  if (!p) return null
  if (p.includes('mecauto')) return 'mecauto'
  if (p.includes('fergo')) return 'fergo'
  if (p.includes('world') || p.includes('detailing') || p.includes('limpieza')) return 'world'
  if (p.includes('nagini') || p.includes('energia')) return 'nagini'
  if (p.includes('wallapop')) return 'wallapop'
  if (p.includes('enterprise')) return 'enterprise'
  return null
}

function candidatos(n, familia) {
  const out = new Set()
  switch (familia) {
    case 'mecauto':
      for (const m of n.matchAll(/FC26[-_. ]?(\d{1,4})(?!\d)/g)) {
        const d = stripCeros(m[1])
        if (d) out.add(`FC26-${d}`)
      }
      break
    case 'fergo':
      for (const m of n.matchAll(/(?<![A-Z0-9])(F260\d{2,4})(?!\d)/g)) out.add(m[1])
      break
    case 'world':
      for (const m of n.matchAll(/(?<![A-Z0-9])26\/(\d{1,3})(?!\d)/g)) {
        const d = stripCeros(m[1])
        if (d) out.add(`26/${d}`)
      }
      for (const m of n.matchAll(/LIMPIEZA[-_. ]?26[-_. ](\d{1,3})(?!\d)(?![-_.]\d)/g)) {
        const d = stripCeros(m[1])
        if (d) out.add(`26/${d}`)
      }
      break
    case 'nagini':
      for (const m of n.matchAll(/ENERGIA[-_. ]?(\d{1,6})(?!\d)/g)) out.add(`ENERGIA-${m[1]}`)
      break
    case 'wallapop':
      for (const m of n.matchAll(/(?<![A-Z0-9])(FVM-?\d[\dA-Z-]{3,})(?![A-Z0-9])/g)) {
        out.add(m[1].replace(/-/g, ''))
      }
      break
    case 'enterprise':
      for (const m of n.matchAll(/(?<![A-Z0-9])(E0\d{6,})(?!\d)/g)) out.add(m[1])
      break
  }
  return [...out]
}

function candidatosWorldDash(n) {
  const out = new Set()
  for (const m of n.matchAll(/(?<![A-Z0-9])26[-_.](\d{1,3})(?!\d)(?![-_.]\d)/g)) {
    const d = stripCeros(m[1])
    if (d) out.add(`26/${d}`)
  }
  return [...out]
}

const TODAS = ['mecauto', 'fergo', 'world', 'nagini', 'wallapop', 'enterprise']

function extraerNumeroCanonico(filenameOrText, proveedor) {
  const n = normalizarNombreFactura(filenameOrText)
  if (!n) return null
  const familia = familiaDeProveedor(proveedor)
  const familias = familia ? [familia] : TODAS
  const encontrados = new Set()
  for (const f of familias) for (const c of candidatos(n, f)) encontrados.add(c)
  if (familia === 'world' && encontrados.size === 0) {
    for (const c of candidatosWorldDash(n)) encontrados.add(c)
  }
  if (encontrados.size !== 1) return null
  return [...encontrados][0]
}
// ───────────────────────────── fin lógica duplicada ─────────────────────────

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Modo APPLY: se escriben los UPDATE.' : 'Modo DRY-RUN (default): no se escribe nada. Usá --apply para escribir.')

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, // regla del proyecto: 1 conexión
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  try {
    const { rows } = await pool.query(
      `SELECT id, vehiculo_id, matricula, tipo, numero_factura, proveedor, importe, numero_canonico
         FROM gasto_facturas ORDER BY id`
    )
    console.log(`gasto_facturas: ${rows.length} filas`)

    let conNumero = 0
    let actualizadas = 0
    const grupos = new Map() // (tipo|canonico|vehiculo_id) -> filas

    for (const r of rows) {
      // proveedor real si lo hay; si no, el tipo orienta la familia de patrones
      const canonico = extraerNumeroCanonico(r.numero_factura, r.proveedor || r.tipo)
      if (canonico) {
        conNumero++
        const k = `${r.tipo}|${canonico}|${r.vehiculo_id}`
        if (!grupos.has(k)) grupos.set(k, [])
        grupos.get(k).push(r)
      }
      if ((canonico ?? null) !== (r.numero_canonico ?? null)) {
        actualizadas++
        if (apply) {
          await pool.query(`UPDATE gasto_facturas SET numero_canonico = $1, updated_at = NOW() WHERE id = $2`, [
            canonico,
            r.id,
          ])
        } else {
          console.log(`  [dry-run] id=${r.id} ${r.tipo} "${r.numero_factura}" → ${canonico ?? 'NULL'}`)
        }
      }
    }

    console.log(`\ncon nº canónico: ${conNumero}/${rows.length}; ${apply ? 'actualizadas' : 'a actualizar'}: ${actualizadas}`)

    console.log('\n=== Grupos duplicados (tipo, numero_canonico, vehiculo_id) count>1 — candidatos a limpieza (NO se borra nada) ===')
    let nDup = 0
    for (const [k, filas] of grupos) {
      if (filas.length < 2) continue
      nDup++
      const [tipo, canonico, vid] = k.split('|')
      const total = filas.reduce((a, f) => a + Number(f.importe), 0)
      console.log(`\n${tipo} ${canonico} vehiculo_id=${vid} (${filas.length} filas, suma ${total.toFixed(2)} €):`)
      for (const f of filas) {
        console.log(`   id=${f.id} importe=${f.importe} matricula=${f.matricula} archivo="${f.numero_factura}"`)
      }
    }
    console.log(nDup === 0 ? '(ninguno)' : `\nTotal grupos duplicados: ${nDup}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
