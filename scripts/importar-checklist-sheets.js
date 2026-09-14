/* eslint-disable @typescript-eslint/no-require-imports */
// Importación única de la checklist y los datos de compra desde las hojas
// (COMPRAS/Compras, COMPRAS/R, COMPRAS/Deposito, Ventas/Expo, Ventas/Deposito,
// Ventas/R) hacia la base: sólo rellena huecos de la tabla Vehiculo y crea
// vehiculo_pasos (fuente 'import'). Nunca escribe en las hojas.
//
// Uso:  node scripts/importar-checklist-sheets.js                → dry-run (ROLLBACK)
//       node scripts/importar-checklist-sheets.js --apply        → aplica (COMMIT)
//       --sobrescribir-checklist  → pisa checklist/2da llave/pasos no vacíos en la base
//       --solo=VENTAS/Expo        → sólo esa pestaña
const path = require('path')
const { normalizarReferencia } = require('./lib/normalizacion')
const { interpretarFechaCorta } = require('./lib/fechaCorta')

const REPO_ROOT = path.resolve(__dirname, '..')

const IDS = {
  COMPRAS: '1asyKq66_4_GUwkYQdgjSIOLR5wY3ur06ebgleFFWiW0',
  VENTAS: '1RwnqBYlPMXj2rUJ3XqegrSQ-kM5RIJG61uGALy-pEH8',
}

// Orden = prioridad: Ventas primero, COMPRAS sólo rellena huecos.
const PESTANAS = [
  { hoja: 'VENTAS', pestana: 'Expo', tipo: 'C' },
  { hoja: 'VENTAS', pestana: 'Deposito', tipo: 'D' },
  { hoja: 'VENTAS', pestana: 'R', tipo: 'R' },
  { hoja: 'COMPRAS', pestana: 'Compras', tipo: 'C' },
  { hoja: 'COMPRAS', pestana: 'R', tipo: 'R' },
  { hoja: 'COMPRAS', pestana: 'Deposito', tipo: 'D' },
]

const CHECKLIST = {
  CARPETA: 'carpeta',
  MASTER: 'master',
  HOJASA: 'hojasA',
  DOCU: 'documentacion',
  ITV: 'itv',
  SEGURO: 'seguro',
  '2DALLAVE': 'segundaLlave',
}
const PASOS = {
  REVIINIC: 'REVI_INIC',
  MECAUTO: 'MECAUTO',
  REVIPINTURA: 'REVI_PINTURA',
  PINTURA: 'PINTURA',
  LIMPIEZA: 'LIMPIEZA',
  FOTOS: 'FOTOS',
  PUBLICADO: 'PUBLICADO',
}
const TEXTO_COMPRA = {
  PROVEEDOR: 'proveedor',
  ABONADO: 'abonado',
  COMPROBANTE: 'comprobante',
  PORTESOLICITADO: 'porteSolicitado',
  RECIBIDO: 'recibido',
}
const NUMERO_COMPRA = { MONTO: 'precioCompra', PORTECOMI: 'gastosTransporte' }
const FECHA_MATRICULACION = ['FMATR', 'FECHAMATRI', 'FECHAMATR', 'FECHAMATRIC']
const CAMPOS_SOBRESCRIBIBLES = new Set(Object.values(CHECKLIST))

const claveHeader = (h) =>
  String(h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

const vacio = (v) => v == null || String(v).trim() === ''

/** "8.100" → 8100, "78.364" → 78364, "1.234,5" → 1234.5, "NAVE" → null. */
function parseNumero(v) {
  const s = String(v ?? '')
    .trim()
    .replace(/[€\s]/g, '')
  if (!s) return null
  let n
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    n = Number(s.replace(/\./g, '').replace(',', '.'))
  } else if (/^-?\d+(,\d+)?$/.test(s)) {
    n = Number(s.replace(',', '.'))
  } else if (/^-?\d+\.\d+$/.test(s)) {
    n = Number(s)
  } else {
    return null
  }
  return Number.isFinite(n) ? n : null
}

function anioReferencia(vehiculo) {
  for (const f of [vehiculo.fechaCompra, vehiculo.createdAt]) {
    if (!f) continue
    const d = f instanceof Date ? f : new Date(f)
    if (!Number.isNaN(d.getTime())) return d.getUTCFullYear()
  }
  return new Date().getUTCFullYear()
}

/**
 * Qué escribir para un vehículo a partir de una fila de la hoja. Pura.
 * @param vehiculo fila de la base (con .pasos = {PASO: {texto}} y .setEnRun = Set)
 * @param fila objeto claveHeader → valor de celda
 * @param ctx { hoja, pestana, tipo }
 * @param opts { sobrescribir }
 */
