#!/usr/bin/env node
/**
 * scan_expedientes.js — escáner del inventario de expedientes de OneDrive.
 *
 * Corre en el SERVER (Hetzner, deploy en /root/scan_expedientes.js; el CRM en
 * Vercel no puede leer el mount rclone). Recorre
 *   /mnt/onedrive/GESTORIA/<año>/<trimestre>/Expedientes/<mes>/<carpeta-coche>/
 * y POSTea el snapshot íntegro del trimestre a /api/gestoria/expedientes-snapshot
 * (el endpoint hace reemplazo total: DELETE + INSERT de ese año/trimestre).
 *
 * NOVEDAD: por cada archivo manda `hash` = MD5 del contenido, además de
 * {nombre, bytes}. MD5 (no sha256) porque es EXACTAMENTE el algoritmo con el que
 * facturas_registro.hash_contenido guarda las facturas ya archivadas → los
 * hashes cruzan y el CRM puede identificar un PDF sin mirar su nombre. No es una
 * función de seguridad: sólo identidad de archivo, y es más barata sobre rclone.
 *
 * Robustez: leer ~55 archivos por trimestre sobre el mount rclone es lento pero
 * tolerable una vez al día. Si un archivo no se puede leer → `hash: null` y se
 * sigue (nunca aborta el escaneo). Un cache local (path|size|mtime → md5) evita
 * releer lo que no cambió entre corridas.
 *
 * Uso:
 *   node scan_expedientes.js <año> [trimestre]      # sin trimestre: los 4
 *   DRY_RUN=1 node scan_expedientes.js 2026 2       # imprime, no POSTea
 *
 * Env:
 *   CRM_URL       (default https://sevencars.vercel.app)
 *   SECRET_FILE   (default /root/factura_webhook_secret.txt)
 *   WEBHOOK_SECRET (alternativa al archivo)
 *   ONEDRIVE_ROOT (default /mnt/onedrive)
 *   HASH_CACHE    (default /root/.scan_expedientes_cache.json; '' = sin cache)
 */

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

const ROOT = process.env.ONEDRIVE_ROOT || '/mnt/onedrive'
const CRM_URL = (process.env.CRM_URL || 'https://sevencars.vercel.app').replace(/\/+$/, '')
const SECRET_FILE = process.env.SECRET_FILE || '/root/factura_webhook_secret.txt'
const CACHE_FILE =
  process.env.HASH_CACHE === '' ? null : process.env.HASH_CACHE || '/root/.scan_expedientes_cache.json'
const DRY_RUN = process.env.DRY_RUN === '1'
const CONCURRENCIA = 4 // el mount rclone se ahoga con más

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

// ---------------------------------------------------------------- cache md5
let cache = {}
function cargarCache() {
  if (!CACHE_FILE) return
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) || {}
  } catch {
    cache = {}
  }
}
function guardarCache() {
  if (!CACHE_FILE) return
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache))
  } catch (err) {
    console.error(`[cache] no se pudo guardar: ${err.message}`)
  }
}

/** MD5 del contenido, en streaming (no carga el archivo entero en memoria). */
function md5Archivo(file) {
  return new Promise((resolve) => {
    const h = crypto.createHash('md5')
    const s = fs.createReadStream(file)
    s.on('error', (err) => {
      console.error(`[hash] ilegible ${file}: ${err.message}`)
      resolve(null) // resiliente: sin hash, el CRM cae al nombre
    })
    s.on('data', (chunk) => h.update(chunk))
    s.on('end', () => resolve(h.digest('hex')))
  })
}

async function hashConCache(file, stat) {
  const key = `${file}|${stat.size}|${Math.round(stat.mtimeMs)}`
  if (cache[key]) return cache[key]
  const h = await md5Archivo(file)
  if (h) cache[key] = h
  return h
}

/** Corre `tarea` sobre `items` con concurrencia limitada. */
async function mapLimit(items, limite, tarea) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await tarea(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

async function listar(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true })
  } catch (err) {
    console.error(`[ls] ${dir}: ${err.message}`)
    return []
  }
}

/** Archivos de una carpeta de coche (recursivo 1 nivel: subcarpetas incluidas). */
async function archivosDeCarpeta(dir) {
  const entradas = await listar(dir)
  const files = []
  for (const e of entradas) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      for (const sub of await listar(full)) {
        if (sub.isFile() && !sub.name.startsWith('.')) files.push(path.join(full, sub.name))
      }
    } else if (e.isFile() && !e.name.startsWith('.')) {
      files.push(full)
    }
  }
  return mapLimit(files, CONCURRENCIA, async (file) => {
    let stat = null
    try {
      stat = await fsp.stat(file)
    } catch (err) {
      console.error(`[stat] ${file}: ${err.message}`)
      return { nombre: path.basename(file), bytes: null, hash: null }
    }
    const hash = await hashConCache(file, stat)
    return { nombre: path.basename(file), bytes: stat.size, hash }
  })
}

async function escanearTrimestre(anio, trimestre) {
  const base = path.join(ROOT, 'GESTORIA', String(anio), QNAMES[trimestre - 1], 'Expedientes')
  const carpetas = []
  for (const mesDir of await listar(base)) {
    if (!mesDir.isDirectory()) continue
    const mes = mesDir.name
    for (const cocheDir of await listar(path.join(base, mes))) {
      if (!cocheDir.isDirectory()) continue
      const dir = path.join(base, mes, cocheDir.name)
      const archivos = await archivosDeCarpeta(dir)
      const sinHash = archivos.filter((a) => !a.hash).length
      console.error(
        `[scan] ${mes}/${cocheDir.name}: ${archivos.length} archivo(s)` +
          (sinHash ? ` (${sinHash} sin hash)` : '')
      )
      carpetas.push({ mes, carpeta: cocheDir.name, archivos })
    }
  }
  return carpetas
}

async function postear(anio, trimestre, carpetas) {
  const secret = secreto()
  if (!secret) throw new Error(`sin secreto (${SECRET_FILE} o WEBHOOK_SECRET)`)
  const res = await fetch(`${CRM_URL}/api/gestoria/expedientes-snapshot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
    body: JSON.stringify({ anio, trimestre, carpetas }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body}`)
  return body
}

async function main() {
  const anio = parseInt(process.argv[2] || '', 10)
  if (!Number.isInteger(anio)) {
    console.error('uso: node scan_expedientes.js <año> [trimestre]')
    process.exit(1)
  }
  const uno = parseInt(process.argv[3] || '', 10)
  const trimestres = [1, 2, 3, 4].includes(uno) ? [uno] : [1, 2, 3, 4]

  cargarCache()
  for (const t of trimestres) {
    const carpetas = await escanearTrimestre(anio, t)
    if (carpetas.length === 0) {
      console.error(`[${anio} T${t}] sin carpetas — no se POSTea (evita borrar el snapshot bueno)`)
      continue
    }
    const archivos = carpetas.reduce((n, c) => n + c.archivos.length, 0)
    const conHash = carpetas.reduce((n, c) => n + c.archivos.filter((a) => a.hash).length, 0)
    console.error(
      `[${anio} T${t}] ${carpetas.length} carpeta(s), ${archivos} archivo(s), ${conHash} con hash`
    )
    if (DRY_RUN) {
      console.log(JSON.stringify({ anio, trimestre: t, carpetas }, null, 2))
      continue
    }
    try {
      console.error(`[${anio} T${t}] POST → ${await postear(anio, t, carpetas)}`)
    } catch (err) {
      console.error(`[${anio} T${t}] ERROR al POSTear: ${err.message}`)
      process.exitCode = 1
    }
  }
  guardarCache()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
