/**
 * Corrección de los datos fiscales de una factura de `facturas_registro`.
 *
 * POR QUÉ VIVE ACÁ Y NO EN LA ROUTE: dos endpoints hacen exactamente lo mismo con
 * el mismo body — PATCH /api/fiscal/registro/[id] (corregir) y POST .../validar
 * (corregir Y validar en un solo paso, que es como trabaja el humano en la
 * bandeja: ve el error, lo arregla, valida). Duplicar la lógica garantizaba que
 * un día divergieran y que "corregir" y "corregir+validar" dejaran la fila en
 * estados distintos. Una sola función, dos llamadores.
 *
 * Contrato con el llamador:
 *  · Recibe un PoolClient DENTRO de una transacción ya abierta (hace SELECT ...
 *    FOR UPDATE) y NO commitea: el llamador decide. Eso es lo que permite a
 *    /validar aplicar las correcciones, mirar el cuadre y hacer ROLLBACK si no da.
 *  · NO audita: devuelve `cambios` y el llamador llama a registrarCambio con la
 *    acción que corresponda ('editar' | 'correccion-post-declaracion' | 'validar').
 *
 * Filosofía de errores (heredada de facturaFiscal): un cuadre que no da NO es un
 * error de la petición. El humano está corrigiendo a mano, con el PDF delante; si
 * lo cortamos a mitad pierde el trabajo. El math KO viaja en `math.errores`, se
 * guarda con datos_incompletos=true, y es /validar quien decide rechazar.
 * Lo que SÍ corta (ValidacionError) es un valor que violaría un CHECK de la DB.
 */

import type { PoolClient } from 'pg'
import { parseImporte } from './gastoImporte'
import { validarNif } from './nifValidator'
import { periodoFromDate, normPlate, CATEGORIAS } from './facturasRegistro'
import { assertPeriodoAbierto } from './periodoLock'
import { assertRegistroMutable, diffCampos, type CambioCampo } from './fiscalAudit'
import {
  parseLineas,
  chequearMatematica,
  TIPOS_OPERACION,
  DEDUCIBLES,
  type LineaFiscal,
  type ChequeoMatematico,
} from './facturaFiscal'

/** Campos de la fila que nos interesan (la tabla tiene más). */
export type RegistroRow = Record<string, unknown> & { id: number; estado: string }

export class RegistroNoEncontradoError extends Error {
  constructor(public id: number) {
    super(`no existe la factura ${id} en el registro`)
    this.name = 'RegistroNoEncontradoError'
  }
}

/** Un valor del body violaría un CHECK de la DB → 400 antes de tocar nada. */
export class ValidacionError extends Error {
  constructor(public errores: string[]) {
    super(errores.join('; '))
    this.name = 'ValidacionError'
  }
}

export interface CorreccionBody {
  numeroFactura?: unknown
  importe?: unknown
  fechaFactura?: unknown
  fechaOperacion?: unknown
  matricula?: unknown
  proveedorId?: unknown
  nifProveedor?: unknown
  tipoOperacion?: unknown
  deducible?: unknown
  deduciblePct?: unknown
  subcategoriaGasto?: unknown
  categoria?: unknown
  lineas?: unknown
  motivo?: unknown
  force?: unknown
}

