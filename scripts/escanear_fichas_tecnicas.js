#!/usr/bin/env node
/**
 * escanear_fichas_tecnicas.js — extrae los datos de la ficha tecnica (tarjeta
 * ITV) de cada coche publicado y los empuja al CRM.
 *
 * Corre en el SERVER (Hetzner, deploy en /root/escanear_fichas_tecnicas.js; el
 * CRM en Vercel no puede leer el mount rclone). Una vez al dia:
 *
 *   1. GET  {CRM}/api/onedrive/catalogo        (X-Admin-Secret)  → coches
 *   2. busca la carpeta de cada coche bajo /mnt/onedrive/{1_Ventas,3_Compras}
 *      (y sus subcarpetas contenedoras: Coches R, Consignacion, Vendidos...)
 *   3. busca dentro el archivo de ficha tecnica (el mas reciente si hay varios)
 *   4. si el MD5 de ese archivo YA se extrajo alguna vez → se salta (no se
 *      llama a la API). Esto es lo que hace que el coste sea de centimos:
 *      cada documento se lee UNA vez en su vida, no una vez por dia.
 *   5. si no, lo manda a la API de Claude (imagen redimensionada con sharp, o
 *      el PDF tal cual) y parsea el JSON de campos + confianzas
 *   6. POST {CRM}/api/fichas-tecnicas/snapshot (X-Webhook-Secret)
 *
 * Nunca aborta por un coche: los fallos se cuentan y se reportan al final
 * (exit 1 si hubo alguno).
 *
 * Uso:
 *   node escanear_fichas_tecnicas.js
 *   DRY_RUN=1 node escanear_fichas_tecnicas.js          # ni API ni POST
 *   SOLO=3429LHT node escanear_fichas_tecnicas.js       # un solo coche
 *
 * Env:
 *   ANTHROPIC_API_KEY           obligatoria (salvo DRY_RUN=1)
 *   CRM_BASE_URL                default https://sevencars.vercel.app (o CRM_URL)
 *   ADMIN_SECRET                cabecera X-Admin-Secret del catalogo
 *   N8N_INVOICE_WEBHOOK_SECRET  cabecera X-Webhook-Secret del snapshot
 *                               (fallback: WEBHOOK_SECRET, o SECRET_FILE =
 *                                /root/factura_webhook_secret.txt, como scan_expedientes.js)
 *   ONEDRIVE_ROOT               default /mnt/onedrive
 *   CATALOGO_JSON               ruta a un JSON local con el catalogo (pruebas,
 *                               evita depender de la red)
 *   HASH_CACHE                  default /root/.fichas_tecnicas_cache.json ('' = sin cache)
 *   MAX_COCHES                  tope de extracciones nuevas por corrida (default 60)
 *   ESFUERZO                    output_config.effort (default 'medium')
 *
 * Instalacion en el server:
 *   npm install --prefix /root sharp @anthropic-ai/sdk
 *   scp scripts/escanear_fichas_tecnicas.js root@SERVER:/root/
 *   # /root/.env_fichas con: ANTHROPIC_API_KEY=..., ADMIN_SECRET=...,
 *   #                        N8N_INVOICE_WEBHOOK_SECRET=..., CRM_BASE_URL=...
 *   crontab -e:
 *     # 06:00 UTC, media hora antes del cron del CRM
 *     0 6 * * * set -a; . /root/.env_fichas; set +a; \
 *       NODE_PATH=/root/node_modules /usr/bin/node /root/escanear_fichas_tecnicas.js \
 *       >> /var/log/fichas_tecnicas.log 2>&1
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

const ROOT = process.env.ONEDRIVE_ROOT || '/mnt/onedrive'
const RAICES = (process.env.ROOTS || '1_Ventas,3_Compras')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const CRM_URL = (
  process.env.CRM_BASE_URL ||
  process.env.CRM_URL ||
  'https://sevencars.vercel.app'
).replace(/\/+$/, '')
const SECRET_FILE =
  process.env.SECRET_FILE || '/root/factura_webhook_secret.txt'
const CACHE_FILE =
  process.env.HASH_CACHE === ''
    ? null
    : process.env.HASH_CACHE || '/root/.fichas_tecnicas_cache.json'
const DRY_RUN = process.env.DRY_RUN === '1'
const SOLO = (process.env.SOLO || '').trim()
const MAX_COCHES = parseInt(process.env.MAX_COCHES || '60', 10)
const MODELO_IA = process.env.MODELO_IA || 'claude-sonnet-5'
const ESFUERZO = process.env.ESFUERZO || 'medium'

const MAX_PROFUNDIDAD = 3 // niveles por debajo de cada raiz
const LADO_MAX = 1600 // px, lado mayor de la imagen que se manda
const CALIDAD_JPEG = 85
const MAX_BYTES_DOC = 20 * 1024 * 1024 // el request de la API tope 32MB; base64 infla 4/3

const EXT_OK = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.heic'])
const RE_FICHA = /ficha[-_ ]?t[eé]cnica|tarjeta[-_ ]?itv|\bitv\b/i

// ---------------------------------------------------------------- utilidades

const normPlate = (s) =>
  String(s ?? '')
    .replace(/[\s.\-]/g, '')
    .toUpperCase()

const sinAcentos = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Matricula extraida del nombre de una carpeta de expediente.
 * (copiada de src/lib/expedienteDocs.ts — este script es JS plano)
 *
 * Formato viejo con letra inicial (E9961BDJ del quad) solo se acepta si la
 * letra NO viene pegada a otra letra en el nombre original — si no, compactar
 * "68-Kia-Xceed-0608NLF" daria "D0608NLF" (la D final de Xceed). Despues se
 * busca el formato moderno 0000XXX sobre el nombre compactado (cubre
 * "79- Hyundai Kona-6935KYC" con espacios sueltos).
 */
