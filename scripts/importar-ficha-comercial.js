/* eslint-disable @typescript-eslint/no-require-imports */
// Importación única de la ficha comercial desde Base_Datos_Vehiculos_2025 /
// Datos hacia vehiculo_ficha_comercial (y huecos de "Vehiculo": precio de
// publicación, bastidor, fecha de matriculación). La hoja es hoy la fuente:
// una celda no vacía pisa el valor de la ficha; una vacía no toca nada.
// Nunca escribe en la hoja.
//
// Uso:  node scripts/importar-ficha-comercial.js             → dry-run (ROLLBACK)
//       node scripts/importar-ficha-comercial.js --apply     → aplica (COMMIT)
//       --precio-hoja  → pisa "precioPublicacion" aunque ya tenga valor
//                        (por defecto sólo rellena NULL/0 y reporta conflictos)
const path = require('path')
const {
  normalizarReferencia,
  normalizarMatricula,
} = require('./lib/normalizacion')
const { interpretarFechaCorta } = require('./lib/fechaCorta')

const REPO_ROOT = path.resolve(__dirname, '..')
const SPREADSHEET_ID = '1pm2KiO1vXy5Zn7OGe8wjOXhKzUub2QIG5Tjv4GDqEBI'
const PESTANA = 'Datos'

const claveHeader = (h) =>
  String(h ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

const vacio = (v) => v == null || String(v).trim() === ''

/** 12485 → 12485, "12.485 €" → 12485, "0,07" → 0.07, "SI" → null. */
function parseNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '')
    .trim()
    .replace(/[€%\s]/g, '')
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

const REGIMEN = { IVA21: 'IVA21', REBU: 'REBU' }
const TARIFA = {
  NORMAL: 'NORMAL',
  ESPECIAL: 'ESPECIAL',
  SINDTO: 'SIN_DTO',
  CONSULTANOS: 'CONSULTAR',
  CONSULTAR: 'CONSULTAR',
}
const CAJA = {
  MANUAL: 'Manual',
  AUTOMATICO: 'Automático',
  AUTOMATICA: 'Automático',
}

