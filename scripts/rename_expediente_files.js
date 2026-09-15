#!/usr/bin/env node
/**
 * rename_expediente_files.js — receptor de renombrado de archivos de expediente.
 *
 * Corre en el SERVER (Hetzner: /opt/n8n/rename_expediente_files.js), porque el
 * CRM en Vercel no ve el mount rclone de OneDrive. El CRM decide QUÉ renombrar
 * (POST /api/expedientes/normalizar-nombres) y este servicio lo EJECUTA.
 *
 * HTTP POST /rename-expediente-files  con header X-Webhook-Secret.
 * Body:
 *   {
 *     anio: 2026, trimestre: 2,
 *     renombrar: [{ mes, carpeta, de, a, hash }],   // hash = md5 esperado del origen
 *     borrar:    [{ mes, carpeta, nombre, hash, duplicadoDe }]
 *   }
 * Respuesta:
 *   { ok, resultados: [{ carpeta, nombre, destino, accion, ok, motivo }] }
 *   accion ∈ 'renombrado' | 'borrado' | 'omitido'
 *
 * Reglas de seguridad (son documentos de clientes reales):
 *   - El nombre de destino se sanea: sin '/', sin '..', sin rutas absolutas.
 *   - Antes de tocar nada se verifica el md5 del origen contra el `hash` del
 *     snapshot. Si no coincide (el archivo cambió), se OMITE.
 *   - Destino ya existe con OTRO contenido → se OMITE (conflicto). Nunca se
 *     pisa un archivo distinto.
 *   - Destino ya existe con el MISMO contenido → el origen es un duplicado: se
 *     borra el origen y se reporta.
 *   - Nada se borra sin haber comparado md5.
 *
 * ---------------------------------------------------------------------------
 * accion: 'carpetas' — carpetas de coche en 1_Ventas / 3_Compras.
 *
 * Mismo endpoint y mismo secreto; se discrimina por `body.accion === 'carpetas'`
 * (el flujo de expedientes de arriba no manda `accion` y sigue igual).
 * Body:
 *   { accion: 'carpetas', op: 'crear'|'vendido'|'renombrar'|'listar', dryRun?,
 *     nombre?, tipo?: 'C'|'I'|'D'|'R', matricula?, de?, a? }
 * Respuesta (200; 400 si op/nombre/tipo inválidos):
 *   { ok, accion: op, dryRun, rutas: string[], motivo, resultado?, porRaiz?,
 *     existentes?, carpetas? }
 *   resultado ∈ creado | existente | renombrado | movido | conflicto |
 *               sin_cambios | no_existe   (el peor de las dos raíces)
 * Reglas: cada raíz es independiente; NUNCA se borra ni se fusiona nada; las
 * coincidencias se buscan por matrícula en la raíz y en todos los contenedores;
 * más de una coincidencia → conflicto y no se toca nada. Cada op escribe una
 * línea JSON en LOG_FILE (stdout se pierde al lanzarlo con `docker exec -d`).
 *
 * Uso:
 *   SECRET_FILE=/root/factura_webhook_secret.txt PORT=5679 node rename_expediente_files.js
 *
 * Env:
 *   PORT          (default 5679)
 *   ONEDRIVE_ROOT (default /mnt/onedrive)
 *   SECRET_FILE   (default /root/factura_webhook_secret.txt)
 *   WEBHOOK_SECRET (alternativa al archivo)
 *   DRY_RUN=1     (no toca el disco: responde lo que haría)
 *   LOG_FILE      (default ./rename_expediente_files.log junto al script; sólo accion carpetas)
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const http = require('http')
const crypto = require('crypto')

const ROOT = process.env.ONEDRIVE_ROOT || '/mnt/onedrive'
const PORT = parseInt(process.env.PORT || '5679', 10)
// 127.0.0.1 por defecto: se expone vía n8n (webhook → HTTP Request al puerto
// local), igual que el resto de los receptores del server.
const HOST = process.env.HOST || '127.0.0.1'
const SECRET_FILE =
  process.env.SECRET_FILE || '/root/factura_webhook_secret.txt'
const DRY_RUN = process.env.DRY_RUN === '1'
const LOG_FILE =
  process.env.LOG_FILE || path.join(__dirname, 'rename_expediente_files.log')

// Carpetas de coche: rutas relativas a ROOT; '' = directamente en la raíz.
// Los nombres de contenedor son EXACTOS (cuentan los guiones: 7 vs 8).
const RAICES = {
  '1_Ventas': {
    stock: { C: '', I: '', D: '-------Consignacion', R: '-----------Coches R' },
    vendidos: {
      C: '----VENDIDOS',
      I: '----VENDIDOS',
      D: '----VENDIDOS',
      R: '----VENDIDOS/0--------------------Coches-R',
    },
    contenedores: [
      '-----------Coches R',
      '-------Consignacion',
      '------IMPORTACION',
      '----VENDIDOS',
      '----VENDIDOS/0--------------------Coches-R',
    ],
  },
  '3_Compras': {
    stock: {
      C: '',
      I: '',
      D: '--------Consignacion',
      R: '-----------Coches R',
    },
    vendidos: {
      C: '----VENDIDOS',
      I: '----VENDIDOS',
      D: '----VENDIDOS',
      R: '----VENDIDOS/COCHES R',
    },
    contenedores: [
      '-----------Coches R',
      '--------Consignacion',
      '-----Importacion',
      '----VENDIDOS',
      '----VENDIDOS/COCHES R',
    ],
  },
}
const OPS_CARPETAS = ['crear', 'vendido', 'renombrar', 'listar']
const TIPOS_CARPETAS = ['C', 'I', 'D', 'R']

// Nombres reales de las carpetas de trimestre en OneDrive (ojo "1re", no "1er").
const QNAMES = [
  '1re trimestre',
  '2do trimestre',
  '3er trimestre',
  '4to trimestre',
]

function secreto() {
  if (process.env.WEBHOOK_SECRET) return process.env.WEBHOOK_SECRET.trim()
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

function md5(file) {
  return new Promise((resolve) => {
    const h = crypto.createHash('md5')
    const s = fs.createReadStream(file)
    s.on('error', () => resolve(null))
    s.on('data', (chunk) => h.update(chunk))
    s.on('end', () => resolve(h.digest('hex')))
  })
}

const existe = async (p) => {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}

/** Un nombre de archivo, nunca una ruta: corta cualquier intento de escapar. */
function nombreSeguro(nombre) {
  const n = String(nombre || '').trim()
  if (!n || n === '.' || n === '..') return null
  if (n.includes('/') || n.includes('\\') || n.includes('\0')) return null
  return n
}