function matriculaFromCarpeta(carpeta) {
  const upper = sinAcentos(carpeta).toUpperCase()
  const conLetra =
    /(?:^|[^A-Z])([A-Z][\s.\-]*\d{4}[\s.\-]*[A-Z]{3})(?![A-Z0-9])/.exec(upper)
  if (conLetra) return conLetra[1].replace(/[\s.\-]/g, '')
  const compacto = upper.replace(/[\s.\-]/g, '')
  const sinLetra = /(\d{4}[A-Z]{3})(?![A-Z0-9])/.exec(compacto)
  return sinLetra ? sinLetra[1] : null
}

/** Nº de carpeta del nombre ("D-28-Fiat-500-7487MGV" → "D-28", "90-Opel..." → "90"). */
function refDeCarpeta(carpeta) {
  const m = /^\s*#?([DRIC])\s*-?\s*(\d{1,3})(?![0-9])/i.exec(carpeta)
  if (m) return `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`
  const n = /^\s*#?(\d{1,3})(?![0-9])/.exec(carpeta)
  return n ? String(parseInt(n[1], 10)) : null
}

// carpetas de trabajo: no se tocan ni se entra en ellas (igual que normalize_carpetas)
const esIgnorada = (nombre) =>
  nombre.trim().startsWith('_') || nombre.startsWith('.')

async function listar(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true })
  } catch (err) {
    console.error(`[ls] ${dir}: ${err.message}`)
    return []
  }
}

