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
 * Uso:
 *   SECRET_FILE=/root/factura_webhook_secret.txt PORT=5679 node rename_expediente_files.js
 *
 * Env:
 *   PORT          (default 5679)
 *   ONEDRIVE_ROOT (default /mnt/onedrive)
 *   SECRET_FILE   (default /root/factura_webhook_secret.txt)
 *   WEBHOOK_SECRET (alternativa al archivo)
 *   DRY_RUN=1     (no toca el disco: responde lo que haría)
 */

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
const SECRET_FILE = process.env.SECRET_FILE || '/root/factura_webhook_secret.txt'
const DRY_RUN = process.env.DRY_RUN === '1'

// Nombres reales de las carpetas de trimestre en OneDrive (ojo "1re", no "1er").
const QNAMES = ['1re trimestre', '2do trimestre', '3er trimestre', '4to trimestre']

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
  if (!origen) return omitido(carpeta, de, 'el archivo ya no está en la carpeta')

  // El snapshot puede estar viejo: si el contenido cambió, no se toca.
  const actual = await md5(origen)
  if (!actual) return omitido(carpeta, de, 'no se pudo leer el archivo (md5)')
  if (hash && actual !== String(hash).toLowerCase()) {
    return omitido(carpeta, de, 'el archivo cambió desde el último escaneo (md5 distinto)')
  }

  const destino = path.join(path.dirname(origen), destinoNombre)
  if (destino === origen) {
    return { carpeta, nombre: de, destino: destinoNombre, accion: 'omitido', ok: true, motivo: 'ya tenía el nombre canónico' }
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
  return { carpeta, nombre: de, destino: destinoNombre, accion: 'renombrado', ok: true, motivo: null }
}

async function borrarDuplicado(anio, trimestre, op) {
  const { mes, carpeta, nombre, hash, duplicadoDe } = op
  const nom = nombreSeguro(nombre)
  const conservado = nombreSeguro(duplicadoDe)
  const dir = dirCarpeta(anio, trimestre, mes, carpeta)
  if (!dir || !nom || !conservado) return omitido(carpeta, nombre, 'nombre de archivo o carpeta inválido')

  const origen = await ubicar(dir, nom)
  if (!origen) return omitido(carpeta, nombre, 'el archivo ya no está en la carpeta')
  const gemelo = await ubicar(dir, conservado)
  if (!gemelo) {
    return omitido(carpeta, nombre, `no está ${conservado}: no se borra el único ejemplar`)
  }

  const [hOrigen, hGemelo] = await Promise.all([md5(origen), md5(gemelo)])
  if (!hOrigen || !hGemelo) return omitido(carpeta, nombre, 'no se pudo leer el archivo (md5)')
  if (hash && hOrigen !== String(hash).toLowerCase()) {
    return omitido(carpeta, nombre, 'el archivo cambió desde el último escaneo (md5 distinto)')
  }
  // Sólo se borra lo que está PROBADO que existe idéntico en otro archivo.
  if (hOrigen !== hGemelo) {
    return omitido(carpeta, nombre, `no es idéntico a ${conservado} — no se borra`)
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

const server = http.createServer((req, res) => {
  const responder = (code, obj) => {
    const payload = JSON.stringify(obj)
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(payload)
  }

  if (req.method !== 'POST') return responder(405, { error: 'method not allowed' })

  const esperado = secreto()
  const recibido = req.headers['x-webhook-secret'] || ''
  if (!esperado || recibido !== esperado) return responder(401, { error: 'unauthorized' })

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

server.listen(PORT, HOST, () => {
  console.log(
    `rename_expediente_files escuchando en ${HOST}:${PORT} (root=${ROOT}${DRY_RUN ? ', DRY_RUN' : ''})`
  )
})
