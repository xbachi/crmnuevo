/**
 * Chequeo integral de expedientes de gestoría (puro, sin pg/googleapis).
 *
 * Cruza tres fuentes por trimestre, siempre matcheando por matrícula
 * normalizada:
 *   1. facturas activas en DB (invoices)
 *   2. carpetas de expedientes en OneDrive (snapshot en expedientes_carpetas)
 *   3. bandas de mes de la hoja "CB <año>" (Google Sheets)
 *
 * El descuadre estrella es `bandaIncorrecta`: coches cuya banda de CB no
 * coincide con el mes de su factura en DB (el error histórico de ventas de
 * abril contadas en la banda MARZO). Para eso la hoja se parsea ENTERA, no
 * sólo los meses del trimestre: la banda equivocada suele ser de otro mes.
 */

import { MESES, normPlate, isBand, isSubtotal } from '@/lib/costoBeneficioSheet'
import { canonPlate, type AliasIndex } from '@/lib/aliasMatriculas'
import {
  analizarCarpeta,
  docsFaltantes,
  indexarRegistros,
  type AlertaConflicto,
  type AlertaDuplicado,
  type ArchivoAmbiguo,
  type ArchivoExpediente,
  type DocsDetectados,
  type RegistroHash,
} from '@/lib/expedienteDocs'
import type { TipoOperacion } from '@/lib/expedienteChecklist'

export interface FacturaActiva {
  numero: string
  matricula: string | null
  fecha: string // ISO YYYY-MM-DD
}

export interface CarpetaSnapshot {
  mes: string
  carpeta: string
  matricula: string | null // matricula_norm del snapshot
  archivos: ArchivoExpediente[] // {nombre, bytes?, hash?} — hash falta en snapshots viejos
  scannedAt?: string | null
}

export interface CbCocheBanda {
  banda: string // nombre de banda (ENERO..DICIEMBRE)
  matricula: string // normalizada
  fila: number // 1-based en la hoja
}

/** Filas crudas de la hoja CB → coches con su banda de mes. */
export function parseCbBandas(rows: string[][]): CbCocheBanda[] {
  const out: CbCocheBanda[] = []
  let banda: string | null = null
  rows.forEach((row, i) => {
    if (isBand(row)) {
      banda = String(row[0] ?? '').trim().toUpperCase()
      return
    }
    if (isSubtotal(row)) {
      banda = null
      return
    }
    const plate = String(row?.[4] ?? '').trim()
    if (banda && plate) out.push({ banda, matricula: normPlate(plate), fila: i + 1 })
  })
  return out
}

/** Mes del snapshot ("abril", "04-Abril"...) → nombre de banda, o null. */
export function mesBanda(mes: string): string | null {
  const m = mes
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
  return (MESES as readonly string[]).find((name) => m.includes(name)) ?? null
}

export interface DescuadresMes {
  facturasSinCarpeta: { numero: string; matricula: string | null }[]
  carpetasSinFactura: string[]
  cbSinFactura: string[]
  facturaSinCb: { numero: string; matricula: string | null }[]
  bandaIncorrecta: { matricula: string; bandaCb: string; mesFactura: string }[]
}

export interface MesChequeo {
  mes: string
  numero: number // 1..12
  facturas: {
    count: number
    detalle: { numero: string; matricula: string | null; fecha: string }[]
  }
  carpetas: {
    verificable: boolean
    count: number | null
    nombres: string[]
    scannedAt: string | null
    nota?: string
  }
  cbBanda: {
    verificable: boolean
    count: number | null
    matriculas: string[]
    nota?: string
  }
  descuadres: DescuadresMes
  ok: boolean
}

export interface ExpedienteDocsCarpeta {
  mes: string
  carpeta: string
  matricula: string | null
  tipoOperacion: TipoOperacion | 'desconocido'
  docs: DocsDetectados
  faltantes: string[]
  duplicados: AlertaDuplicado[]
  mismoArchivoDosNombres: AlertaConflicto[]
  ambiguos: ArchivoAmbiguo[]
}

export interface ResultadoChequeo {
  year: number
  quarter: number
  meses: MesChequeo[]
  expedientesDocs: ExpedienteDocsCarpeta[]
  resumen: { ok: boolean; bloqueantes: string[]; notas: string[] }
}