function secretoWebhook() {
  const env =
    process.env.N8N_INVOICE_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET
  if (env) return env.trim()
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

// -------------------------------------------------------------------- cache
//
// { md5:       { "path|size|mtime": "<hash>" },                   // evita releer bytes
//   extraidos: { "<hash>|<matricula>": { at, archivo, ok, dry? } } } // evita repagar la API
//
// La clave lleva la matricula ademas del hash: dos coches distintos con el
// mismo contenido (una plantilla, un escaneo duplicado) tienen que extraerse
// cada uno por su lado, o el segundo se perderia en silencio.
//
// Las entradas `dry` las escribe DRY_RUN=1: valen como cache SOLO en dry-run
// (para poder probar la segunda pasada) y una corrida real las ignora.

let cache = { md5: {}, extraidos: {} }

function cargarCache() {
  if (!CACHE_FILE) return
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) || {}
    cache = { md5: raw.md5 || {}, extraidos: raw.extraidos || {} }
  } catch {
    cache = { md5: {}, extraidos: {} }
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

const claveExtraido = (hash, plate) => `${hash}|${plate}`

function yaExtraido(hash, plate) {
  const prev = cache.extraidos[claveExtraido(hash, plate)]
  if (!prev) return null
  if (prev.dry && !DRY_RUN) return null
  return prev
}

/** MD5 del contenido, en streaming (mismo algoritmo que scan_expedientes.js). */
function md5Archivo(file) {
  return new Promise((resolve) => {
    const h = crypto.createHash('md5')
    const s = fs.createReadStream(file)
    s.on('error', (err) => {
      console.error(`[hash] ilegible ${file}: ${err.message}`)
      resolve(null)
    })
    s.on('data', (chunk) => h.update(chunk))
    s.on('end', () => resolve(h.digest('hex')))
  })
}

async function hashConCache(file, stat) {
  const key = `${file}|${stat.size}|${Math.round(stat.mtimeMs)}`
  if (cache.md5[key]) return cache.md5[key]
  const h = await md5Archivo(file)
  if (h) cache.md5[key] = h
  return h
}

// ------------------------------------------------------------------ catalogo

async function cargarCatalogo() {
  if (process.env.CATALOGO_JSON) {
    const raw = JSON.parse(
      await fsp.readFile(process.env.CATALOGO_JSON, 'utf8')
    )
    return raw.vehiculos || raw
  }
  const secret = process.env.ADMIN_SECRET || ''
  if (!secret)
    throw new Error('falta ADMIN_SECRET (o CATALOGO_JSON para pruebas)')
  const res = await fetch(`${CRM_URL}/api/onedrive/catalogo`, {
    headers: { 'x-admin-secret': secret },
  })
  const body = await res.text()
  if (!res.ok)
    throw new Error(`catalogo HTTP ${res.status}: ${body.slice(0, 200)}`)
  const json = JSON.parse(body)
  return json.vehiculos || []
}

// ------------------------------------------------------- indice de carpetas

/**
 * Recorre las raices y devuelve matricula normalizada → [carpetas].
 * Una carpeta con matricula en el nombre es un coche (no se baja mas); el
 * resto son contenedores (Coches R, Consignacion, Vendidos...) y se entra.
 */
async function indexarCarpetas() {
  const idx = new Map()
  let vistas = 0

  async function recorrer(dir, nivel) {
    if (nivel > MAX_PROFUNDIDAD) return
    for (const e of await listar(dir)) {
      if (!e.isDirectory() || esIgnorada(e.name)) continue
      const full = path.join(dir, e.name)
      const plate = matriculaFromCarpeta(e.name)
      if (plate) {
        vistas++
        const lista = idx.get(plate) || []
        lista.push({ dir: full, carpeta: e.name })
        idx.set(plate, lista)
      } else {
        await recorrer(full, nivel + 1)
      }
    }
  }

  for (const raiz of RAICES) await recorrer(path.join(ROOT, raiz), 1)
  console.error(
    `[indice] ${vistas} carpeta(s) de coche, ${idx.size} matricula(s)`
  )
  return idx
}

/** Archivos de la carpeta del coche (recursivo 1 nivel, como scan_expedientes). */
async function archivosDeCarpeta(dir) {
  const out = []
  for (const e of await listar(dir)) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      for (const sub of await listar(full)) {
        if (sub.isFile() && !sub.name.startsWith('.'))
          out.push(path.join(full, sub.name))
      }
    } else if (e.isFile()) {
      out.push(full)
    }
  }
  return out
}