/** Directorio del expediente. */
function dirCarpeta(anio, trimestre, mes, carpeta) {
  const q = QNAMES[trimestre - 1]
  if (!q) return null
  const m = nombreSeguro(mes)
  const c = nombreSeguro(carpeta)
  if (!m || !c) return null
  return path.join(ROOT, 'GESTORIA', String(anio), q, 'Expedientes', m, c)
}

/**
 * Ruta real del archivo dentro de la carpeta del coche: el escáner mira también
 * un nivel de subcarpetas, así que el archivo puede no estar en la raíz.
 */
async function ubicar(dir, nombre) {
  const directo = path.join(dir, nombre)
  if (await existe(directo)) return directo
  let entradas = []
  try {
    entradas = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entradas) {
    if (!e.isDirectory()) continue
    const anidado = path.join(dir, e.name, nombre)
    if (await existe(anidado)) return anidado
  }
  return null
}

const omitido = (carpeta, nombre, motivo, destino = null) => ({
  carpeta,
  nombre,
  destino,
  accion: 'omitido',
  ok: false,
  motivo,
})

async function renombrar(anio, trimestre, op) {
  const { mes, carpeta, de, a, hash } = op
  const origenNombre = nombreSeguro(de)
  const destinoNombre = nombreSeguro(a)
  const dir = dirCarpeta(anio, trimestre, mes, carpeta)
  if (!dir || !origenNombre || !destinoNombre) {
    return omitido(carpeta, de, 'nombre de archivo o carpeta inválido')
  }

  const origen = await ubicar(dir, origenNombre)
  if (!origen)
    return omitido(carpeta, de, 'el archivo ya no está en la carpeta')

  // El snapshot puede estar viejo: si el contenido cambió, no se toca.
  const actual = await md5(origen)
  if (!actual) return omitido(carpeta, de, 'no se pudo leer el archivo (md5)')
  if (hash && actual !== String(hash).toLowerCase()) {
    return omitido(
      carpeta,
      de,
      'el archivo cambió desde el último escaneo (md5 distinto)'
    )
  }

  const destino = path.join(path.dirname(origen), destinoNombre)
  if (destino === origen) {
    return {
      carpeta,
      nombre: de,
      destino: destinoNombre,
      accion: 'omitido',
      ok: true,
      motivo: 'ya tenía el nombre canónico',
    }
  }

  if (await existe(destino)) {
    const hDestino = await md5(destino)
    if (hDestino && hDestino === actual) {
      // El mismo archivo, dos veces: sobra el origen.
      if (!DRY_RUN) await fsp.unlink(origen)
      return {
        carpeta,
        nombre: de,
        destino: destinoNombre,
        accion: 'borrado',
        ok: true,
        motivo: `duplicado exacto de ${destinoNombre}`,
      }
    }
    return omitido(
      carpeta,
      de,
      `ya existe ${destinoNombre} con OTRO contenido — conflicto, resolver a mano`,
      destinoNombre
    )
  }

  if (!DRY_RUN) await fsp.rename(origen, destino)
  return {
    carpeta,
    nombre: de,
    destino: destinoNombre,
    accion: 'renombrado',
    ok: true,
    motivo: null,
  }
}

