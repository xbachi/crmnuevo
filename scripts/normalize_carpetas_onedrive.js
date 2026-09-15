#!/usr/bin/env node
/**
 * Armoniza los nombres de las carpetas de coche en OneDrive (1_Ventas y 3_Compras).
 *
 * Formato canonico:  {ref}-{Marca}-{Modelo}-{MATRICULA}[-{extras}]
 *   ej.  90-Opel-Astra-0483MBJ
 *        D-28-Fiat-500-7487MGV
 *        71-Ford-Puma-4864NLP-Alemania
 *
 * Corre en el server n8n (root@178.104.72.37), usa el remote rclone `onedrive-sevencars:`.
 *
 * Env:
 *   APPLY=1          aplica los renombrados (por defecto: dry-run, no toca nada)
 *   MAX_RENAMES=n    tope de renombrados por corrida (default 40)
 *   ROOTS=a,b        raices a recorrer (default "1_Ventas,3_Compras")
 *   REMOTE=x:        remote rclone (default "onedrive-sevencars:")
 *   CATALOGO_URL     endpoint del CRM para resolver el nº de referencia faltante
 *   ADMIN_SECRET     secret del endpoint
 *   LOG_FILE         jsonl de renombrados (default /var/log/normalize_carpetas.jsonl)
 *   JSON=1           salida en JSON en vez de texto
 *   REVERT=1         deshace los renombrados de la ultima corrida aplicada
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require('child_process')
const fs = require('fs')

const REMOTE = process.env.REMOTE || 'onedrive-sevencars:'
const ROOTS = (process.env.ROOTS || '1_Ventas,3_Compras')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const APPLY = process.env.APPLY === '1'
const MAX_RENAMES = parseInt(process.env.MAX_RENAMES || '40', 10)
const LOG_FILE = process.env.LOG_FILE || '/var/log/normalize_carpetas.jsonl'
const AS_JSON = process.env.JSON === '1'
const MAX_DEPTH = 4

const {
  MARCAS,
  MARCAS_2,
  MODELOS,
  EXTRAS,
  clave,
  casearToken,
} = require('./lib/carpetaNombre')

// carpetas de trabajo: no se tocan ni se entra en ellas
function esIgnorada(nombre) {
  return nombre.trim().startsWith('_')
}

// carpetas contenedoras: no son coches, se entra a buscar adentro
function esContenedor(nombre) {
  const n = nombre.trim()
  if (n.startsWith('-')) return true
  if (/-{4,}/.test(n)) return true
  if (/^coches[\s_-]*r$/i.test(n)) return true
  if (/^(consignacion|consignación|importacion|importación|vendidos)$/i.test(n))
    return true
  return false
}

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

function rclone(args, opts = {}) {
  return execFileSync('rclone', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeout || 180000,
  })
}

function listarDirs(root) {
  const out = rclone(
    [
      'lsf',
      '-R',
      '--dirs-only',
      '--max-depth',
      String(MAX_DEPTH),
      `${REMOTE}${root}`,
    ],
    { timeout: 300000 }
  )
  return out
    .split('\n')
    .map((l) => l.replace(/\/$/, '').trim())
    .filter(Boolean)
}

// --------------------------------------------------------------------------
// Parseo del nombre
// --------------------------------------------------------------------------

// Devuelve { ref, resto } o { ref: null, resto: nombre }
function extraerRef(nombre) {
  let m = nombre.match(/^\s*([DRIC])\s*-\s*(\d{1,3})(?=[\s\-_]|$)/i)
  if (m)
    return {
      ref: `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`,
      resto: nombre.slice(m[0].length),
    }
  m = nombre.match(/^\s*([DRI])(\d{1,3})(?=[\s\-_]|$)/i)
  if (m)
    return {
      ref: `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`,
      resto: nombre.slice(m[0].length),
    }
  m = nombre.match(/^\s*(\d{1,3})(?=[\s\-_]|$)/)
  if (m)
    return { ref: String(parseInt(m[1], 10)), resto: nombre.slice(m[0].length) }
  return { ref: null, resto: nombre }
}

// Busca matricula espanola. Devuelve { plate, start, end } sobre el string original.
function extraerMatricula(s) {
  const up = s.toUpperCase()
  // moderna (4 digitos + 3 letras) y 2000 (idem). Letra pegada adelante = matricula especial (E9961BDJ).
  const re1 = /(?:^|[^A-Z0-9])([A-Z]?)(\d{4})[\s-]*([A-Z]{3})(?![A-Z0-9])/g
  let best = null
  let m
  // el match puede empezar con 1 caracter separador consumido por la alternancia
  const inicioReal = (mm) =>
    mm.index === 0 && /[A-Z0-9]/.test(mm[0][0]) ? mm.index : mm.index + 1
  while ((m = re1.exec(up)) !== null) {
    best = {
      plate: `${m[1]}${m[2]}${m[3]}`,
      start: inicioReal(m),
      end: m.index + m[0].length,
    }
  }
  if (best) return best
  // antigua (1-2 letras + 4 digitos + 1-2 letras): V4892-GT
  const re2 =
    /(?:^|[^A-Z0-9])([A-Z]{1,2})[\s-]*(\d{4})[\s-]*([A-Z]{1,2})(?![A-Z0-9])/g
  while ((m = re2.exec(up)) !== null) {
    best = {
      plate: `${m[1]}${m[2]}${m[3]}`,
      start: inicioReal(m),
      end: m.index + m[0].length,
    }
  }
  return best
}

function tokenizar(s) {
  return s
    .split(/[\s_\-–—.,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

// Une "I" + "10" -> "I10", "I" + "20" -> "I20"
function unirLetraNumero(tokens) {
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const sig = tokens[i + 1]
    if (
      t.length === 1 &&
      /^[A-Za-z]$/.test(t) &&
      sig &&
      /^\d{1,3}$/.test(sig)
    ) {
      out.push(t + sig)
      i++
    } else {
      out.push(t)
    }
  }
  return out
}

// Separa "CitroenC4" -> ["Citroen","C4"], "MiniCooper" -> ["Mini","Cooper"]
function partirMarcaPegada(token) {
  const k = clave(token)
  for (const alias of Object.keys(MARCAS)) {
    if (alias.length >= 3 && k.startsWith(alias) && k.length > alias.length) {
      return [token.slice(0, alias.length), token.slice(alias.length)]
    }
  }
  return null
}

/**
 * Analiza el nombre de una carpeta y devuelve la propuesta canonica.
 */