/** La ficha tecnica de un coche: la mas reciente entre todas sus carpetas. */
async function buscarFicha(carpetas) {
  let mejor = null
  for (const c of carpetas) {
    for (const file of await archivosDeCarpeta(c.dir)) {
      const nombre = path.basename(file)
      const ext = path.extname(nombre).toLowerCase()
      if (!EXT_OK.has(ext)) continue
      if (!RE_FICHA.test(sinAcentos(nombre))) continue
      let stat
      try {
        stat = await fsp.stat(file)
      } catch (err) {
        console.error(`[stat] ${file}: ${err.message}`)
        continue
      }
      if (!mejor || stat.mtimeMs > mejor.stat.mtimeMs) {
        mejor = { file, nombre, ext, stat, carpeta: c.carpeta }
      }
    }
  }
  return mejor
}

// -------------------------------------------------------------------- prompt

const PROMPT = `Eres un extractor de datos de fichas tecnicas (tarjeta ITV) espanolas.

Te paso la foto o el escaneo de un documento de un coche. Devuelve EXACTAMENTE
este JSON y nada mas (sin texto alrededor, sin bloques de codigo):

{ "matricula": {"valor": "...", "confianza": 0.0},
  "bastidor": {"valor": "...", "confianza": 0.0},
  "marca": {"valor": "...", "confianza": 0.0},
  "modelo": {"valor": "...", "confianza": 0.0},
  "combustible": {"valor": "...", "confianza": 0.0},
  "cilindrada_cc": {"valor": 0, "confianza": 0.0},
  "potencia_kw": {"valor": 0, "confianza": 0.0},
  "potencia_cv": {"valor": 0, "confianza": 0.0},
  "plazas": {"valor": 0, "confianza": 0.0},
  "fecha_primera_matriculacion": {"valor": "YYYY-MM-DD", "confianza": 0.0},
  "color": {"valor": "...", "confianza": 0.0},
  "legibilidad": {"nota": "texto corto", "es_ficha_tecnica": true} }

Donde mirar en la tarjeta ITV espanola (casillas):
  A    matricula
  B    fecha de primera matriculacion
  D.1  marca
  D.2  tipo / variante / version
  D.3  denominacion comercial (el modelo suele leerse aqui; si no, en D.2)
  E    numero de bastidor (VIN): 17 caracteres, nunca lleva I, O ni Q
  P.1  cilindrada en cm3
  P.2  potencia en kW
  P.3  tipo de combustible
  S.1  numero de plazas
  R    color (no siempre esta)

Reglas:
- NO inventes. Lo que no puedas LEER va con "valor": null y confianza 0.
- "confianza" es de 0 a 1 por campo. Bajala si hay brillo, reflejo, sombra,
  recorte, desenfoque, pixelado o un digito dudoso. Un campo nitido y completo
  puede ir por encima de 0.9; uno que interpretas a medias, por debajo de 0.5.
- No confundas el bastidor (17 caracteres alfanumericos) con otros numeros del
  documento. Si cuentas menos de 17 o hay una I/O/Q, baja la confianza.
- cilindrada_cc, potencia_kw, potencia_cv y plazas son NUMEROS (sin unidades).
- fecha_primera_matriculacion SIEMPRE en formato YYYY-MM-DD.
- "legibilidad.nota": una frase corta en espanol sobre la calidad de la lectura
  (p.ej. "foto con reflejo sobre la casilla E").
- "legibilidad.es_ficha_tecnica": false si la imagen NO es una ficha tecnica /
  tarjeta ITV (permiso de circulacion, factura, contrato, foto del coche...).
  En ese caso pon todos los campos a null y explica que documento parece.

Responde solo con el JSON.`

