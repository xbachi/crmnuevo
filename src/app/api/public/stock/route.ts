/**
 * GET /api/public/stock
 *
 * Feed público del stock para la web propia y portales. Solo vehículos con
 * estado normalizado PUBLICADO y SOLO campos públicos: nada de precio de
 * compra, gastos, inversor, bastidor, notas ni datos de clientes.
 *
 * Auth: token de solo lectura (PUBLIC_FEED_TOKEN) por `?token=` o cabecera
 * `X-Feed-Token`. Sin variable configurada → 503. Es el único endpoint de la
 * API con Cache-Control público: el feed es cacheable por diseño.
 *
 * `?formato=xml` devuelve la misma información en XML sencillo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'
import { normalizarEstado } from '@/lib/vehiculoEstado'

const MAX_FOTOS = 20
const LOTE_BLOB = 5
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600'
const APP_URL_DEFAULT = 'https://sevencars.vercel.app'
const EXT_IMAGEN = /\.(jpe?g|png|webp|gif|avif)$/i
// Caracteres de control no válidos en XML 1.0.
const CONTROL_XML = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g

// Columnas que hoy NO existen en "Vehiculo" (create-tables.sql) pero que el
// feed expone si algún día se añaden. Se detectan por information_schema para
// no romper la query con una columna inexistente.
const COLUMNAS_OPCIONALES = ['version', 'combustible', 'cambio'] as const

interface FilaStock {
  id: number
  referencia: string | null
  marca: string | null
  modelo: string | null
  matricula: string | null
  kms: number | null
  anio: number | null
  color: string | null
  estado: string | null
  precioPublicacion: number | null
  version?: string | null
  combustible?: string | null
  cambio?: string | null
}

interface VehiculoPublico {
  id: number
  referencia: string
  marca: string
  modelo: string
  version: string | null
  anio: number | null
  kms: number | null
  combustible: string | null
  cambio: string | null
  color: string | null
  precio: number | null
  matricula: string
  fotos: string[]
  url: string
}

const CAMPOS_XML: Exclude<keyof VehiculoPublico, 'fotos'>[] = [
  'id',
  'referencia',
  'marca',
  'modelo',
  'version',
  'anio',
  'kms',
  'combustible',
  'cambio',
  'color',
  'precio',
  'matricula',
  'url',
]

function texto(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s || null
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** '1234ABC' → '1234 ***'. Sin bloque de 4 dígitos → '***'. */
function ocultarMatricula(m: string | null | undefined): string {
  const digitos = String(m ?? '').match(/\d{4}/)
  return digitos ? `${digitos[0]} ***` : '***'
}

function urlPublica(id: number): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || APP_URL_DEFAULT).replace(
    /\/+$/,
    ''
  )
  return `${base}/vehiculos/${id}`
}

/** Misma carpeta que usa la subida de archivos del vehículo. */
function carpetaVehiculo(matricula: string | null, id: number): string {
  const limpia = String(matricula ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toUpperCase()
  return limpia || `vehiculo_${id}`
}

/**
 * Fotos públicas del Blob: prefijo por matrícula (actual) y por id (legado),
 * solo imágenes (los PDFs/contratos de la misma carpeta NO salen), ordenadas
 * por nombre (los archivos se suben como `${timestamp}-nombre`), máx. 20.
 * Nunca falla: si el Blob no responde, el coche sale sin fotos.
 */
async function fotosDe(fila: FilaStock): Promise<string[]> {
  const prefijos = [
    `vehiculos/${carpetaVehiculo(fila.matricula, fila.id)}/`,
    `vehiculos/${fila.id}/`,
  ]
  const porNombre = new Map<string, string>()
  for (const prefix of prefijos) {
    try {
      const { blobs } = await list({ prefix })
      for (const b of blobs) {
        if (EXT_IMAGEN.test(b.pathname)) porNombre.set(b.pathname, b.url)
      }
    } catch (e) {
      console.error(`public/stock: error listando Blob ${prefix}:`, e)
    }
  }
  return [...porNombre.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_FOTOS)
    .map(([, url]) => url)
}

async function enLotes<T, R>(
  items: T[],
  tam: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += tam) {
    out.push(...(await Promise.all(items.slice(i, i + tam).map(fn))))
  }
  return out
}