function analizar(nombreOriginal, catalogo) {
  const nombre = nombreOriginal.trim().replace(/\s+/g, ' ')
  const avisos = []

  const mat = extraerMatricula(nombre)
  if (!mat) {
    return { ok: false, motivo: 'sin-matricula', avisos }
  }
  const matricula = mat.plate

  const antes = nombre.slice(0, mat.start)
  const despues = nombre.slice(mat.end)

  const { ref: refNombre, resto } = extraerRef(antes)
  let ref = refNombre

  // extras: todo lo que va despues de la matricula + tokens de la lista de ruido
  const extras = []
  let tokens = tokenizar(resto)
  const restantes = []
  for (const t of tokens) {
    if (EXTRAS.has(clave(t))) extras.push(t)
    else restantes.push(t)
  }
  for (const t of tokenizar(despues)) extras.push(t)

  // marca
  let marca = null
  let idx = 0
  if (restantes.length >= 2) {
    const dos = clave(`${restantes[0]} ${restantes[1]}`)
    if (MARCAS_2[dos]) {
      marca = MARCAS_2[dos]
      idx = 2
    }
  }
  if (!marca && restantes.length >= 1) {
    const uno = clave(restantes[0])
    if (MARCAS[uno]) {
      marca = MARCAS[uno]
      idx = 1
    } else {
      const partido = partirMarcaPegada(restantes[0])
      if (partido && MARCAS[clave(partido[0])]) {
        marca = MARCAS[clave(partido[0])]
        restantes[0] = partido[1]
        idx = 0
      }
    }
  }
  if (!marca) {
    if (restantes.length === 0)
      return { ok: false, motivo: 'sin-marca-ni-modelo', avisos }
    marca = casearToken(restantes[0])
    idx = 1
    avisos.push(`marca no reconocida: "${restantes[0]}"`)
  }

  // modelo
  let modeloTokens = unirLetraNumero(restantes.slice(idx))
  modeloTokens = modeloTokens.map((t) => {
    const alias = MODELOS[clave(t)]
    return alias || casearToken(t)
  })
  if (modeloTokens.length === 0) avisos.push('sin modelo')

  // referencia desde el CRM si la carpeta no la trae
  if (!ref && catalogo) {
    const v = catalogo.get(matricula)
    if (v && v.ref) {
      ref = v.ref
      avisos.push(`nº de referencia tomado del CRM (${v.ref})`)
    }
  }
  if (!ref) avisos.push('sin nº de referencia')

  const extrasCaseadas = extras.map((t) => casearToken(t)).filter(Boolean)

  const partes = [
    ref,
    marca,
    ...modeloTokens,
    matricula,
    ...extrasCaseadas,
  ].filter(Boolean)
  let propuesto = partes.join('-')
  // saneado: caracteres no validos en OneDrive y guiones repetidos
  propuesto = propuesto
    .replace(/["*:<>?/\\|]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  return {
    ok: true,
    propuesto,
    ref,
    marca,
    modelo: modeloTokens.join('-'),
    matricula,
    extras: extrasCaseadas,
    avisos,
  }
}

// --------------------------------------------------------------------------
// Catalogo del CRM (opcional): matricula -> { ref, marca, modelo }
// --------------------------------------------------------------------------

async function cargarCatalogo() {
  const url = process.env.CATALOGO_URL
  const secret = process.env.ADMIN_SECRET
  if (!url || !secret) return null
  try {
    const r = await fetch(url, {
      headers: { 'x-admin-secret': secret },
      signal: AbortSignal.timeout(20000),
    })
    if (!r.ok) {
      console.error(
        `[aviso] catalogo CRM devolvio HTTP ${r.status}; sigo sin el`
      )
      return null
    }
    const data = await r.json()
    const map = new Map()
    for (const v of data.vehiculos || []) {
      if (v.matriculaNorm) map.set(String(v.matriculaNorm).toUpperCase(), v)
    }
    return map
  } catch (e) {
    console.error(
      `[aviso] no pude leer el catalogo del CRM (${e.message}); sigo sin el`
    )
    return null
  }
}

// --------------------------------------------------------------------------
// Recorrido y clasificacion
// --------------------------------------------------------------------------

function candidatos(root) {
  const paths = listarDirs(root)
  const contenedores = new Set()
  const res = []
  // ordenar por profundidad para poder decidir de arriba hacia abajo
  paths.sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)
  )
  const esHijoDeCandidato = (p) => {
    for (const c of res) if (p.startsWith(c.rel + '/')) return true
    return false
  }
  const ignoradas = new Set()
  const bajoIgnorada = (p) => {
    for (const i of ignoradas) if (p.startsWith(i + '/')) return true
    return false
  }
  for (const p of paths) {
    if (esHijoDeCandidato(p) || bajoIgnorada(p)) continue
    const partes = p.split('/')
    const base = partes[partes.length - 1]
    const padre = partes.slice(0, -1).join('/')
    if (partes.length > 1 && !contenedores.has(padre)) continue // padre no es contenedor conocido
    if (esIgnorada(base)) {
      ignoradas.add(p)
      continue
    }
    if (esContenedor(base)) {
      contenedores.add(p)
      continue
    }
    res.push({ rel: p, base, padreRel: padre, root })
  }
  return res
}