async function borrarDuplicado(anio, trimestre, op) {
  const { mes, carpeta, nombre, hash, duplicadoDe } = op
  const nom = nombreSeguro(nombre)
  const conservado = nombreSeguro(duplicadoDe)
  const dir = dirCarpeta(anio, trimestre, mes, carpeta)
  if (!dir || !nom || !conservado)
    return omitido(carpeta, nombre, 'nombre de archivo o carpeta inválido')

  const origen = await ubicar(dir, nom)
  if (!origen)
    return omitido(carpeta, nombre, 'el archivo ya no está en la carpeta')
  const gemelo = await ubicar(dir, conservado)
  if (!gemelo) {
    return omitido(
      carpeta,
      nombre,
      `no está ${conservado}: no se borra el único ejemplar`
    )
  }

  const [hOrigen, hGemelo] = await Promise.all([md5(origen), md5(gemelo)])
  if (!hOrigen || !hGemelo)
    return omitido(carpeta, nombre, 'no se pudo leer el archivo (md5)')
  if (hash && hOrigen !== String(hash).toLowerCase()) {
    return omitido(
      carpeta,
      nombre,
      'el archivo cambió desde el último escaneo (md5 distinto)'
    )
  }
  // Sólo se borra lo que está PROBADO que existe idéntico en otro archivo.
  if (hOrigen !== hGemelo) {
    return omitido(
      carpeta,
      nombre,
      `no es idéntico a ${conservado} — no se borra`
    )
  }

  if (!DRY_RUN) await fsp.unlink(origen)
  return {
    carpeta,
    nombre,
    destino: null,
    accion: 'borrado',
    ok: true,
    motivo: `duplicado exacto de ${conservado}`,
  }
}

async function procesar(body) {
  const anio = parseInt(body.anio, 10)
  const trimestre = parseInt(body.trimestre, 10)
  if (!Number.isInteger(anio) || ![1, 2, 3, 4].includes(trimestre)) {
    throw new Error('anio/trimestre inválidos')
  }
  const resultados = []
  // Los borrados primero: si un duplicado apunta a un archivo que después se
  // renombra, el gemelo ya no estaría con ese nombre.
  for (const op of Array.isArray(body.borrar) ? body.borrar : []) {
    resultados.push(await borrarDuplicado(anio, trimestre, op))
  }
  for (const op of Array.isArray(body.renombrar) ? body.renombrar : []) {
    resultados.push(await renombrar(anio, trimestre, op))
  }
  return resultados
}

// ---------------------------------------------------------------------------
// accion: carpetas
// ---------------------------------------------------------------------------

/** Sólo letras y dígitos en mayúsculas: comparar nombres sin guiones/espacios. */
const claveBusqueda = (n) =>
  String(n || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

const RE_MATRICULA = [/^[A-Z]?\d{4}[A-Z]{1,3}$/, /^[A-Z]{1,2}\d{4}[A-Z]{1,2}$/]

/** Último token del nombre que parece matrícula ('0703NLP', 'E9961BDJ'); null si no hay. */
function extraerMatriculaNombre(nombre) {
  const tokens = String(nombre || '')
    .toUpperCase()
    .split(/[-\s]+/)
    .filter(Boolean)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (RE_MATRICULA.some((re) => re.test(tokens[i]))) return tokens[i]
  }
  return null
}

