/* eslint-disable @typescript-eslint/no-require-imports */
// Reconcilia referencias y matrículas entre las hojas de Sevencars (Compras,
// Ventas, Base_Datos) y la tabla Vehiculo. Sólo lectura por defecto; escribe
// un informe JSON y, con --fix-formato --apply, reescribe únicamente las
// celdas de referencia/matrícula que cambian de formato (nunca filas ni otras
// columnas/pestañas).
//
// Uso:  node scripts/reconciliar-sheets.js                      → informe
//       node scripts/reconciliar-sheets.js --fix-formato        → + lista de celdas a corregir
//       node scripts/reconciliar-sheets.js --fix-formato --apply → aplica esas celdas
//       RECONCILIACION_OUT=/ruta/informe.json  (por defecto ./reconciliacion-sheets.json)
const path = require('path')
const fs = require('fs')
const { google } = require('googleapis')
const { Pool } = require('pg')
const {
  normalizarReferencia,
  extraerMatriculaEntrada,
  validarMatricula,
} = require('./lib/normalizacion')

const REPO_ROOT = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(REPO_ROOT, '.env.local') })

const args = process.argv.slice(2)
const FIX_FORMATO = args.includes('--fix-formato')
const APPLY = args.includes('--apply')
const MAX_LINEAS = 15

const HOJAS = [
  {
    nombre: 'COMPRAS',
    id: '1asyKq66_4_GUwkYQdgjSIOLR5wY3ur06ebgleFFWiW0',
    pestanas: ['Compras', 'R', 'Deposito', 'Inversor'],
  },
  {
    nombre: 'VENTAS',
    id: '1RwnqBYlPMXj2rUJ3XqegrSQ-kM5RIJG61uGALy-pEH8',
    pestanas: ['Expo', 'Deposito', 'R', 'Inversor'],
  },
  {
    nombre: 'BASE_DATOS',
    id: '1pm2KiO1vXy5Zn7OGe8wjOXhKzUub2QIG5Tjv4GDqEBI',
    pestanas: null, // primera pestaña, la que sea
  },
]

// Letra de tipo que impone la pestaña; undefined = C/I (ambos válidos).
function tipoPestana(titulo) {
  const t = sinAcentos(titulo)
  if (t === 'DEPOSITO') return 'D'
  if (t === 'R') return 'R'
  return undefined
}

function sinAcentos(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function letraColumna(idx) {
  let n = idx + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function columnas(cabecera) {
  const h = cabecera.map(sinAcentos)
  const busca = (pred) => h.findIndex(pred)
  let ref = busca((c) => c.includes('REFERENCIA'))
  if (ref < 0) ref = busca((c) => c === 'REF')
  if (ref < 0) ref = busca((c) => c.includes('REF'))
  if (ref < 0) ref = 0 // cabeceras raras ('R', 'SI', '751'): col A
  return {
    ref,
    mat: busca((c) => c.includes('MATRICULA')),
    marca: busca((c) => c === 'MARCA'),
    modelo: busca((c) => c === 'MODELO'),
    bastidor: busca((c) => c.includes('BASTIDOR')),
    kms: busca((c) => c === 'KMS' || c === 'KM'),
  }
}

function getAuth() {
  const scopes = APPLY
    ? ['https://www.googleapis.com/auth/spreadsheets']
    : ['https://www.googleapis.com/auth/spreadsheets.readonly']
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes,
  })
}

async function titulosPestanas(sheets, spreadsheetId) {
  const r = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  })
  return (r.data.sheets || []).map((s) => s.properties.title)
}

async function leerPestana(sheets, spreadsheetId, titulo) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${titulo}'!A1:Z`,
    valueRenderOption: 'FORMATTED_VALUE',
  })
  return r.data.values || []
}

const up = (x) =>
  String(x ?? '')
    .trim()
    .toUpperCase()