// --------------------------------------------------------------------------
// Aplicacion
// --------------------------------------------------------------------------

function renombrar(root, padreRel, from, to) {
  const dir = padreRel ? `${root}/${padreRel}` : root
  const src = `${REMOTE}${dir}/${from}`
  const dst = `${REMOTE}${dir}/${to}`
  if (from.toLowerCase() === to.toLowerCase()) {
    // OneDrive es case-insensitive: hace falta pasar por un nombre intermedio
    const tmp = `${to}-tmprn${Date.now().toString(36)}`
    rclone(['moveto', src, `${REMOTE}${dir}/${tmp}`])
    rclone(['moveto', `${REMOTE}${dir}/${tmp}`, dst])
  } else {
    rclone(['moveto', src, dst])
  }
}

function logear(entrada) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entrada) + '\n')
  } catch (e) {
    console.error(`[aviso] no pude escribir el log ${LOG_FILE}: ${e.message}`)
  }
}

function revertirUltima() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error('No hay log de renombrados')
    process.exit(1)
  }
  const lineas = fs
    .readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  const aplicados = lineas.filter((l) => l.evento === 'renombrado')
  if (aplicados.length === 0) {
    console.log('No hay renombrados que revertir')
    return
  }
  const ultimoRun = aplicados[aplicados.length - 1].run
  const delRun = aplicados.filter((l) => l.run === ultimoRun).reverse()
  console.log(
    `Revirtiendo ${delRun.length} renombrados de la corrida ${ultimoRun}`
  )
  for (const r of delRun) {
    try {
      renombrar(r.root, r.padre, r.to, r.from)
      console.log(`  ok  ${r.to} -> ${r.from}`)
      logear({
        ts: new Date().toISOString(),
        run: `revert-${ultimoRun}`,
        evento: 'revertido',
        root: r.root,
        padre: r.padre,
        from: r.to,
        to: r.from,
      })
    } catch (e) {
      console.error(`  ERR ${r.to}: ${e.message}`)
    }
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  if (process.env.REVERT === '1') return revertirUltima()

  const runId = new Date().toISOString()
  const catalogo = await cargarCatalogo()

  const acciones = []
  const revisar = []

  for (const root of ROOTS) {
    const cands = candidatos(root)
    // agrupar por carpeta padre para detectar colisiones
    const porPadre = new Map()
    for (const c of cands) {
      const k = `${c.root}|${c.padreRel}`
      if (!porPadre.has(k)) porPadre.set(k, [])
      porPadre.get(k).push(c)
    }

    for (const [, grupo] of porPadre) {
      const destinos = new Map() // lower -> [candidatos]
      const analisis = new Map()

      for (const c of grupo) {
        const a = analizar(c.base, catalogo)
        analisis.set(c.rel, a)
        if (!a.ok) {
          revisar.push({ root: c.root, carpeta: c.rel, motivo: a.motivo })
          continue
        }
        const k = a.propuesto.toLowerCase()
        if (!destinos.has(k)) destinos.set(k, [])
        destinos.get(k).push(c)
      }

      // nombres ya existentes en el grupo (para no pisar una carpeta ajena)
      const existentes = new Map()
      for (const c of grupo) existentes.set(c.base.toLowerCase(), c.rel)

      for (const [k, lista] of destinos) {
        if (lista.length > 1) {
          for (const c of lista) {
            revisar.push({
              root: c.root,
              carpeta: c.rel,
              motivo: 'colision',
              detalle: `${lista.length} carpetas apuntan al mismo nombre: ${analisis.get(c.rel).propuesto}`,
            })
          }
          continue
        }
        const c = lista[0]
        const a = analisis.get(c.rel)
        if (c.base === a.propuesto) continue // ya esta bien
        const chocaCon = existentes.get(k)
        if (chocaCon && chocaCon !== c.rel) {
          revisar.push({
            root: c.root,
            carpeta: c.rel,
            motivo: 'destino-ocupado',
            detalle: `"${a.propuesto}" ya existe (${chocaCon})`,
          })
          continue
        }
        acciones.push({
          root: c.root,
          padre: c.padreRel,
          from: c.base,
          to: a.propuesto,
          rel: c.rel,
          avisos: a.avisos,
        })
      }

      // avisos de carpetas que ya estaban bien pero tienen algo raro
      for (const c of grupo) {
        const a = analisis.get(c.rel)
        if (a.ok && c.base === a.propuesto && a.avisos.length) {
          revisar.push({
            root: c.root,
            carpeta: c.rel,
            motivo: 'aviso',
            detalle: a.avisos.join('; '),
          })
        }
      }
    }
  }

  // ------------------------------------------------------------------ salida
  const resultado = {
    run: runId,
    apply: APPLY,
    total: acciones.length,
    renombrados: [],
    fallidos: [],
    revisar,
  }

  let hechos = 0
  for (const a of acciones) {
    if (!APPLY) {
      resultado.renombrados.push({ ...a, aplicado: false })
      continue
    }
    if (hechos >= MAX_RENAMES) {
      resultado.fallidos.push({
        ...a,
        error: `tope de ${MAX_RENAMES} renombrados por corrida`,
      })
      continue
    }
    try {
      renombrar(a.root, a.padre, a.from, a.to)
      hechos++
      resultado.renombrados.push({ ...a, aplicado: true })
      logear({
        ts: new Date().toISOString(),
        run: runId,
        evento: 'renombrado',
        root: a.root,
        padre: a.padre,
        from: a.from,
        to: a.to,
      })
    } catch (e) {
      const msg = String(e.stderr || e.message || e)
        .split('\n')
        .slice(-3)
        .join(' ')
        .trim()
      resultado.fallidos.push({ ...a, error: msg })
      logear({
        ts: new Date().toISOString(),
        run: runId,
        evento: 'fallido',
        root: a.root,
        padre: a.padre,
        from: a.from,
        to: a.to,
        error: msg,
      })
    }
  }

  if (AS_JSON) {
    console.log(JSON.stringify(resultado, null, 2))
    return
  }

  const modo = APPLY ? 'APLICANDO' : 'SIMULACION (dry-run, no se toca nada)'
  console.log(`\n=== Normalizacion de carpetas OneDrive — ${modo} ===`)
  console.log(
    `Raices: ${ROOTS.join(', ')}   |   catalogo CRM: ${catalogo ? `${catalogo.size} vehiculos` : 'no disponible'}\n`
  )

  if (resultado.renombrados.length === 0) {
    console.log('Todo en orden: ningun nombre para corregir.\n')
  } else {
    console.log(`--- ${resultado.renombrados.length} carpetas a renombrar ---`)
    let rootActual = null
    for (const r of resultado.renombrados) {
      const ruta = r.padre ? `${r.root}/${r.padre}` : r.root
      if (ruta !== rootActual) {
        console.log(`\n  [${ruta}]`)
        rootActual = ruta
      }
      console.log(`    ${r.from}`)
      console.log(
        `      -> ${r.to}${r.avisos.length ? `   (${r.avisos.join('; ')})` : ''}`
      )
    }
    console.log('')
  }

  if (resultado.fallidos.length) {
    console.log(`--- ${resultado.fallidos.length} fallidos ---`)
    for (const f of resultado.fallidos) console.log(`    ${f.from}: ${f.error}`)
    console.log('')
  }

  if (revisar.length) {
    console.log(`--- ${revisar.length} para revisar a mano ---`)
    const porMotivo = {}
    for (const r of revisar) (porMotivo[r.motivo] ||= []).push(r)
    for (const [motivo, lista] of Object.entries(porMotivo)) {
      console.log(`\n  ${motivo} (${lista.length}):`)
      for (const r of lista)
        console.log(`    ${r.carpeta}${r.detalle ? `  — ${r.detalle}` : ''}`)
    }
    console.log('')
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('ERROR FATAL:', e.message)
    process.exit(1)
  })
}

module.exports = {
  analizar,
  extraerMatricula,
  extraerRef,
  esContenedor,
  esIgnorada,
  candidatos,
}