/** El nombre real es el canónico o el canónico con sufijos ('…-Rojo-Inversor-Juan'): no se toca. */
const esNombreCanonico = (actual, canonico) =>
  actual === canonico || actual.startsWith(`${canonico}-`)

/** Nombre de carpeta de coche válido; lanza si no lo es (→ 400). */
function nombreCarpetaSeguro(nombre) {
  const n = nombreSeguro(nombre)
  if (!n)
    throw new Error(`nombre de carpeta inválido: ${JSON.stringify(nombre)}`)
  if (n.startsWith('-') || n.startsWith('_')) {
    throw new Error(
      `nombre de carpeta inválido (no puede empezar por - o _): ${n}`
    )
  }
  if (/["*:<>?|]/.test(n))
    throw new Error(`nombre de carpeta con caracteres prohibidos: ${n}`)
  return n
}

/** Subdirectorios directos de absDir; [] si no existe. */
async function listarDirs(absDir) {
  try {
    const entradas = await fsp.readdir(absDir, { withFileTypes: true })
    return entradas.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

const esCarpetaCoche = (nombre) =>
  !nombre.startsWith('-') && !nombre.startsWith('_')

/**
 * Carpetas de coche de una raíz: nivel 1 (directas) + nivel 2 (dentro de cada
 * contenedor). `contenedor` = '' para las directas. `rel` es relativa a ROOT.
 */
async function listarCarpetasRaiz(rootAbs, root) {
  const cfg = RAICES[root]
  if (!cfg) throw new Error(`raíz desconocida: ${root}`)
  const out = []
  for (const nombre of await listarDirs(path.join(rootAbs, root))) {
    if (esCarpetaCoche(nombre))
      out.push({
        root,
        contenedor: '',
        nombre,
        rel: path.posix.join(root, nombre),
      })
  }
  for (const contenedor of cfg.contenedores) {
    for (const nombre of await listarDirs(
      path.join(rootAbs, root, contenedor)
    )) {
      if (!esCarpetaCoche(nombre)) continue
      const relCont = path.posix.join(contenedor, nombre)
      if (cfg.contenedores.includes(relCont)) continue
      out.push({
        root,
        contenedor,
        nombre,
        rel: path.posix.join(root, relCont),
      })
    }
  }
  return out
}

async function buscarPorMatricula(rootAbs, root, matricula) {
  const clave = claveBusqueda(matricula)
  if (!clave) throw new Error('matrícula vacía')
  return (await listarCarpetasRaiz(rootAbs, root)).filter((c) =>
    claveBusqueda(c.nombre).includes(clave)
  )
}

async function buscarPorNombre(rootAbs, root, nombre) {
  const n = String(nombre).toLowerCase()
  return (await listarCarpetasRaiz(rootAbs, root)).filter(
    (c) => c.nombre.toLowerCase() === n
  )
}

/** rename de directorio. OneDrive es case-insensitive: cambiar sólo mayúsculas pasa por un temporal. */
async function renombrarDir(deAbs, aAbs, dryRun) {
  if (deAbs === aAbs || dryRun) return
  if (deAbs.toLowerCase() === aAbs.toLowerCase()) {
    const tmp = `${aAbs}.__tmp_${process.pid}_${Date.now()}`
    await fsp.rename(deAbs, tmp)
    await fsp.rename(tmp, aAbs)
    return
  }
  await fsp.rename(deAbs, aAbs)
}

const ORDEN_RESULTADO = [
  'sin_cambios',
  'creado',
  'movido',
  'renombrado',
  'existente',
  'no_existe',
  'conflicto',
]

/** El peor resultado de la lista (conflicto > no_existe > existente > cambios > sin_cambios). */
function peorResultado(lista) {
  let peor = 'sin_cambios'
  for (const r of lista) {
    if (ORDEN_RESULTADO.indexOf(r) > ORDEN_RESULTADO.indexOf(peor)) peor = r
  }
  return peor
}

function logCarpetas(linea, logFile) {
  try {
    fs.appendFileSync(
      logFile,
      JSON.stringify({ ts: new Date().toISOString(), ...linea }) + '\n'
    )
  } catch {
    /* el log nunca bloquea la operación */
  }
}

const tipoValido = (tipo) => {
  if (!TIPOS_CARPETAS.includes(tipo))
    throw new Error(`tipo inválido: ${JSON.stringify(tipo)}`)
  return tipo
}

async function raizExiste(rootAbs, root) {
  if (!(await existe(path.join(rootAbs, root))))
    throw new Error(`no existe la raíz ${root} en ${rootAbs}`)
}

/** Coincidencias de un coche en una raíz: por matrícula, o por nombre exacto si no hay matrícula. */
async function localizar(rootAbs, root, nombre, matricula) {
  return matricula
    ? buscarPorMatricula(rootAbs, root, matricula)
    : buscarPorNombre(rootAbs, root, nombre)
}

async function opCrear(body, ctx) {
  const nombre = nombreCarpetaSeguro(body.nombre)
  const tipo = tipoValido(body.tipo)
  const matricula = body.matricula
    ? claveBusqueda(body.matricula)
    : extraerMatriculaNombre(nombre)
  const porRaiz = {}
  for (const root of Object.keys(RAICES)) {
    await raizExiste(ctx.root, root)
    const contenedor = RAICES[root].stock[tipo]
    const destinoRel = path.posix.join(root, contenedor, nombre)
    const destinoAbs = path.join(ctx.root, destinoRel)
    const coincidencias = await localizar(ctx.root, root, nombre, matricula)
    const existentes = coincidencias.map((c) => c.rel)

    if (coincidencias.length > 1) {
      porRaiz[root] = {
        resultado: 'conflicto',
        ruta: null,
        motivo: `varias carpetas con la matrícula: ${existentes.join(', ')}`,
        existentes,
      }
      continue
    }
    if (coincidencias.length === 0) {
      if (!ctx.dryRun) await fsp.mkdir(destinoAbs, { recursive: true })
      porRaiz[root] = { resultado: 'creado', ruta: destinoRel, motivo: null }
      continue
    }
    const c = coincidencias[0]
    if (c.contenedor !== contenedor) {
      porRaiz[root] = {
        resultado: 'existente',
        ruta: c.rel,
        motivo: `ya existe en ${c.contenedor || 'la raíz'}: ${c.rel}`,
        existentes,
      }
      continue
    }
    if (esNombreCanonico(c.nombre, nombre)) {
      porRaiz[root] = { resultado: 'sin_cambios', ruta: c.rel, motivo: null }
      continue
    }
    const soloCase = c.nombre.toLowerCase() === nombre.toLowerCase()
    if (!soloCase && (await existe(destinoAbs))) {
      porRaiz[root] = {
        resultado: 'conflicto',
        ruta: null,
        motivo: `el destino ${destinoRel} ya existe`,
        existentes: [c.rel, destinoRel],
      }
      continue
    }
    await renombrarDir(path.join(ctx.root, c.rel), destinoAbs, ctx.dryRun)
    porRaiz[root] = {
      resultado: 'renombrado',
      ruta: destinoRel,
      motivo: `renombrada desde ${c.nombre}`,
    }
  }
  return porRaiz
}

async function opVendido(body, ctx) {
  const nombre = nombreCarpetaSeguro(body.nombre)
  const tipo = tipoValido(body.tipo)
  const matricula = body.matricula
    ? claveBusqueda(body.matricula)
    : extraerMatriculaNombre(nombre)
  const porRaiz = {}
  for (const root of Object.keys(RAICES)) {
    await raizExiste(ctx.root, root)
    const contenedor = RAICES[root].vendidos[tipo]
    const coincidencias = await localizar(ctx.root, root, nombre, matricula)
    const existentes = coincidencias.map((c) => c.rel)

    if (coincidencias.length > 1) {
      porRaiz[root] = {
        resultado: 'conflicto',
        ruta: null,
        motivo: `varias carpetas con la matrícula: ${existentes.join(', ')}`,
        existentes,
      }
      continue
    }
    if (coincidencias.length === 0) {
      porRaiz[root] = {
        resultado: 'no_existe',
        ruta: null,
        motivo: `no hay carpeta de ${nombre} en ${root}`,
      }
      continue
    }
    const c = coincidencias[0]
    // Los sufijos del nombre real se conservan al mover.
    const nombreFinal = esNombreCanonico(c.nombre, nombre) ? c.nombre : nombre
    const destinoRel = path.posix.join(root, contenedor, nombreFinal)
    const destinoAbs = path.join(ctx.root, destinoRel)
    if (c.contenedor === contenedor && c.nombre === nombreFinal) {
      porRaiz[root] = { resultado: 'sin_cambios', ruta: c.rel, motivo: null }
      continue
    }
    const soloCase =
      c.contenedor === contenedor &&
      c.nombre.toLowerCase() === nombreFinal.toLowerCase()
    if (!soloCase && (await existe(destinoAbs))) {
      porRaiz[root] = {
        resultado: 'conflicto',
        ruta: null,
        motivo: `el destino ${destinoRel} ya existe (no se fusiona)`,
        existentes: [c.rel, destinoRel],
      }
      continue
    }
    if (!ctx.dryRun)
      await fsp.mkdir(path.dirname(destinoAbs), { recursive: true })
    await renombrarDir(path.join(ctx.root, c.rel), destinoAbs, ctx.dryRun)
    const resultado = c.contenedor === contenedor ? 'renombrado' : 'movido'
    porRaiz[root] = { resultado, ruta: destinoRel, motivo: `desde ${c.rel}` }
  }
  return porRaiz
}

async function opRenombrar(body, ctx) {
  const de = nombreCarpetaSeguro(body.de)
  const a = nombreCarpetaSeguro(body.a)
  const porRaiz = {}
  for (const root of Object.keys(RAICES)) {
    await raizExiste(ctx.root, root)
    let coincidencias = await buscarPorNombre(ctx.root, root, de)
    if (coincidencias.length === 0 && de !== a) {
      // En disco rara vez está el nombre canónico viejo exacto: caer a matrícula
      // (la vieja y, si no, la nueva) para no duplicar la carpeta.
      const mOld = extraerMatriculaNombre(de)
      const mNew = extraerMatriculaNombre(a)
      if (mOld) coincidencias = await buscarPorMatricula(ctx.root, root, mOld)
      if (coincidencias.length === 0 && mNew && mNew !== mOld) {
        coincidencias = await buscarPorMatricula(ctx.root, root, mNew)
      }
    }
    const existentes = coincidencias.map((c) => c.rel)
    if (de === a) {
      porRaiz[root] = {
        resultado: 'sin_cambios',
        ruta: coincidencias[0]?.rel ?? null,
        motivo: null,
      }
      continue
    }
    if (coincidencias.length > 1) {
      porRaiz[root] = {
        resultado: 'conflicto',
        ruta: null,
        motivo: `varias carpetas para ${de}: ${existentes.join(', ')}`,
        existentes,
      }
      continue
    }
    if (coincidencias.length === 0) {
      porRaiz[root] = {
        resultado: 'no_existe',
        ruta: null,
        motivo: `no hay carpeta ${de} en ${root}`,
      }
      continue
    }
    const c = coincidencias[0]
    if (c.nombre === a) {
      porRaiz[root] = { resultado: 'sin_cambios', ruta: c.rel, motivo: null }
      continue
    }
    const destinoRel = path.posix.join(root, c.contenedor, a)
    const destinoAbs = path.join(ctx.root, destinoRel)
    const soloCase = c.nombre.toLowerCase() === a.toLowerCase()
    if (!soloCase && (await existe(destinoAbs))) {
      porRaiz[root] = {
        resultado: 'conflicto',
        ruta: null,
        motivo: `el destino ${destinoRel} ya existe`,
        existentes: [c.rel, destinoRel],
      }
      continue
    }
    await renombrarDir(path.join(ctx.root, c.rel), destinoAbs, ctx.dryRun)
    porRaiz[root] = {
      resultado: 'renombrado',
      ruta: destinoRel,
      motivo: `desde ${c.rel}`,
    }
  }
  return porRaiz
}

async function opListar(ctx) {
  const carpetas = []
  for (const root of Object.keys(RAICES))
    carpetas.push(...(await listarCarpetasRaiz(ctx.root, root)))
  return carpetas
}

/**
 * Punto de entrada de accion 'carpetas'. Lanza Error si op/nombre/tipo son
 * inválidos (el handler responde 400). Nunca borra nada.
 */
async function procesarCarpetas(
  body,
  ctx = { root: ROOT, dryRun: DRY_RUN, logFile: LOG_FILE }
) {
  const op = body.op
  if (!OPS_CARPETAS.includes(op))
    throw new Error(`op inválida: ${JSON.stringify(op)}`)
  const c = { ...ctx, dryRun: Boolean(ctx.dryRun) || body.dryRun === true }
  const base = {
    ok: true,
    accion: op,
    dryRun: c.dryRun,
    rutas: [],
    motivo: null,
  }
  let salida
  try {
    if (op === 'listar') {
      salida = { ...base, carpetas: await opListar(c) }
    } else {
      const porRaiz =
        op === 'crear'
          ? await opCrear(body, c)
          : op === 'vendido'
            ? await opVendido(body, c)
            : await opRenombrar(body, c)
      const filas = Object.entries(porRaiz)
      const resultado = peorResultado(filas.map(([, r]) => r.resultado))
      const existentes = filas.flatMap(([, r]) => r.existentes || [])
      const motivos = filas
        .filter(([, r]) => r.motivo)
        .map(([root, r]) => `${root}: ${r.motivo}`)
      salida = {
        ...base,
        ok: !['conflicto', 'no_existe'].includes(resultado),
        rutas: filas.map(([, r]) => r.ruta).filter(Boolean),
        motivo: motivos.length ? motivos.join('; ') : null,
        resultado,
        porRaiz: Object.fromEntries(
          filas.map(([root, r]) => [
            root,
            { resultado: r.resultado, ruta: r.ruta, motivo: r.motivo },
          ])
        ),
      }
      if (existentes.length) salida.existentes = existentes
    }
  } catch (err) {
    logCarpetas(
      {
        op,
        dryRun: c.dryRun,
        ok: false,
        resultado: null,
        rutas: [],
        motivo: err.message,
        nombre: body.nombre ?? null,
        de: body.de ?? null,
        a: body.a ?? null,
      },
      c.logFile
    )
    throw err
  }
  logCarpetas(
    {
      op,
      dryRun: c.dryRun,
      ok: salida.ok,
      resultado: salida.resultado ?? null,
      rutas: salida.rutas,
      motivo: salida.motivo,
      ...(op === 'renombrar'
        ? { de: body.de, a: body.a }
        : { nombre: body.nombre ?? null }),
    },
    c.logFile
  )
  return salida
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const crearServidor = () =>
  http.createServer((req, res) => {
    const responder = (code, obj) => {
      const payload = JSON.stringify(obj)
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(payload)
    }

    if (req.method !== 'POST')
      return responder(405, { error: 'method not allowed' })

    const esperado = secreto()
    const recibido = req.headers['x-webhook-secret'] || ''
    if (!esperado || recibido !== esperado)
      return responder(401, { error: 'unauthorized' })

    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 5_000_000) req.destroy()
    })
    req.on('end', async () => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return responder(400, { error: 'json inválido' })
      }
      if (body && body.accion === 'carpetas') {
        try {
          return responder(200, await procesarCarpetas(body))
        } catch (err) {
          return responder(400, {
            ok: false,
            accion: body.op ?? null,
            dryRun: DRY_RUN,
            rutas: [],
            motivo: err.message,
          })
        }
      }
      try {
        const resultados = await procesar(body)
        const ok = resultados.every((r) => r.ok)
        for (const r of resultados) {
          console.log(
            `[${r.accion}]${r.ok ? '' : ' FALLO'} ${r.carpeta}/${r.nombre}` +
              (r.destino ? ` → ${r.destino}` : '') +
              (r.motivo ? ` (${r.motivo})` : '')
          )
        }
        responder(200, { ok, dryRun: DRY_RUN, resultados })
      } catch (err) {
        console.error('[rename] error:', err.message)
        responder(500, { error: err.message })
      }
    })
  })

if (require.main === module) {
  crearServidor().listen(PORT, HOST, () => {
    console.log(
      `rename_expediente_files escuchando en ${HOST}:${PORT} (root=${ROOT}${DRY_RUN ? ', DRY_RUN' : ''})`
    )
  })
}

module.exports = {
  RAICES,
  claveBusqueda,
  esNombreCanonico,
  extraerMatriculaNombre,
  nombreCarpetaSeguro,
  listarCarpetasRaiz,
  buscarPorMatricula,
  procesarCarpetas,
  peorResultado,
}
