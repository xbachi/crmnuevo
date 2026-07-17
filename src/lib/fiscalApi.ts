/**
 * Serializadores del módulo /fiscal: fila de pg → JSON del contrato de la API.
 *
 * POR QUÉ EXISTE: el contrato lo consumen la bandeja (lista), la ficha (detalle)
 * y el validador, y tienen que devolver el MISMO objeto — si la lista dice
 * `importe: "1234.50"` y el detalle `importe: 1234.5`, la UI hace cuentas mal en
 * uno de los dos y nadie se entera hasta el 303.
 *
 * La regla que centraliza este archivo: **pg devuelve NUMERIC como string**. Un
 * `"1234.50"` suelto rompe cualquier suma en JS ("12" + "34" = "1234") — este bug
 * ya rompió las fórmulas de costoBeneficio. Todo importe pasa por `num()`.
 * Las fechas DATE se recortan a YYYY-MM-DD: sin hora no hay corrimiento de día
 * por timezone (otra fuente clásica de facturas "del mes anterior").
 */

/** NUMERIC/string de pg → number. null se preserva (null ≠ 0: "no sé" ≠ "cero"). */
export const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** DATE/timestamp de pg → 'YYYY-MM-DD'. */
export const fecha = (v: unknown): string | null => {
  if (v == null) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const s = String(v).trim()
  return s ? s.slice(0, 10) : null
}

const bool = (v: unknown): boolean | null => (v == null ? null : Boolean(v))

export type Row = Record<string, unknown>

/**
 * Fila de facturas_registro → item del contrato.
 * `lineas` es el CONTEO (la lista no manda el desglose); el detalle lo pisa con
 * el array completo.
 */
export function serializarRegistro(r: Row): Record<string, unknown> {
  return {
    id: Number(r.id),
    proveedor: r.proveedor ?? null,
    proveedorId: r.proveedor_id == null ? null : Number(r.proveedor_id),
    categoria: r.categoria ?? null,
    numeroFactura: r.numero_factura ?? null,
    importe: num(r.importe),
    fechaFactura: fecha(r.fecha_factura),
    fechaOperacion: fecha(r.fecha_operacion),
    anio: r.anio == null ? null : Number(r.anio),
    trimestre: r.trimestre == null ? null : Number(r.trimestre),
    mes: r.mes == null ? null : Number(r.mes),
    matricula: r.matricula ?? null,
    nombreArchivo: r.nombre_archivo ?? null,
    ruta: r.ruta ?? null,
    estado: r.estado ?? null,
    baseTotal: num(r.base_total),
    cuotaIvaTotal: num(r.cuota_iva_total),
    nifProveedor: r.nif_proveedor ?? null,
    nifValido: bool(r.nif_valido),
    tipoOperacion: r.tipo_operacion ?? null,
    deducible: r.deducible ?? null,
    deduciblePct: num(r.deducible_pct),
    subcategoriaGasto: r.subcategoria_gasto ?? null,
    datosIncompletos: Boolean(r.datos_incompletos),
    posibleDuplicado: Boolean(r.posible_duplicado),
    duplicadoDe: r.duplicado_de == null ? null : Number(r.duplicado_de),
    tardia: Boolean(r.tardia),
    extraccionMetodo: r.extraccion_metodo ?? null,
    extraccionConfianza: num(r.extraccion_confianza),
    anioDeclarado: r.anio_declarado == null ? null : Number(r.anio_declarado),
    trimestreDeclarado: r.trimestre_declarado == null ? null : Number(r.trimestre_declarado),
    lineas: r.lineas == null ? 0 : Number(r.lineas),
  }
}

/** Fila de facturas_registro_lineas → línea del contrato. */
export function serializarLinea(r: Row): Record<string, unknown> {
  return {
    id: Number(r.id),
    orden: Number(r.orden),
    tipoLinea: r.tipo_linea ?? null,
    tipoIva: num(r.tipo_iva),
    base: num(r.base),
    cuota: num(r.cuota),
    retencionPct: num(r.retencion_pct),
    concepto: r.concepto ?? null,
    deducible: r.deducible ?? null,
  }
}

/** Fila de proveedores → item del contrato. */
export function serializarProveedor(r: Row): Record<string, unknown> {
  return {
    id: Number(r.id),
    nombre: r.nombre ?? null,
    nif: r.nif ?? null,
    nifValido: bool(r.nif_valido),
    pais: r.pais ?? 'ES',
    aliases: Array.isArray(r.aliases) ? r.aliases : [],
    iban: r.iban ?? null,
    categoriaDefecto: r.categoria_defecto ?? null,
    tipoOperacionDefecto: r.tipo_operacion_defecto ?? null,
    deducibleDefecto: r.deducible_defecto ?? null,
    subcategoriaDefecto: r.subcategoria_defecto ?? null,
    validacionAuto: Boolean(r.validacion_auto),
    plantillaExtraccion: r.plantilla_extraccion ?? null,
    activo: Boolean(r.activo),
    ...(r.facturas !== undefined
      ? { facturas: Number(r.facturas), sinNif: r.nif == null || r.nif === '' }
      : {}),
  }
}