// ------------------------------------------------------------- extraccion IA

let AnthropicCtor = null
function cliente() {
  if (!AnthropicCtor) {
    let mod
    try {
      mod = require('@anthropic-ai/sdk')
    } catch {
      throw new Error(
        'falta el SDK: npm install --prefix /root @anthropic-ai/sdk sharp'
      )
    }
    AnthropicCtor = mod.Anthropic || mod.default || mod
  }
  return new AnthropicCtor() // lee ANTHROPIC_API_KEY del entorno
}

/** Imagen lista para mandar: max 1600px de lado, JPEG 85 (las fotos de movil
 *  pesan 4-8 MB y no hace falta). Devuelve { media_type, data(base64), bytes }. */
async function prepararImagen(file) {
  let sharp
  try {
    sharp = require('sharp')
  } catch {
    throw new Error('falta sharp: npm install --prefix /root sharp')
  }
  const buf = await sharp(file)
    .rotate() // respeta el EXIF del movil
    .resize({
      width: LADO_MAX,
      height: LADO_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: CALIDAD_JPEG })
    .toBuffer()
  return {
    media_type: 'image/jpeg',
    data: buf.toString('base64'),
    bytes: buf.length,
  }
}

async function prepararPdf(file, stat) {
  if (stat.size > MAX_BYTES_DOC)
    throw new Error(
      `PDF de ${Math.round(stat.size / 1048576)} MB: demasiado grande`
    )
  const buf = await fsp.readFile(file)
  return {
    media_type: 'application/pdf',
    data: buf.toString('base64'),
    bytes: buf.length,
  }
}

function bloqueDocumento(ficha, doc) {
  return ficha.ext === '.pdf'
    ? {
        type: 'document',
        source: { type: 'base64', media_type: doc.media_type, data: doc.data },
      }
    : {
        type: 'image',
        source: { type: 'base64', media_type: doc.media_type, data: doc.data },
      }
}

/** El primer bloque de texto: los modelos con razonamiento devuelven antes un
 *  bloque `thinking`, asi que content[0] no sirve. */
function textoDeRespuesta(resp) {
  const bloque = (resp.content || []).find((b) => b.type === 'text')
  if (!bloque) throw new Error('la respuesta no trae ningun bloque de texto')
  return bloque.text
}

function parsearJSON(texto) {
  const limpio = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  const ini = limpio.indexOf('{')
  const fin = limpio.lastIndexOf('}')
  if (ini < 0 || fin <= ini)
    throw new Error(`respuesta sin JSON: ${texto.slice(0, 120)}`)
  return JSON.parse(limpio.slice(ini, fin + 1))
}

const CAMPOS = [
  'matricula',
  'bastidor',
  'marca',
  'modelo',
  'combustible',
  'cilindrada_cc',
  'potencia_kw',
  'potencia_cv',
  'plazas',
  'fecha_primera_matriculacion',
  'color',
]

const camposVacios = () =>
  Object.fromEntries(CAMPOS.map((c) => [c, { valor: null, confianza: 0 }]))

function normalizarCampo(raw) {
  if (raw === null || raw === undefined) return { valor: null, confianza: 0 }
  const v = typeof raw === 'object' ? raw.valor : raw
  const c = typeof raw === 'object' ? Number(raw.confianza) : 0
  const valor =
    typeof v === 'string' ? v.trim() || null : v === undefined ? null : v
  const confianza = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0
  return { valor, confianza: valor === null ? 0 : confianza }
}

/** Campos normalizados + CV derivados de los kW cuando el documento no los trae. */
function normalizarCampos(json) {
  const campos = camposVacios()
  for (const c of CAMPOS) campos[c] = normalizarCampo(json[c])
  const { potencia_kw: kw, potencia_cv: cv } = campos
  if (
    (cv.valor === null || cv.valor === '') &&
    typeof kw.valor === 'number' &&
    kw.valor > 0
  ) {
    campos.potencia_cv = {
      valor: Math.round(kw.valor * 1.36),
      confianza: Math.max(0, Math.round((kw.confianza - 0.1) * 100) / 100),
    }
  }
  return campos
}

