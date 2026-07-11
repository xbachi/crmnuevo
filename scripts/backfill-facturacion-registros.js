/**
 * Backfill de la cadena de integridad "Verifactu-lite" (facturacion_registros).
 *
 * Genera registros 'alta' para las facturas ISSUED/IMPORTED existentes, en
 * orden cronológico (invoice_date, id), para inicializar la cadena con el
 * histórico. Continúa desde el último eslabón si la cadena ya tiene filas y
 * salta facturas que ya tienen su 'alta'.
 *
 * PREPARACIÓN para Verifactu — cadena de integridad interna, pendiente de
 * homologación. NO implementa envío a la AEAT ni supone cumplimiento legal.
 *
 * Uso:
 *   node scripts/backfill-facturacion-registros.js          (dry-run, no escribe)
 *   node scripts/backfill-facturacion-registros.js --apply  (inserta de verdad)
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require('pg')
const crypto = require('crypto')
require('dotenv').config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const NIF_EMISOR = process.env.EMPRESA_NIF || 'B75939868'

// Debe coincidir EXACTAMENTE con computeHash de src/lib/facturacionRegistro.ts:
// sha256(nif|numero_serie|fecha(YYYY-MM-DD)|tipo_registro|importe(2 dec)|hash_anterior||'')
function computeHash(campos, hashAnterior) {
  const payload = [
    campos.nifEmisor,
    campos.numeroSerie,
    campos.fechaExpedicion,
    campos.tipoRegistro,
    campos.importeTotal,
    hashAnterior ?? '',
  ].join('|')
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex')
}

// Formato URL de validación AEAT (pre-producción, pendiente de homologación).
function buildQrPayload(campos) {
  const [yyyy, mm, dd] = campos.fechaExpedicion.split('-')
  const params = new URLSearchParams({
    nif: campos.nifEmisor,
    numserie: campos.numeroSerie,
    fecha: `${dd}-${mm}-${yyyy}`,
    importe: campos.importeTotal,
  })
  return `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?${params.toString()}`
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Mismo lock que appendRegistro: nadie extiende la cadena mientras corremos.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('facturacion_registros'))`
    )

    const last = await client.query(
      `SELECT id, hash_actual FROM facturacion_registros ORDER BY id DESC LIMIT 1`
    )
    let prevHash = last.rows[0]?.hash_actual ?? null
    console.log(
      prevHash
        ? `Cadena existente: continúa desde el eslabón ${last.rows[0].id}`
        : 'Cadena vacía: se inicializa desde cero'
    )

    const { rows: invoices } = await client.query(
      `SELECT i.id, i.full_invoice_number, i.invoice_date::TEXT AS invoice_date,
              i.total_amount, i.status, i.invoice_type
         FROM invoices i
        WHERE i.status IN ('ISSUED', 'IMPORTED')
          AND NOT EXISTS (
                SELECT 1 FROM facturacion_registros r
                 WHERE r.numero_serie = i.full_invoice_number
                   AND r.tipo_registro = 'alta'
              )
        ORDER BY i.invoice_date ASC, i.id ASC`
    )
    console.log(`Facturas ISSUED/IMPORTED sin registro 'alta': ${invoices.length}\n`)

    let inserted = 0
    for (const inv of invoices) {
      const campos = {
        nifEmisor: NIF_EMISOR,
        numeroSerie: inv.full_invoice_number,
        fechaExpedicion: inv.invoice_date,
        tipoRegistro: 'alta',
        importeTotal: Number(inv.total_amount).toFixed(2),
      }
      const hashActual = computeHash(campos, prevHash)
      console.log(
        `${APPLY ? 'INSERT' : 'DRY-RUN'} alta ${campos.numeroSerie} ` +
          `(${campos.fechaExpedicion}, ${campos.importeTotal} €, ${inv.status}) ` +
          `hash ${hashActual.slice(0, 12)}…`
      )
      if (APPLY) {
        await client.query(
          `INSERT INTO facturacion_registros
             (invoice_id, tipo_registro, numero_serie, fecha_expedicion,
              nif_emisor, importe_total, hash_anterior, hash_actual,
              qr_payload, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            inv.id,
            campos.tipoRegistro,
            campos.numeroSerie,
            campos.fechaExpedicion,
            campos.nifEmisor,
            campos.importeTotal,
            prevHash,
            hashActual,
            buildQrPayload(campos),
            JSON.stringify({
              origen: 'backfill',
              status: inv.status,
              invoice_type: inv.invoice_type,
            }),
          ]
        )
        inserted++
      }
      prevHash = hashActual
    }

    if (APPLY) {
      await client.query('COMMIT')
      console.log(`\n✅ Backfill aplicado: ${inserted} registros insertados.`)
    } else {
      await client.query('ROLLBACK')
      console.log(
        `\nDry-run: ${invoices.length} registros a insertar. Ejecutá con --apply para escribir.`
      )
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('❌ Error en backfill:', err.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