function planFila(vehiculo, fila, ctx, opts = {}) {
  const sobrescribir = !!opts.sobrescribir
  const setEnRun = vehiculo.setEnRun || new Set()
  const pasosDb = vehiculo.pasos || {}
  const anioRef = anioReferencia(vehiculo)
  const updates = {}
  const pasos = []
  const skipped = {
    noVacio: [],
    vendidoEnChecklist: 0,
    montoNoNumerico: [],
    fechasNoInterpretadas: [],
  }
  let depositoPrecioVenta = null

  const puedeEscribir = (campo) => {
    if (setEnRun.has(campo)) return false
    if (vacio(vehiculo[campo])) return true
    if (sobrescribir && CAMPOS_SOBRESCRIBIBLES.has(campo)) return true
    skipped.noVacio.push(campo)
    return false
  }
  const setTexto = (campo, valor) => {
    const v = String(valor).trim()
    if (v.toUpperCase() === 'VENDIDO' && CAMPOS_SOBRESCRIBIBLES.has(campo)) {
      skipped.vendidoEnChecklist++
      return
    }
    if (puedeEscribir(campo)) updates[campo] = v
  }
  const setFecha = (campo, valor) => {
    if (!puedeEscribir(campo)) return
    const iso = interpretarFechaCorta(String(valor), anioRef)
    if (iso) updates[campo] = iso
    else skipped.fechasNoInterpretadas.push({ campo, texto: String(valor) })
  }
  const setNumero = (campo, valor) => {
    const n = parseNumero(valor)
    if (n == null) {
      skipped.montoNoNumerico.push({ campo, texto: String(valor) })
      return
    }
    if (puedeEscribir(campo)) updates[campo] = n
  }

  const esCompras = ctx.hoja === 'COMPRAS'
  for (const [clave, valor] of Object.entries(fila)) {
    if (vacio(valor)) continue
    if (CHECKLIST[clave]) {
      setTexto(CHECKLIST[clave], valor)
    } else if (PASOS[clave]) {
      const paso = PASOS[clave]
      const texto = String(valor).trim()
      if (texto.toUpperCase() === 'VENDIDO') {
        skipped.vendidoEnChecklist++
        continue
      }
      if (setEnRun.has(`paso:${paso}`)) continue
      const existente = pasosDb[paso]
      if (existente && !vacio(existente.texto) && !sobrescribir) {
        skipped.noVacio.push(`paso:${paso}`)
        continue
      }
      const fecha = interpretarFechaCorta(texto, anioRef)
      // SI/NO/"no fue" no son fechas: sólo se reporta lo que parece una.
      if (!fecha && /\d/.test(texto))
        skipped.fechasNoInterpretadas.push({ campo: paso, texto })
      pasos.push({ paso, texto, fecha })
    } else if (FECHA_MATRICULACION.includes(clave)) {
      setFecha('fechaMatriculacion', valor)
    } else if (esCompras && ctx.pestana === 'Compras' && TEXTO_COMPRA[clave]) {
      setTexto(TEXTO_COMPRA[clave], valor)
    } else if (
      esCompras &&
      ctx.pestana === 'Compras' &&
      clave === 'FECHACOMPRA'
    ) {
      setFecha('fechaCompra', valor)
    } else if (
      esCompras &&
      ctx.pestana !== 'Deposito' &&
      NUMERO_COMPRA[clave]
    ) {
      setNumero(NUMERO_COMPRA[clave], valor)
    } else if (esCompras && ctx.pestana === 'R' && clave === 'FECHA') {
      setFecha('fechaMatriculacion', valor)
    } else if (
      esCompras &&
      ctx.pestana === 'Deposito' &&
      clave === 'MONTOCLIENTE'
    ) {
      const n = parseNumero(valor)
      if (n == null)
        skipped.montoNoNumerico.push({
          campo: 'precio_venta',
          texto: String(valor),
        })
      else depositoPrecioVenta = n
    }
  }

  if (
    updates.recibido &&
    vacio(vehiculo.recibidoFecha) &&
    !setEnRun.has('recibidoFecha')
  ) {
    const iso = interpretarFechaCorta(updates.recibido, anioRef)
    if (iso) updates.recibidoFecha = iso
    else
      skipped.fechasNoInterpretadas.push({
        campo: 'recibido',
        texto: updates.recibido,
      })
  }

  return { updates, pasos, skipped, depositoPrecioVenta }
}