async function extraer(ficha, doc) {
  const resp = await cliente().messages.create({
    model: MODELO_IA,
    max_tokens: 4096,
    output_config: { effort: ESFUERZO },
    messages: [
      {
        role: 'user',
        content: [bloqueDocumento(ficha, doc), { type: 'text', text: PROMPT }],
      },
    ],
  })
  if (resp.stop_reason === 'refusal')
    throw new Error('la API rechazo el documento (stop_reason: refusal)')
  const json = parsearJSON(textoDeRespuesta(resp))
  const leg = json.legibilidad || {}
  return {
    campos: normalizarCampos(json),
    nota: typeof leg.nota === 'string' ? leg.nota.trim() : '',
    esFicha: leg.es_ficha_tecnica !== false,
    uso: resp.usage || null,
  }
}

// ---------------------------------------------------------------- POST al CRM

async function postear(payload) {
  const secret = secretoWebhook()
  if (!secret)
    throw new Error(`sin secreto (N8N_INVOICE_WEBHOOK_SECRET o ${SECRET_FILE})`)
  const res = await fetch(`${CRM_URL}/api/fichas-tecnicas/snapshot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
    body: JSON.stringify(payload),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
  return body
}

// --------------------------------------------------------------------- main

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN) {
    console.error(
      'ERROR: falta ANTHROPIC_API_KEY en el entorno. Sin ella no se puede leer ninguna ficha.\n' +
        '       Exportala (o ponla en /root/.env_fichas) o corre con DRY_RUN=1 para probar sin gastar.'
    )
    process.exit(1)
  }

  cargarCache()
  const vehiculos = await cargarCatalogo()
  const idx = await indexarCarpetas()

  const objetivo = SOLO ? normPlate(SOLO) : null
  const lista = objetivo
    ? vehiculos.filter(
        (v) => normPlate(v.matriculaNorm || v.matricula) === objetivo
      )
    : vehiculos
  if (objetivo && lista.length === 0) {
    console.error(`SOLO=${SOLO}: esa matricula no esta en el catalogo del CRM`)
    process.exit(1)
  }

  const r = {
    revisados: 0,
    conFicha: 0,
    sinFicha: 0,
    sinCarpeta: 0,
    extraidas: 0,
    saltadas: 0,
    fallos: 0,
  }
  const sinFicha = []
  const fallos = []
  let promptImpreso = false

  for (const v of lista) {
    const plate = normPlate(v.matriculaNorm || v.matricula)
    if (!plate) continue
    r.revisados++

    const carpetas = idx.get(plate)
    if (!carpetas || carpetas.length === 0) {
      r.sinCarpeta++
      sinFicha.push(`${plate} — sin carpeta en OneDrive`)
      continue
    }

    const ficha = await buscarFicha(carpetas)
    if (!ficha) {
      r.sinFicha++
      sinFicha.push(`${plate} — ${carpetas[0].carpeta}: sin ficha tecnica`)
      continue
    }
    r.conFicha++

    const hash = await hashConCache(ficha.file, ficha.stat)
    if (!hash) {
      r.fallos++
      fallos.push(`${plate} — no se pudo leer ${ficha.nombre}`)
      continue
    }

    const prev = yaExtraido(hash, plate)
    if (prev) {
      r.saltadas++
      console.error(
        `[${plate}] ${ficha.nombre}: ya extraida el ${prev.at} — se salta`
      )
      continue
    }

    if (r.extraidas >= MAX_COCHES) {
      console.error(
        `[${plate}] tope MAX_COCHES=${MAX_COCHES} alcanzado — queda para manana`
      )
      continue
    }

    const base = {
      origen: 'onedrive',
      carpeta: ficha.carpeta,
      referencia: v.ref || refDeCarpeta(ficha.carpeta),
      matricula_carpeta: plate,
      archivo: ficha.nombre,
      hash,
      extraido_at: new Date().toISOString(),
      modelo_ia: MODELO_IA,
    }

    try {
      let doc
      try {
        doc =
          ficha.ext === '.pdf'
            ? await prepararPdf(ficha.file, ficha.stat)
            : await prepararImagen(ficha.file)
      } catch (err) {
        throw new Error(`preparando ${ficha.nombre}: ${err.message}`)
      }

      if (DRY_RUN) {
        if (!promptImpreso) {
          console.error('\n----- PROMPT que se mandaria -----')
          console.error(PROMPT)
          console.error('----- fin del prompt -----\n')
          promptImpreso = true
        }
        console.error(
          `[${plate}] ${ficha.carpeta}/${ficha.nombre} → ${Math.round(ficha.stat.size / 1024)} KB` +
            ` → ${Math.round(doc.bytes / 1024)} KB (${doc.media_type}), hash ${hash}`
        )
        console.log(
          JSON.stringify(
            {
              ...base,
              campos: camposVacios(),
              notas: '(DRY_RUN: sin llamada a la API)',
            },
            null,
            2
          )
        )
        cache.extraidos[claveExtraido(hash, plate)] = {
          at: base.extraido_at,
          archivo: ficha.nombre,
          ok: true,
          dry: true,
        }
        r.extraidas++
        continue
      }

      const out = await extraer(ficha, doc)
      if (!out.esFicha) {
        cache.extraidos[claveExtraido(hash, plate)] = {
          at: base.extraido_at,
          archivo: ficha.nombre,
          ok: false,
          motivo: out.nota || 'no es una ficha tecnica',
        }
        sinFicha.push(
          `${plate} — ${ficha.nombre}: no es una ficha tecnica (${out.nota})`
        )
        r.sinFicha++
        console.error(
          `[${plate}] ${ficha.nombre}: NO es ficha tecnica (${out.nota}) — no se empuja`
        )
        continue
      }

      await postear({ ...base, campos: out.campos, notas: out.nota })
      cache.extraidos[claveExtraido(hash, plate)] = {
        at: base.extraido_at,
        archivo: ficha.nombre,
        ok: true,
      }
      r.extraidas++
      const conf = Object.values(out.campos).map((c) => c.confianza)
      const media = conf.length
        ? conf.reduce((a, b) => a + b, 0) / conf.length
        : 0
      console.error(
        `[${plate}] ${ficha.nombre}: extraida y empujada (confianza media ${media.toFixed(2)})`
      )
    } catch (err) {
      r.fallos++
      fallos.push(`${plate} — ${ficha.nombre}: ${err.message}`)
      console.error(`[${plate}] ERROR: ${err.message}`)
    }
  }

  guardarCache()

  console.error('\n===== resumen =====')
  console.error(`coches revisados : ${r.revisados}`)
  console.error(`con ficha        : ${r.conFicha}`)
  console.error(
    `sin ficha        : ${r.sinFicha} (+ ${r.sinCarpeta} sin carpeta)`
  )
  console.error(
    `extraidas nuevas : ${r.extraidas}${DRY_RUN ? ' (DRY_RUN: no se llamo a la API)' : ''}`
  )
  console.error(`saltadas (cache) : ${r.saltadas}`)
  console.error(`fallos           : ${r.fallos}`)
  for (const s of sinFicha) console.error(`  · ${s}`)
  for (const f of fallos) console.error(`  ! ${f}`)
  if (r.fallos > 0) process.exitCode = 1
}

// require.main: permite cargar el fichero desde un test sin dispararlo.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = {
  matriculaFromCarpeta,
  refDeCarpeta,
  parsearJSON,
  normalizarCampos,
  PROMPT,
}