async function columnasOpcionalesPresentes(): Promise<Set<string>> {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'Vehiculo'
       AND column_name = ANY($1::text[])`,
    [[...COLUMNAS_OPCIONALES]]
  )
  return new Set(r.rows.map((x: { column_name: string }) => x.column_name))
}

async function filasPublicadas(): Promise<FilaStock[]> {
  const presentes = await columnasOpcionalesPresentes()
  const extra = COLUMNAS_OPCIONALES.filter((c) => presentes.has(c))
    .map((c) => `, v."${c}"`)
    .join('')
  const r = await pool.query(
    `SELECT v.id, v.referencia, v.marca, v.modelo, v.matricula, v.kms,
            v.año AS anio, v.color, v.estado, v."precioPublicacion"${extra}
     FROM "Vehiculo" v
     WHERE UPPER(TRIM(COALESCE(v.estado, ''))) = 'PUBLICADO'
     ORDER BY v."createdAt" DESC, v.id DESC`
  )
  // Doble filtro: la normalización canónica manda (aliases/casing).
  return (r.rows as FilaStock[]).filter(
    (f) => normalizarEstado(f.estado) === 'PUBLICADO'
  )
}

function aPublico(fila: FilaStock, fotos: string[]): VehiculoPublico {
  return {
    id: fila.id,
    referencia: texto(fila.referencia) ?? '',
    marca: texto(fila.marca) ?? '',
    modelo: texto(fila.modelo) ?? '',
    version: texto(fila.version),
    anio: numero(fila.anio),
    kms: numero(fila.kms),
    combustible: texto(fila.combustible),
    cambio: texto(fila.cambio),
    color: texto(fila.color),
    precio: numero(fila.precioPublicacion),
    matricula: ocultarMatricula(fila.matricula),
    fotos,
    url: urlPublica(fila.id),
  }
}

function escXml(v: unknown): string {
  return String(v ?? '')
    .replace(CONTROL_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function aXml(generado: string, vehiculos: VehiculoPublico[]): string {
  const items = vehiculos
    .map((v) => {
      const campos = CAMPOS_XML.map((c) => `<${c}>${escXml(v[c])}</${c}>`).join(
        ''
      )
      const fotos = v.fotos.map((f) => `<foto>${escXml(f)}</foto>`).join('')
      return `<vehiculo>${campos}<fotos>${fotos}</fotos></vehiculo>`
    })
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<stock generado="${escXml(generado)}" total="${vehiculos.length}">` +
    `${items}</stock>`
  )
}

function sinCache(body: { error: string }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: NextRequest) {
  const tokenConfigurado = process.env.PUBLIC_FEED_TOKEN
  if (!tokenConfigurado) {
    return sinCache({ error: 'Feed no configurado' }, 503)
  }

  const url = new URL(request.url)
  const tokenRecibido =
    url.searchParams.get('token') ?? request.headers.get('x-feed-token')
  if (!safeEqual(tokenRecibido, tokenConfigurado)) {
    return sinCache({ error: 'Token no válido' }, 401)
  }

  try {
    const filas = await filasPublicadas()
    const hayBlob = !!process.env.BLOB_READ_WRITE_TOKEN
    const vehiculos = hayBlob
      ? await enLotes(filas, LOTE_BLOB, async (f) =>
          aPublico(f, await fotosDe(f))
        )
      : filas.map((f) => aPublico(f, []))

    const generado = new Date().toISOString()
    const headers: Record<string, string> = {
      'Cache-Control': CACHE_CONTROL,
      // La CDN cachea por URL: que una respuesta autenticada por cabecera no
      // se sirva a quien no la manda.
      Vary: 'X-Feed-Token',
    }

    if (url.searchParams.get('formato') === 'xml') {
      return new NextResponse(aXml(generado, vehiculos), {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/xml; charset=utf-8',
        },
      })
    }
    return NextResponse.json(
      { generado, total: vehiculos.length, vehiculos },
      { headers }
    )
  } catch (e) {
    console.error('public/stock error:', e)
    return sinCache({ error: 'Error generando el feed' }, 500)
  }
}