/** Aplica el plan al objeto en memoria para que las pestañas siguientes lo vean como no vacío. */
function acumular(vehiculo, plan) {
  vehiculo.setEnRun = vehiculo.setEnRun || new Set()
  vehiculo.pasos = vehiculo.pasos || {}
  for (const [k, v] of Object.entries(plan.updates)) {
    vehiculo[k] = v
    vehiculo.setEnRun.add(k)
  }
  for (const p of plan.pasos) {
    vehiculo.pasos[p.paso] = {
      texto: p.texto,
      fecha: p.fecha,
      fuente: 'import',
    }
    vehiculo.setEnRun.add(`paso:${p.paso}`)
  }
}

function filaAObjeto(cabecera, fila) {
  const obj = {}
  cabecera.forEach((h, i) => {
    const k = claveHeader(h)
    if (k && !(k in obj)) obj[k] = fila[i] ?? ''
  })
  return obj
}

// ---------------------------------------------------------------------------

const SQL_PASO = `
  INSERT INTO vehiculo_pasos (vehiculo_id, paso, texto, fecha, fuente)
  VALUES ($1, $2, $3, $4::date, 'import')
  ON CONFLICT (vehiculo_id, paso) DO UPDATE SET
    texto = CASE WHEN vehiculo_pasos.texto IS NULL OR vehiculo_pasos.texto = '' OR $5::bool
                 THEN EXCLUDED.texto ELSE vehiculo_pasos.texto END,
    fecha = CASE WHEN $5::bool THEN EXCLUDED.fecha
                 ELSE COALESCE(vehiculo_pasos.fecha, EXCLUDED.fecha) END,
    fuente = 'import',
    updated_at = NOW()`

async function leerBase(client) {
  const { rows } = await client.query(
    `SELECT id, referencia, tipo, "fechaCompra", "createdAt", "fechaMatriculacion",
            "precioCompra", "gastosTransporte", "segundaLlave", carpeta, master, "hojasA",
            documentacion, itv, seguro, proveedor, abonado, comprobante, "porteSolicitado",
            recibido, "recibidoFecha"
       FROM "Vehiculo"`
  )
  const porRef = new Map()
  for (const v of rows) {
    v.pasos = {}
    v.setEnRun = new Set()
    const c = normalizarReferencia(v.referencia, v.tipo)
    if (c && !porRef.has(c)) porRef.set(c, v)
  }
  const pasos = await client.query(
    'SELECT vehiculo_id, paso, texto, fecha, fuente FROM vehiculo_pasos'
  )
  const porId = new Map(rows.map((v) => [v.id, v]))
  for (const p of pasos.rows) {
    const v = porId.get(p.vehiculo_id)
    if (v) v.pasos[p.paso] = p
  }
  const dep = await client.query(
    'SELECT vehiculo_id, precio_venta FROM depositos'
  )
  const depositos = new Map(dep.rows.map((d) => [d.vehiculo_id, d]))
  return { porRef, depositos }
}