export interface ResultadoCorreccion {
  antes: RegistroRow
  despues: RegistroRow
  cambios: Record<string, CambioCampo>
  /** Cuadre contra el importe FINAL (con líneas nuevas si vinieron, si no las de la DB). */
  math: ChequeoMatematico
  lineas: LineaFiscal[]
  /** Avisos de parseo de líneas (líneas descartadas, orden reasignado…). */
  erroresLineas: string[]
  /** true si el body traía `lineas` y se reemplazó el desglose. */
  reemplazoLineas: boolean
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** '' → null. Cualquier otra cosa → string trim. */
function textoONull(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

function fechaValida(v: unknown, campo: string, errores: string[]): string | null | undefined {
  if (v === null || v === '') return null
  const s = String(v).trim().slice(0, 10)
  if (!ES_FECHA.test(s) || Number.isNaN(Date.parse(s))) {
    errores.push(`${campo} inválida: "${String(v)}" (formato esperado YYYY-MM-DD)`)
    return undefined
  }
  return s
}

/** Líneas ya guardadas, en el formato de facturaFiscal (NUMERIC → Number). */
async function leerLineas(client: PoolClient, registroId: number): Promise<LineaFiscal[]> {
  const res = await client.query(
    `SELECT orden, tipo_linea, tipo_iva, base, cuota, retencion_pct, concepto, deducible
       FROM facturas_registro_lineas
      WHERE registro_id = $1
      ORDER BY orden`,
    [registroId]
  )
  return res.rows.map((r) => ({
    orden: Number(r.orden),
    tipoLinea: r.tipo_linea,
    tipoIva: r.tipo_iva == null ? null : Number(r.tipo_iva),
    base: Number(r.base),
    cuota: Number(r.cuota),
    retencionPct: r.retencion_pct == null ? null : Number(r.retencion_pct),
    concepto: r.concepto,
    deducible: r.deducible,
  }))
}

/**
 * Aplica las correcciones sobre la fila `id`. Ver el comentario de cabecera para
 * el contrato (tx del llamador, sin commit, sin audit).
 *
 * @throws RegistroNoEncontradoError | RegistroInmutableError | PeriodoCerradoError | ValidacionError
 */
export async function aplicarCorrecciones(
  client: PoolClient,
  id: number,
  body: CorreccionBody
): Promise<ResultadoCorreccion> {
  const sel = await client.query(`SELECT * FROM facturas_registro WHERE id = $1 FOR UPDATE`, [id])
  if (sel.rows.length === 0) throw new RegistroNoEncontradoError(id)
  const antes = sel.rows[0] as RegistroRow

  const force = body.force === true || body.force === 'true'
  const motivo = textoONull(body.motivo)
  // Guarda de inmutabilidad: declarada/rectificada/anulada solo con force+motivo.
  assertRegistroMutable(antes, { force, motivo: motivo ?? undefined })

  const errores: string[] = []
  const set: Record<string, unknown> = {}

  // ── Identificación del documento ──────────────────────────────────────────
  if (body.numeroFactura !== undefined) set.numero_factura = textoONull(body.numeroFactura)

  if (body.categoria !== undefined) {
    const c = String(body.categoria ?? '').trim()
    if (!(CATEGORIAS as readonly string[]).includes(c)) {
      errores.push(`categoria inválida: "${c}" (válidas: ${CATEGORIAS.join(', ')})`)
    } else set.categoria = c
  }

  if (body.matricula !== undefined) {
    const m = textoONull(body.matricula)
    set.matricula = m ? normPlate(m) : null
  }

  // ── Importe ───────────────────────────────────────────────────────────────
  if (body.importe !== undefined) {
    if (body.importe === null || body.importe === '') set.importe = null
    else {
      const n = parseImporte(body.importe)
      if (n == null) errores.push(`importe no parseable: ${JSON.stringify(body.importe)}`)
      else set.importe = n
    }
  }

  // ── Fechas ────────────────────────────────────────────────────────────────
  const fechaFactura = body.fechaFactura !== undefined ? fechaValida(body.fechaFactura, 'fechaFactura', errores) : undefined
  if (fechaFactura !== undefined) set.fecha_factura = fechaFactura
  if (body.fechaOperacion !== undefined) {
    const f = fechaValida(body.fechaOperacion, 'fechaOperacion', errores)
    if (f !== undefined) set.fecha_operacion = f
  }

  // ── Proveedor + NIF ───────────────────────────────────────────────────────
  // El país sale de la ficha del proveedor FINAL (el nuevo si cambia): un NIF
  // alemán validado como español siempre daría inválido.
  let proveedorIdFinal = antes.proveedor_id == null ? null : Number(antes.proveedor_id)
  if (body.proveedorId !== undefined) {
    if (body.proveedorId === null || body.proveedorId === '') {
      errores.push('proveedorId no puede quedar vacío: toda factura necesita un proveedor identificado')
    } else {
      const pid = Number(body.proveedorId)
      if (!Number.isInteger(pid) || pid <= 0) {
        errores.push(`proveedorId inválido: ${JSON.stringify(body.proveedorId)}`)
      } else {
        const p = await client.query(`SELECT id, nombre FROM proveedores WHERE id = $1`, [pid])
        if (p.rows.length === 0) errores.push(`no existe el proveedor ${pid}`)
        else {
          set.proveedor_id = pid
          // `proveedor` (texto libre) es la columna vieja que aún alimenta el
          // dedup UNIQUE(proveedor, numero_factura): se mantiene en sincro con
          // el nombre canónico para que el dedup siga significando algo.
          set.proveedor = p.rows[0].nombre
          proveedorIdFinal = pid
        }
      }
    }
  }

  let paisProveedor = 'ES'
  if (proveedorIdFinal != null) {
    const p = await client.query(`SELECT pais FROM proveedores WHERE id = $1`, [proveedorIdFinal])
    if (p.rows.length > 0) paisProveedor = String(p.rows[0].pais ?? 'ES')
  }

  if (body.nifProveedor !== undefined) {
    const nif = textoONull(body.nifProveedor)
    if (!nif) {
      set.nif_proveedor = null
      set.nif_valido = null // NULL = sin verificar, distinto de false = inválido
    } else {
      const v = validarNif(nif, paisProveedor)
      set.nif_proveedor = v.normalizado
      set.nif_valido = v.valido
    }
  }

  // ── Clasificación fiscal ──────────────────────────────────────────────────
  if (body.tipoOperacion !== undefined) {
    const t = String(body.tipoOperacion ?? '').trim().toLowerCase()
    if (!(TIPOS_OPERACION as readonly string[]).includes(t)) {
      errores.push(`tipoOperacion inválido: "${t}" (válidos: ${TIPOS_OPERACION.join(', ')})`)
    } else set.tipo_operacion = t
  }

  if (body.deducible !== undefined) {
    const d = String(body.deducible ?? '').trim().toLowerCase()
    if (!(DEDUCIBLES as readonly string[]).includes(d)) {
      errores.push(`deducible inválido: "${d}" (válidos: ${DEDUCIBLES.join(', ')})`)
    } else set.deducible = d
  }

  if (body.deduciblePct !== undefined) {
    if (body.deduciblePct === null || body.deduciblePct === '') set.deducible_pct = null
    else {
      const n = Number(body.deduciblePct)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errores.push(`deduciblePct inválido: ${JSON.stringify(body.deduciblePct)} (0..100)`)
      } else set.deducible_pct = n
    }
  }

  if (body.subcategoriaGasto !== undefined) set.subcategoria_gasto = textoONull(body.subcategoriaGasto)

  if (errores.length > 0) throw new ValidacionError(errores)

  // ── Guarda de período ─────────────────────────────────────────────────────
  // Solo si la fecha CAMBIA de verdad: revalidar una fecha que ya estaba ahí
  // bloquearía corregir el NIF de una factura de un mes ya cerrado.
  if (set.fecha_factura !== undefined) {
    const previa = antes.fecha_factura ? String(antes.fecha_factura).slice(0, 10) : null
    const nueva = set.fecha_factura as string | null
    if (nueva !== previa && nueva != null) {
      await assertPeriodoAbierto(client, nueva, 'no se puede mover la factura a ese período')
    }
  }

  // ── Período natural + imputación ──────────────────────────────────────────
  if (set.fecha_factura !== undefined) {
    const per = periodoFromDate(set.fecha_factura as string | null)
    const anioViejo = antes.anio == null ? null : Number(antes.anio)
    const trimViejo = antes.trimestre == null ? null : Number(antes.trimestre)
    set.anio = per.anio
    set.trimestre = per.trimestre
    set.mes = per.mes
    // El período de imputación se arrastra SOLO si seguía pegado al natural. Si
    // alguien ya lo imputó a otro trimestre a mano (factura tardía), esa decisión
    // es deliberada y vale más que el recálculo automático.
    const decAnio = antes.anio_declarado == null ? null : Number(antes.anio_declarado)
    const decTrim = antes.trimestre_declarado == null ? null : Number(antes.trimestre_declarado)
    if (decAnio === anioViejo && decTrim === trimViejo) {
      set.anio_declarado = per.anio
      set.trimestre_declarado = per.trimestre
    }
  }

  // ── Líneas ────────────────────────────────────────────────────────────────
  const reemplazoLineas = body.lineas !== undefined
  let lineas: LineaFiscal[]
  let erroresLineas: string[] = []

  if (reemplazoLineas) {
    const parsed = parseLineas(body.lineas)
    lineas = parsed.lineas
    erroresLineas = parsed.errores
  } else {
    lineas = await leerLineas(client, id)
  }

  const importeFinal =
    set.importe !== undefined
      ? (set.importe as number | null)
      : antes.importe == null
        ? null
        : Number(antes.importe) // pg devuelve NUMERIC como string
  const math = chequearMatematica(lineas, importeFinal)

  if (reemplazoLineas) {
    set.base_total = math.baseTotal
    set.cuota_iva_total = math.cuotaTotal
    // Cuadre KO → se guarda igual, pero marcado. Ver cabecera.
    set.datos_incompletos = !math.ok
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  const campos = Object.keys(set)
  let despues = antes
  if (campos.length > 0) {
    const sets = campos.map((c, i) => `${c} = $${i + 2}`)
    const upd = await client.query(
      `UPDATE facturas_registro SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, ...campos.map((c) => set[c])]
    )
    despues = upd.rows[0] as RegistroRow
  }

  if (reemplazoLineas) {
    await client.query(`DELETE FROM facturas_registro_lineas WHERE registro_id = $1`, [id])
    for (const l of lineas) {
      await client.query(
        `INSERT INTO facturas_registro_lineas
           (registro_id, orden, tipo_linea, tipo_iva, base, cuota, retencion_pct, concepto, deducible)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, l.orden, l.tipoLinea, l.tipoIva, l.base, l.cuota, l.retencionPct ?? null, l.concepto ?? null, l.deducible ?? null]
      )
    }
  }

  // Diff solo de los campos tocados: el llamador lo manda a fiscal_audit_log.
  const cambios = diffCampos(
    antes as Record<string, unknown>,
    Object.fromEntries(campos.map((c) => [c, set[c]]))
  )

  return { antes, despues, cambios, math, lineas, erroresLineas, reemplazoLineas }
}