export interface ChequeoArgs {
  year: number
  quarter: number
  facturas: FacturaActiva[] // activas del trimestre
  carpetas: CarpetaSnapshot[] | null // null = sin snapshot / tabla ausente
  cb: CbCocheBanda[] | null // null = hoja CB no legible; TODA la hoja
  tipos: Map<string, TipoOperacion> // matrícula normalizada → tipo_operacion
  registros?: RegistroHash[] | null // facturas_registro (hash de contenido) — opcional
  /** Historial de matrículas: la vieja y la nueva son el mismo coche. */
  alias?: AliasIndex | null
}

const SIN_SNAPSHOT = 'sin snapshot de OneDrive para el trimestre'

export function chequearExpedientes(args: ChequeoArgs): ResultadoChequeo {
  const { year, quarter, facturas, carpetas, cb, tipos, alias } = args
  // Toda comparación de matrícula pasa por la clave canónica del coche: si la
  // factura dice la provisional y la carpeta la definitiva, es el mismo coche.
  const canon = (p: string) => canonPlate(alias, p)
  const tiposCanon = new Map<string, TipoOperacion>()
  for (const [plate, tipo] of tipos) tiposCanon.set(canon(plate), tipo)

  // Índices globales del trimestre (matching por matrícula canónica).
  const mesesFactura = new Map<string, Set<string>>() // plate → bandas de sus facturas
  for (const f of facturas) {
    if (!f.matricula) continue
    const plate = canon(f.matricula)
    const idx = parseInt(String(f.fecha).slice(5, 7), 10) - 1
    if (idx < 0 || idx > 11) continue
    if (!mesesFactura.has(plate)) mesesFactura.set(plate, new Set())
    mesesFactura.get(plate)!.add(MESES[idx])
  }
  const cbPorPlate = new Map<string, string[]>() // plate → bandas donde figura
  for (const c of cb ?? []) {
    const plate = canon(c.matricula)
    if (!cbPorPlate.has(plate)) cbPorPlate.set(plate, [])
    cbPorPlate.get(plate)!.push(c.banda)
  }

  const bloqueantes: string[] = []
  const notas: string[] = []
  if (carpetas === null) notas.push(SIN_SNAPSHOT)
  if (cb === null) notas.push('hoja CB no legible — banda de mes no verificable')

  const meses: MesChequeo[] = []
  for (let numero = (quarter - 1) * 3 + 1; numero <= (quarter - 1) * 3 + 3; numero++) {
    const nombre = MESES[numero - 1]

    const factsMes = facturas.filter(
      (f) => parseInt(String(f.fecha).slice(5, 7), 10) === numero
    )
    const platesFact = new Set(
      factsMes.filter((f) => f.matricula).map((f) => canon(f.matricula!))
    )
    const carpMes = (carpetas ?? []).filter((c) => mesBanda(c.mes) === nombre)
    const carpPlates = new Set(
      carpMes.filter((c) => c.matricula).map((c) => canon(c.matricula!))
    )
    const cbMes = (cb ?? []).filter((c) => c.banda === nombre)

    const descuadres: DescuadresMes = {
      facturasSinCarpeta: [],
      carpetasSinFactura: [],
      cbSinFactura: [],
      facturaSinCb: [],
      bandaIncorrecta: [],
    }

    if (carpetas !== null) {
      descuadres.facturasSinCarpeta = factsMes
        .filter((f) => !f.matricula || !carpPlates.has(canon(f.matricula)))
        .map((f) => ({ numero: f.numero, matricula: f.matricula }))
      descuadres.carpetasSinFactura = carpMes
        .filter((c) => !c.matricula || !platesFact.has(canon(c.matricula)))
        .map((c) => c.carpeta)
    }

    if (cb !== null) {
      // En la banda del mes pero sin factura activa en TODO el trimestre.
      descuadres.cbSinFactura = [
        ...new Set(
          cbMes.filter((c) => !mesesFactura.has(canon(c.matricula))).map((c) => c.matricula)
        ),
      ]
      // Facturado este mes pero ausente en TODA la hoja.
      descuadres.facturaSinCb = factsMes
        .filter((f) => !f.matricula || !cbPorPlate.has(canon(f.matricula)))
        .map((f) => ({ numero: f.numero, matricula: f.matricula }))
      // Facturado este mes, presente en CB pero en OTRA banda (el detector
      // del error histórico marzo/abril).
      const vistos = new Set<string>()
      for (const f of factsMes) {
        if (!f.matricula) continue
        const plate = canon(f.matricula)
        if (vistos.has(plate)) continue // facturas duplicadas del mismo coche
        vistos.add(plate)
        const bandas = cbPorPlate.get(plate)
        if (bandas && !bandas.includes(nombre)) {
          descuadres.bandaIncorrecta.push({
            matricula: normPlate(f.matricula),
            bandaCb: [...new Set(bandas)].join('/'),
            mesFactura: nombre,
          })
        }
      }
    }

    const ok =
      descuadres.facturasSinCarpeta.length === 0 &&
      descuadres.carpetasSinFactura.length === 0 &&
      descuadres.cbSinFactura.length === 0 &&
      descuadres.facturaSinCb.length === 0 &&
      descuadres.bandaIncorrecta.length === 0

    if (descuadres.facturasSinCarpeta.length > 0)
      bloqueantes.push(`${nombre}: ${descuadres.facturasSinCarpeta.length} factura(s) sin carpeta en OneDrive`)
    if (descuadres.carpetasSinFactura.length > 0)
      bloqueantes.push(`${nombre}: ${descuadres.carpetasSinFactura.length} carpeta(s) sin factura activa`)
    if (descuadres.cbSinFactura.length > 0)
      bloqueantes.push(`${nombre}: ${descuadres.cbSinFactura.length} coche(s) en CB sin factura activa`)
    if (descuadres.facturaSinCb.length > 0)
      bloqueantes.push(`${nombre}: ${descuadres.facturaSinCb.length} factura(s) sin fila en CB`)
    for (const b of descuadres.bandaIncorrecta)
      bloqueantes.push(`${nombre}: ${b.matricula} facturado en ${b.mesFactura} pero en banda ${b.bandaCb} de CB`)

    const scannedAt = carpMes.find((c) => c.scannedAt)?.scannedAt ?? null
    meses.push({
      mes: nombre,
      numero,
      facturas: {
        count: factsMes.length,
        detalle: factsMes.map((f) => ({ numero: f.numero, matricula: f.matricula, fecha: f.fecha })),
      },
      carpetas:
        carpetas === null
          ? { verificable: false, count: null, nombres: [], scannedAt: null, nota: SIN_SNAPSHOT }
          : {
              verificable: true,
              count: carpMes.length,
              nombres: carpMes.map((c) => c.carpeta),
              scannedAt,
            },
      cbBanda:
        cb === null
          ? { verificable: false, count: null, matriculas: [], nota: 'hoja CB no legible' }
          : { verificable: true, count: cbMes.length, matriculas: cbMes.map((c) => c.matricula) },
      descuadres,
      ok,
    })
  }

  // Documentos por carpeta del snapshot: hash contra facturas_registro primero,
  // nombre como respaldo, y alertas de duplicados / mala clasificación / ambiguos.
  const hashes = indexarRegistros(args.registros)
  let carpetasConDuplicados = 0
  let archivosAmbiguos = 0
  const expedientesDocs: ExpedienteDocsCarpeta[] = (carpetas ?? []).map((c) => {
    const plate = c.matricula ? normPlate(c.matricula) : null
    const tipoOperacion = (plate && tiposCanon.get(canon(plate))) || 'desconocido'
    const { docs, duplicados, mismoArchivoDosNombres, ambiguos } = analizarCarpeta(
      c.archivos ?? [],
      { hashes, matricula: plate, alias }
    )
    const faltantes = docsFaltantes(tipoOperacion, docs)
    if (faltantes.length > 0)
      bloqueantes.push(`carpeta ${c.carpeta}: falta ${faltantes.join(', ')}`)
    // Mal clasificado = uno de los dos documentos NO existe → bloqueante.
    for (const m of mismoArchivoDosNombres)
      bloqueantes.push(
        `carpeta ${c.carpeta}: mismo archivo con dos nombres (${m.nombres.join(' = ')}) — uno de esos documentos no existe`
      )
    if (duplicados.length > 0) carpetasConDuplicados++
    archivosAmbiguos += ambiguos.length
    return {
      mes: c.mes,
      carpeta: c.carpeta,
      matricula: plate,
      tipoOperacion,
      docs,
      faltantes,
      duplicados,
      mismoArchivoDosNombres,
      ambiguos,
    }
  })
  if (carpetasConDuplicados > 0)
    notas.push(`${carpetasConDuplicados} carpeta(s) con archivos duplicados (mismo contenido guardado dos veces)`)
  if (archivosAmbiguos > 0)
    notas.push(`${archivosAmbiguos} archivo(s) sin clasificar — revisar a mano`)

  return {
    year,
    quarter,
    meses,
    expedientesDocs,
    resumen: { ok: bloqueantes.length === 0, bloqueantes, notas },
  }
}