async function main() {
  require('dotenv').config({
    path: path.join(REPO_ROOT, '.env.local'),
    quiet: true,
  })
  const { google } = require('googleapis')
  const { Pool } = require('pg')

  const args = process.argv.slice(2)
  const APPLY = args.includes('--apply')
  const SOBRESCRIBIR = args.includes('--sobrescribir-checklist')
  const solo = (args.find((a) => a.startsWith('--solo=')) || '').slice(7)

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const client = await pool.connect()

  const totales = {
    vehiculosTocados: new Set(),
    campos: {},
    pasos: 0,
    depositos: 0,
  }
  try {
    await client.query('BEGIN')
    const { porRef, depositos } = await leerBase(client)

    for (const p of PESTANAS) {
      const etiqueta = `${p.hoja}/${p.pestana}`
      if (solo && solo.toUpperCase() !== etiqueta.toUpperCase()) continue
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId: IDS[p.hoja],
        range: `'${p.pestana}'!A1:AZ`,
        valueRenderOption: 'FORMATTED_VALUE',
      })
      const filas = r.data.values || []
      const cabecera = filas[0] || []
      const rep = {
        filas: 0,
        conVehiculo: 0,
        sinVehiculo: [],
        tipoDistinto: [],
        camposRellenados: {},
        pasos: 0,
        pasosConFecha: 0,
        vendidoEnChecklist: 0,
        noVacio: 0,
        montoNoNumerico: [],
        fechasNoInterpretadas: [],
      }
      for (const fila of filas.slice(1)) {
        const refCelda = fila[0]
        if (vacio(refCelda)) continue
        rep.filas++
        const ref =
          normalizarReferencia(refCelda, p.tipo) ??
          `#${String(refCelda).trim()}`
        const v = porRef.get(ref)
        if (!v) {
          rep.sinVehiculo.push(ref)
          continue
        }
        rep.conVehiculo++
        const tipoV = normalizarReferencia(v.referencia, v.tipo)
        if (tipoV !== ref) rep.tipoDistinto.push(`${ref}→${tipoV}`)

        const plan = planFila(v, filaAObjeto(cabecera, fila), p, {
          sobrescribir: SOBRESCRIBIR,
        })
        rep.noVacio += plan.skipped.noVacio.length
        rep.vendidoEnChecklist += plan.skipped.vendidoEnChecklist
        for (const m of plan.skipped.montoNoNumerico)
          rep.montoNoNumerico.push({ ref, ...m })
        for (const f of plan.skipped.fechasNoInterpretadas)
          rep.fechasNoInterpretadas.push({ ref, ...f })

        const campos = Object.keys(plan.updates)
        if (campos.length) {
          const sets = campos.map((c, i) => `"${c}" = $${i + 2}`)
          await client.query(
            `UPDATE "Vehiculo" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $1`,
            [v.id, ...campos.map((c) => plan.updates[c])]
          )
          for (const c of campos) {
            rep.camposRellenados[c] = (rep.camposRellenados[c] || 0) + 1
            totales.campos[c] = (totales.campos[c] || 0) + 1
          }
          totales.vehiculosTocados.add(v.id)
        }
        for (const paso of plan.pasos) {
          await client.query(SQL_PASO, [
            v.id,
            paso.paso,
            paso.texto,
            paso.fecha,
            SOBRESCRIBIR,
          ])
          rep.pasos++
          if (paso.fecha) rep.pasosConFecha++
          totales.pasos++
          totales.vehiculosTocados.add(v.id)
        }
        if (plan.depositoPrecioVenta != null) {
          const d = depositos.get(v.id)
          if (d && d.precio_venta == null) {
            await client.query(
              'UPDATE depositos SET precio_venta = $2 WHERE vehiculo_id = $1 AND precio_venta IS NULL',
              [v.id, plan.depositoPrecioVenta]
            )
            d.precio_venta = plan.depositoPrecioVenta
            rep.camposRellenados.precio_venta =
              (rep.camposRellenados.precio_venta || 0) + 1
            totales.depositos++
          }
        }
        acumular(v, plan)
      }
      imprimirPestana(etiqueta, rep)
    }

    console.log('\n== TOTAL')
    console.log(`  vehículos tocados: ${totales.vehiculosTocados.size}`)
    console.log(`  campos Vehiculo: ${JSON.stringify(totales.campos)}`)
    console.log(
      `  pasos upsert: ${totales.pasos} | depositos.precio_venta: ${totales.depositos}`
    )

    if (APPLY) {
      await client.query('COMMIT')
      console.log('APLICADO')
    } else {
      await client.query('ROLLBACK')
      console.log('DRY-RUN: no se escribió nada (ROLLBACK)')
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('ERROR:', err.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

const CAP = 40
function imprimirPestana(etiqueta, rep) {
  console.log(
    `\n== ${etiqueta}: ${rep.filas} filas, ${rep.conVehiculo} con vehículo, ${rep.sinVehiculo.length} sin vehículo`
  )
  if (rep.sinVehiculo.length)
    console.log(`  sin vehículo: ${rep.sinVehiculo.join(' ')}`)
  if (rep.tipoDistinto.length)
    console.log(`  tipo distinto: ${rep.tipoDistinto.join(' ')}`)
  console.log(`  campos rellenados: ${JSON.stringify(rep.camposRellenados)}`)
  console.log(
    `  pasos: ${rep.pasos} (${rep.pasosConFecha} con fecha) | ya no vacíos (saltados): ${rep.noVacio} | VENDIDO en checklist: ${rep.vendidoEnChecklist}`
  )
  if (rep.montoNoNumerico.length) {
    console.log(
      `  montos no numéricos (${rep.montoNoNumerico.length}): ${rep.montoNoNumerico
        .slice(0, CAP)
        .map((m) => `${m.ref} ${m.campo}="${m.texto}"`)
        .join(' | ')}`
    )
  }
  if (rep.fechasNoInterpretadas.length) {
    console.log(
      `  fechas no interpretadas (${rep.fechasNoInterpretadas.length}): ${rep.fechasNoInterpretadas
        .slice(0, CAP)
        .map((f) => `${f.ref} ${f.campo}="${f.texto}"`)
        .join(' | ')}`
    )
  }
}

module.exports = { planFila, acumular, filaAObjeto, parseNumero, claveHeader }

if (require.main === module) main()