const kmsNum = (x) => {
  const n = parseInt(String(x ?? '').replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? null : n
}

async function leerBase(pool) {
  const { rows } = await pool.query(
    `SELECT referencia, matricula, matricula_norm, tipo, marca, modelo, bastidor, kms
       FROM "Vehiculo"`
  )
  const porRef = new Map()
  const porMat = new Map()
  for (const v of rows) {
    const c = normalizarReferencia(v.referencia, v.tipo)
    if (c && !porRef.has(c)) porRef.set(c, v)
    if (v.matricula_norm && !porMat.has(v.matricula_norm)) {
      porMat.set(v.matricula_norm, v)
    }
  }
  return { rows, porRef, porMat }
}

function pestanaEsperada(v) {
  const c = normalizarReferencia(v.referencia, v.tipo)
  const letra = c ? /^#([DR])-/.exec(c)?.[1] : undefined
  if (letra === 'D') return { compras: 'Deposito', ventas: 'Deposito' }
  if (letra === 'R') return { compras: 'R', ventas: 'R' }
  return { compras: 'Compras', ventas: 'Expo' }
}

async function main() {
  const informe = {
    generado: new Date().toISOString(),
    hojas: [],
    referenciasFueraDeFormato: [],
    referenciasNoInterpretables: [],
    matriculasFueraDeFormato: [],
    duplicadosEnPestana: [],
    enHojaNoEnBase: [],
    enBaseNoEnHoja: [],
    discrepancias: [],
    fixFormato: [],
  }

  const sheets = google.sheets({ version: 'v4', auth: getAuth() })
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

  try {
    const base = await leerBase(pool)
    // canónica → Set('HOJA/pestana') para detectar qué vehículos de la base no están en su pestaña
    const vistasEnHoja = new Map()

    for (const hoja of HOJAS) {
      const titulos = await titulosPestanas(sheets, hoja.id)
      const encontradas = []
      const faltantes = []
      let objetivo
      if (hoja.pestanas === null) {
        objetivo = titulos.slice(0, 1)
      } else {
        objetivo = []
        for (const p of hoja.pestanas) {
          const real = titulos.find((t) => sinAcentos(t) === sinAcentos(p))
          if (real) objetivo.push(real)
          else faltantes.push(p)
        }
      }
      for (const p of faltantes) {
        console.warn(`[${hoja.nombre}] pestaña '${p}' no existe: se omite`)
      }

      for (const titulo of objetivo) {
        const filas = await leerPestana(sheets, hoja.id, titulo)
        encontradas.push(titulo)
        if (filas.length === 0) continue
        const col = columnas(filas[0])
        const tipoP = hoja.pestanas === null ? undefined : tipoPestana(titulo)
        const vistas = new Map() // canónica → celdas

        for (let i = 1; i < filas.length; i++) {
          const fila = filas[i]
          const numFila = i + 1
          const refRaw = String(fila[col.ref] ?? '').trim()
          const matRaw = col.mat >= 0 ? String(fila[col.mat] ?? '').trim() : ''
          if (!refRaw && !matRaw) continue

          const celdaRef = `${letraColumna(col.ref)}${numFila}`
          const celdaMat =
            col.mat >= 0 ? `${letraColumna(col.mat)}${numFila}` : null
          const canon = normalizarReferencia(refRaw, tipoP)
          const matNorm = extraerMatriculaEntrada(matRaw)
          const val = validarMatricula(matNorm)
          const loc = { hoja: hoja.nombre, pestana: titulo }

          if (refRaw && !canon) {
            informe.referenciasNoInterpretables.push({
              ...loc,
              celda: celdaRef,
              valor: refRaw,
            })
          } else if (refRaw && refRaw !== canon) {
            informe.referenciasFueraDeFormato.push({
              ...loc,
              celda: celdaRef,
              valor: refRaw,
              canonica: canon,
            })
            if (FIX_FORMATO) {
              informe.fixFormato.push({
                spreadsheetId: hoja.id,
                ...loc,
                range: `'${titulo}'!${celdaRef}`,
                actual: refRaw,
                nuevo: canon,
              })
            }
          }

          if (matRaw && (!val.ok || matRaw !== matNorm)) {
            informe.matriculasFueraDeFormato.push({
              ...loc,
              celda: celdaMat,
              valor: matRaw,
              normalizada: matNorm,
              formato: val.formato,
            })
            if (FIX_FORMATO && val.ok && matRaw !== matNorm) {
              informe.fixFormato.push({
                spreadsheetId: hoja.id,
                ...loc,
                range: `'${titulo}'!${celdaMat}`,
                actual: matRaw,
                nuevo: matNorm,
              })
            }
          }

          if (canon) {
            const celdas = vistas.get(canon) || []
            celdas.push(celdaRef)
            vistas.set(canon, celdas)
            const clave = `${hoja.nombre}/${titulo}`
            const set = vistasEnHoja.get(canon) || new Set()
            set.add(clave)
            vistasEnHoja.set(canon, set)
          }

          const enBase =
            (canon && base.porRef.get(canon)) ||
            (matNorm && base.porMat.get(matNorm)) ||
            null
          if (!enBase) {
            informe.enHojaNoEnBase.push({
              ...loc,
              celda: celdaRef,
              canonica: canon,
              matricula: matNorm || null,
            })
            continue
          }

          const comparar = (campo, valorHoja, valorBase, celda) => {
            if (
              valorHoja === '' ||
              valorHoja === null ||
              valorBase === '' ||
              valorBase === null ||
              valorBase === undefined
            )
              return
            if (valorHoja !== valorBase) {
              informe.discrepancias.push({
                canonica:
                  canon ?? normalizarReferencia(enBase.referencia, enBase.tipo),
                campo,
                ...loc,
                celda,
                valorHoja,
                valorBase,
              })
            }
          }
          if (matNorm && enBase.matricula_norm) {
            comparar('matricula', matNorm, enBase.matricula_norm, celdaMat)
          }
          if (col.marca >= 0)
            comparar(
              'marca',
              up(fila[col.marca]),
              up(enBase.marca),
              `${letraColumna(col.marca)}${numFila}`
            )
          if (col.modelo >= 0)
            comparar(
              'modelo',
              up(fila[col.modelo]),
              up(enBase.modelo),
              `${letraColumna(col.modelo)}${numFila}`
            )
          if (col.bastidor >= 0)
            comparar(
              'bastidor',
              up(fila[col.bastidor]),
              up(enBase.bastidor),
              `${letraColumna(col.bastidor)}${numFila}`
            )
          if (col.kms >= 0)
            comparar(
              'kms',
              kmsNum(fila[col.kms]),
              kmsNum(enBase.kms),
              `${letraColumna(col.kms)}${numFila}`
            )
        }

        for (const [canonica, celdas] of vistas) {
          if (celdas.length > 1) {
            informe.duplicadosEnPestana.push({
              hoja: hoja.nombre,
              pestana: titulo,
              canonica,
              celdas,
            })
          }
        }
      }

      informe.hojas.push({
        id: hoja.id,
        nombre: hoja.nombre,
        pestanasEncontradas: encontradas,
        pestanasFaltantes: faltantes,
      })
    }

    // Vehículos de la base que no aparecen en la pestaña que les corresponde.
    const hojasLeidas = new Set(
      informe.hojas.flatMap((h) =>
        h.pestanasEncontradas.map((p) => `${h.nombre}/${p}`)
      )
    )
    for (const v of base.rows) {
      const c = normalizarReferencia(v.referencia, v.tipo)
      if (!c) continue
      const esperada = pestanaEsperada(v)
      const set = vistasEnHoja.get(c) || new Set()
      for (const [hoja, pestana] of [
        ['COMPRAS', esperada.compras],
        ['VENTAS', esperada.ventas],
      ]) {
        if (!hojasLeidas.has(`${hoja}/${pestana}`)) continue
        if (!set.has(`${hoja}/${pestana}`)) {
          informe.enBaseNoEnHoja.push({
            referencia: v.referencia,
            tipo: v.tipo,
            pestanaEsperada: { hoja, pestana },
          })
        }
      }
    }

    if (FIX_FORMATO && APPLY && informe.fixFormato.length > 0) {
      const porSpreadsheet = new Map()
      for (const f of informe.fixFormato) {
        const lista = porSpreadsheet.get(f.spreadsheetId) || []
        lista.push({ range: f.range, values: [[f.nuevo]] })
        porSpreadsheet.set(f.spreadsheetId, lista)
      }
      for (const [spreadsheetId, data] of porSpreadsheet) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data },
        })
        console.log(
          `[apply] ${data.length} celdas actualizadas en ${spreadsheetId}`
        )
      }
    }

    imprimir(informe)
    const out =
      process.env.RECONCILIACION_OUT ||
      path.join(process.cwd(), 'reconciliacion-sheets.json')
    fs.writeFileSync(out, JSON.stringify(informe, null, 2))
    console.log(`\nInforme JSON: ${out}`)
  } finally {
    await pool.end()
  }
}