/** "1/01/2020" | "10/2020" | Date → ISO o null. */
function parseFecha(v) {
  if (v instanceof Date)
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = /^(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`
  return interpretarFechaCorta(s, new Date().getFullYear())
}

/** Fila de Datos (objeto claveHeader → celda) → { ficha, vehiculo, errores, conflictoPrecio }. Pura. */
function planFilaFicha(v, fila, opts = {}) {
  const ficha = {}
  const vehiculo = {}
  const errores = []
  let conflictoPrecio = null
  const err = (campo, valor) => errores.push({ campo, valor: String(valor) })

  if (!vacio(fila.IVA)) {
    const k = claveHeader(fila.IVA)
    if (REGIMEN[k]) ficha.regimen = REGIMEN[k]
    else err('IVA', fila.IVA)
  }
  if (!vacio(fila.MODELO)) ficha.nombre_comercial = String(fila.MODELO).trim()
  if (!vacio(fila.URLIMAGEN)) ficha.url_imagen = String(fila.URLIMAGEN).trim()
  if (!vacio(fila.QR)) ficha.url_qr = String(fila.QR).trim()
  if (!vacio(fila.MANTENIMIENTOS))
    ficha.mantenimientos = String(fila.MANTENIMIENTOS).trim()
  if (!vacio(fila.TARIFAFINANCIACION)) {
    const k = claveHeader(fila.TARIFAFINANCIACION)
    if (TARIFA[k]) ficha.tarifa_financiacion = TARIFA[k]
    else err('TARIFA FINANCIACION', fila.TARIFAFINANCIACION)
  }
  if (!vacio(fila.GARANTIA)) {
    const k = claveHeader(fila.GARANTIA)
    if (k === 'SI') ficha.garantia = true
    else if (k === 'NO') ficha.garantia = false
    else err('GARANTIA', fila.GARANTIA)
  }
  const numero = (col, campo, ok) => {
    if (vacio(fila[col])) return
    const n = parseNumero(fila[col])
    if (n == null || !ok(n)) err(col, fila[col])
    else ficha[campo] = n
  }
  numero('GP', 'gp', (n) => n >= 0 && n <= 2000)
  numero('DTO', 'pct_dto', (n) => n >= 0 && n <= 0.2)
  numero(
    'MESESGARANTIAFABRICA',
    'meses_garantia_fabrica',
    (n) => Number.isInteger(n) && n >= 0
  )
  numero('MOTORCV', 'motor_cv', (n) => Number.isInteger(n) && n >= 0)
  numero('CUBICAJE', 'cubicaje', (n) => Number.isInteger(n) && n >= 0)
  if (!vacio(fila.CAJA)) {
    const k = claveHeader(fila.CAJA)
    if (CAJA[k]) ficha.caja = CAJA[k]
    else ficha.caja = String(fila.CAJA).trim()
  }
  if (!vacio(fila.COMBUSTIBLE))
    ficha.combustible = String(fila.COMBUSTIBLE).trim()

  if (!vacio(fila.PRECIOCONTADO)) {
    const n = parseNumero(fila.PRECIOCONTADO)
    if (n == null || n <= 0) err('PRECIO CONTADO', fila.PRECIOCONTADO)
    else {
      const actual = Number(v.precioPublicacion) || 0
      if (!actual || opts.precioHoja) vehiculo.precioPublicacion = n
      else if (Math.abs(actual - n) >= 0.01)
        conflictoPrecio = { hoja: n, crm: actual }
    }
  }
  if (!vacio(fila.BASTIDOR) && vacio(v.bastidor))
    vehiculo.bastidor = String(fila.BASTIDOR).trim().toUpperCase()
  if (!vacio(fila.FECHAMATRICULACION) && vacio(v.fechaMatriculacion)) {
    const f = parseFecha(fila.FECHAMATRICULACION)
    if (f) vehiculo.fechaMatriculacion = f
    else err('FECHA MATRICULACION', fila.FECHAMATRICULACION)
  }
  return { ficha, vehiculo, errores, conflictoPrecio }
}

function filaAObjeto(cabecera, fila) {
  const o = {}
  cabecera.forEach((h, i) => {
    const k = claveHeader(h)
    if (k && !(k in o)) o[k] = fila[i]
  })
  return o
}

/** Filas de datos hasta la primera con A vacía o plantilla (BASE / COPIA SEGURIDAD). */
function recortar(filas) {
  const out = []
  for (const f of filas) {
    const a = claveHeader(f && f[0])
    if (!a || a === 'BASE' || a === 'COPIASEGURIDAD') break
    out.push(f)
  }
  return out
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
  const PRECIO_HOJA = args.includes('--precio-hoja')

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

  const rep = {
    filas: 0,
    porReferencia: 0,
    porMatricula: 0,
    sinVehiculo: [],
    fichasNuevas: 0,
    fichasActualizadas: 0,
    camposFicha: {},
    camposVehiculo: {},
    conflictosPrecio: [],
    errores: [],
  }

  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${PESTANA}'!A1:AZ`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    })
    const todas = r.data.values || []
    const cabecera = todas[0] || []
    const filas = recortar(todas.slice(1))

    const veh = await client.query(
      `SELECT id, referencia, tipo, estado, matricula_norm, bastidor,
              "fechaMatriculacion", "precioPublicacion"
         FROM "Vehiculo"`
    )
    const porRef = new Map()
    const porMat = new Map()
    for (const v of veh.rows) {
      const ref = normalizarReferencia(v.referencia, v.tipo)
      if (ref && !porRef.has(ref)) porRef.set(ref, v)
      if (v.matricula_norm && !porMat.has(v.matricula_norm))
        porMat.set(v.matricula_norm, v)
    }
    const fichas = await client.query(
      'SELECT vehiculo_id FROM vehiculo_ficha_comercial'
    )
    const conFicha = new Set(fichas.rows.map((f) => f.vehiculo_id))

    await client.query('BEGIN')
    for (const fila of filas) {
      rep.filas++
      const refCelda = String(fila[0]).trim()
      const ref = normalizarReferencia(refCelda, null) ?? `#${refCelda}`
      const o = filaAObjeto(cabecera, fila)
      let v = porRef.get(ref)
      let via = 'referencia'
      if (!v && !vacio(o.MATRICULA)) {
        v = porMat.get(normalizarMatricula(o.MATRICULA))
        via = 'matricula'
      }
      if (!v) {
        rep.sinVehiculo.push({
          ref: refCelda,
          matricula: String(o.MATRICULA ?? ''),
          modelo: String(o.MODELO ?? '').slice(0, 40),
          tipoR: /^R/i.test(refCelda),
        })
        continue
      }
      if (via === 'referencia') rep.porReferencia++
      else rep.porMatricula++

      const plan = planFilaFicha(v, o, { precioHoja: PRECIO_HOJA })
      for (const e of plan.errores) rep.errores.push({ ref: refCelda, ...e })
      if (plan.conflictoPrecio)
        rep.conflictosPrecio.push({ ref: refCelda, ...plan.conflictoPrecio })

      const claves = Object.keys(plan.ficha)
      if (claves.length) {
        const cols = claves.map((k) => `"${k}"`)
        const marcas = claves.map((_, i) => `$${i + 2}`)
        const sets = claves.map((k) => `"${k}" = EXCLUDED."${k}"`)
        await client.query(
          `INSERT INTO vehiculo_ficha_comercial (vehiculo_id, ${cols.join(', ')})
           VALUES ($1, ${marcas.join(', ')})
           ON CONFLICT (vehiculo_id) DO UPDATE SET ${sets.join(', ')}, updated_at = NOW()`,
          [v.id, ...claves.map((k) => plan.ficha[k])]
        )
        if (conFicha.has(v.id)) rep.fichasActualizadas++
        else {
          rep.fichasNuevas++
          conFicha.add(v.id)
        }
        for (const k of claves)
          rep.camposFicha[k] = (rep.camposFicha[k] || 0) + 1
      }
      const cv = Object.keys(plan.vehiculo)
      if (cv.length) {
        const sets = cv.map((c, i) => `"${c}" = $${i + 2}`)
        await client.query(
          `UPDATE "Vehiculo" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $1`,
          [v.id, ...cv.map((c) => plan.vehiculo[c])]
        )
        for (const k of cv)
          rep.camposVehiculo[k] = (rep.camposVehiculo[k] || 0) + 1
      }
    }
    if (APPLY) {
      await client.query('COMMIT')
    } else {
      await client.query('ROLLBACK')
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ya cerrada */
    }
    throw e
  } finally {
    client.release()
    await pool.end()
  }

  console.log(`\n=== Base_Datos/${PESTANA} → ficha comercial ===`)
  console.log(
    `filas: ${rep.filas} | con vehículo: ${rep.porReferencia} por referencia + ${rep.porMatricula} por matrícula | sin vehículo: ${rep.sinVehiculo.length}`
  )
  console.log(
    `fichas nuevas: ${rep.fichasNuevas} | actualizadas: ${rep.fichasActualizadas}`
  )
  console.log('campos ficha:', JSON.stringify(rep.camposFicha))
  console.log('campos Vehiculo:', JSON.stringify(rep.camposVehiculo))
  const sinR = rep.sinVehiculo.filter((s) => !s.tipoR)
  const conR = rep.sinVehiculo.filter((s) => s.tipoR)
  if (sinR.length) {
    console.log(`\nfilas sin vehículo (${sinR.length}):`)
    for (const s of sinR)
      console.log(`  ${s.ref} | ${s.matricula} | ${s.modelo}`)
  }
  if (conR.length)
    console.log(
      `filas tipo R (fuera de alcance): ${conR.map((s) => s.ref).join(', ')}`
    )
  if (rep.conflictosPrecio.length) {
    console.log(
      `\nconflictos de precio (no pisados; usa --precio-hoja): ${rep.conflictosPrecio.length}`
    )
    for (const c of rep.conflictosPrecio)
      console.log(`  ${c.ref}: hoja ${c.hoja} vs CRM ${c.crm}`)
  }
  if (rep.errores.length) {
    console.log(`\nvalores no interpretables (${rep.errores.length}):`)
    for (const e of rep.errores)
      console.log(`  ${e.ref} ${e.campo}: ${JSON.stringify(e.valor)}`)
  }
  console.log(
    `\n${APPLY ? 'APLICADO (COMMIT)' : 'DRY-RUN (ROLLBACK): nada escrito'}`
  )
}

if (require.main === module) {
  main().catch((e) => {
    console.error('ERROR', e.message)
    process.exit(1)
  })
}

module.exports = { planFilaFicha, parseNumero, parseFecha, recortar }