function imprimir(informe) {
  const seccion = (titulo, items, fmt) => {
    console.log(`\n== ${titulo}: ${items.length}`)
    for (const it of items.slice(0, MAX_LINEAS)) console.log('  ' + fmt(it))
    if (items.length > MAX_LINEAS)
      console.log(`  … y ${items.length - MAX_LINEAS} más`)
  }
  for (const h of informe.hojas) {
    console.log(
      `${h.nombre}: pestañas ${h.pestanasEncontradas.join(', ')}${h.pestanasFaltantes.length ? ` (faltan: ${h.pestanasFaltantes.join(', ')})` : ''}`
    )
  }
  seccion(
    'Referencias fuera de formato',
    informe.referenciasFueraDeFormato,
    (x) => `${x.hoja}/${x.pestana}!${x.celda}: '${x.valor}' → '${x.canonica}'`
  )
  seccion(
    'Referencias no interpretables',
    informe.referenciasNoInterpretables,
    (x) => `${x.hoja}/${x.pestana}!${x.celda}: '${x.valor}'`
  )
  seccion(
    'Matrículas fuera de formato',
    informe.matriculasFueraDeFormato,
    (x) =>
      `${x.hoja}/${x.pestana}!${x.celda}: '${x.valor}' → '${x.normalizada}' (${x.formato})`
  )
  seccion(
    'Duplicados en pestaña',
    informe.duplicadosEnPestana,
    (x) => `${x.hoja}/${x.pestana} ${x.canonica}: ${x.celdas.join(', ')}`
  )
  seccion(
    'En hoja, no en base',
    informe.enHojaNoEnBase,
    (x) =>
      `${x.hoja}/${x.pestana}!${x.celda}: ${x.canonica ?? '?'} ${x.matricula ?? ''}`
  )
  seccion(
    'En base, no en hoja',
    informe.enBaseNoEnHoja,
    (x) =>
      `${x.referencia} (${x.tipo}) falta en ${x.pestanaEsperada.hoja}/${x.pestanaEsperada.pestana}`
  )
  seccion(
    'Discrepancias',
    informe.discrepancias,
    (x) =>
      `${x.canonica} ${x.campo} ${x.hoja}/${x.pestana}!${x.celda}: hoja='${x.valorHoja}' base='${x.valorBase}'`
  )
  if (FIX_FORMATO) {
    seccion(
      `Celdas a corregir${APPLY ? ' (aplicadas)' : ''}`,
      informe.fixFormato,
      (x) => `${x.hoja}/${x.pestana} ${x.range}: '${x.actual}' → '${x.nuevo}'`
    )
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message || err)
  process.exit(1)
})
