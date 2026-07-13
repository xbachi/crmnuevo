/**
 * Piezas puras del expediente de venta (sin pg, testeables).
 *
 * Un expediente ("deal jacket") agrupa los documentos que la gestoría necesita
 * por cada venta. La checklist depende del tipo de operación (cómo se VENDIÓ):
 *   · retail-vat  → venta con IVA general
 *   · retail-rebu → venta en REBU
 *   · b2b         → venta a empresa
 *   · deposito    → coche en depósito/consignación (no se compró: no hay
 *                   justificante de compra que exigir)
 *
 * JUSTIFICANTE DE COMPRA — el régimen de VENTA no decide qué documento de
 * COMPRA tiene el coche: eso depende de a QUIÉN se le compró.
 *   · comprado a una empresa (Ayvens, Arval, Auto1…) → FACTURA de compra
 *   · comprado a un particular                        → CONTRATO de compraventa
 *     (un particular no emite facturas: no existe tal documento)
 * Por eso los dos items van en el GRUPO 'justificante-compra': se satisface con
 * CUALQUIERA de los dos, y sólo falta si no hay NINGUNO. Antes se exigía
 * 'factura-compra' a todo retail-vat, y un coche de particular vendido con IVA
 * (caso VW Taigo 3835LWT) figuraba eternamente como "falta factura de compra"
 * pidiendo un papel que no puede existir.
 *
 * Regla dura: un expediente incompleto NUNCA se considera finalizado —
 * evaluarEstado degrada a 'incompleto' cualquier estado (completo/enviado/
 * confirmado) si falta un requerido.
 */

export const TIPOS_OPERACION = [
  'retail-vat',
  'retail-rebu',
  'b2b',
  'deposito',
] as const
export type TipoOperacion = (typeof TIPOS_OPERACION)[number]

export const ESTADOS_EXPEDIENTE = [
  'incompleto',
  'completo',
  'enviado',
  'confirmado',
  // Factura rectificada (anulada con una FR): el expediente deja de ser un
  // pendiente del trimestre. Terminal — el recálculo no lo degrada.
  'anulado',
] as const
export type EstadoExpediente = (typeof ESTADOS_EXPEDIENTE)[number]

export interface ChecklistItemDef {
  clave: string
  label: string
  requerido: boolean
  /** Items alternativos: basta con que UNO del grupo esté presente. */
  grupo?: string
}

export interface ChecklistItem extends ChecklistItemDef {
  presente: boolean
  nota?: string | null
}

/** Grupo "al menos uno": factura de compra (empresa) O contrato (particular). */
export const GRUPO_JUSTIFICANTE_COMPRA = 'justificante-compra'

/** Etiqueta legible de una clave faltante (item suelto o grupo). */
export function faltanteLabel(clave: string): string {
  if (clave === GRUPO_JUSTIFICANTE_COMPRA) {
    return 'Justificante de compra (factura de compra o contrato de compraventa)'
  }
  return ITEM_LABELS[clave] ?? clave
}

export const TIPO_OPERACION_LABEL: Record<TipoOperacion, string> = {
  'retail-vat': 'Retail IVA',
  'retail-rebu': 'Retail REBU',
  b2b: 'B2B',
  deposito: 'Depósito',
}

const ITEM_LABELS: Record<string, string> = {
  'factura-venta': 'Factura de venta',
  'contrato-venta': 'Contrato de venta',
  'factura-compra': 'Factura de compra',
  'contrato-compra': 'Contrato de compra',
  'contrato-deposito': 'Contrato de depósito',
}

const item = (
  clave: string,
  requerido: boolean,
  grupo?: string
): ChecklistItemDef => ({
  clave,
  label: ITEM_LABELS[clave] ?? clave,
  requerido,
  ...(grupo ? { grupo } : {}),
})

/** Los dos justificantes de compra posibles, como grupo "al menos uno". */
const justificanteCompra = (): ChecklistItemDef[] => [
  item('factura-compra', true, GRUPO_JUSTIFICANTE_COMPRA),
  item('contrato-compra', true, GRUPO_JUSTIFICANTE_COMPRA),
]

/** Checklist de documentos por tipo de operación (definición, sin estado). */
export function checklistRequerida(tipo: TipoOperacion): ChecklistItemDef[] {
  // El contrato de compraventa con el COMPRADOR solo existe en REBU a
  // particular y en depósito (regla del negocio); en ventas con IVA y B2B la
  // factura es el documento de la operación (contrato opcional si aparece).
  // El justificante de COMPRA, en cambio, no lo decide el régimen de venta.
  switch (tipo) {
    case 'retail-vat':
      return [
        item('factura-venta', true),
        item('contrato-venta', false),
        ...justificanteCompra(),
      ]
    case 'retail-rebu':
      return [
        item('factura-venta', true),
        item('contrato-venta', true),
        ...justificanteCompra(),
      ]
    case 'b2b':
      return [
        item('factura-venta', true),
        item('contrato-venta', false),
        ...justificanteCompra(),
      ]
    case 'deposito':
      // El coche no se compró (es del propietario): no hay justificante de
      // compra. El contrato de depósito es un acuerdo interno: la gestoría no
      // lo necesita en el expediente (regla del negocio).
      return [
        item('factura-venta', true),
        item('contrato-venta', true),
        item('contrato-deposito', false),
      ]
  }
}

/** Checklist inicial al emitir: todos los items presentes=false. */
export function checklistInicial(tipo: TipoOperacion): ChecklistItem[] {
  return checklistRequerida(tipo).map((def) => ({ ...def, presente: false }))
}

/** ¿Hay algún item del grupo presente? */
const grupoSatisfecho = (checklist: ChecklistItem[], grupo: string): boolean =>
  checklist.some((i) => i.grupo === grupo && i.presente)

/**
 * ¿ESTE item cuenta como faltante? Un item de un grupo "al menos uno" no falta
 * si otro del grupo está presente (el contrato cubre a la factura de compra y
 * viceversa) — la UI lo usa para no pintar en rojo un papel que no hace falta.
 */
export function itemFalta(
  checklist: ChecklistItem[],
  item: ChecklistItem
): boolean {
  if (item.presente || !item.requerido) return false
  if (item.grupo) return !grupoSatisfecho(checklist, item.grupo)
  return true
}

/**
 * Claves requeridas que faltan. Los items sueltos se reportan por su clave;
 * un grupo "al menos uno" sin ningún documento se reporta UNA vez por la clave
 * del grupo ('justificante-compra'), no por cada alternativa.
 */
export function faltanRequeridos(checklist: ChecklistItem[]): string[] {
  const faltantes: string[] = []
  const gruposVistos = new Set<string>()
  for (const i of checklist) {
    if (!i.requerido || i.presente) continue
    if (i.grupo) {
      if (gruposVistos.has(i.grupo)) continue
      gruposVistos.add(i.grupo)
      if (!grupoSatisfecho(checklist, i.grupo)) faltantes.push(i.grupo)
      continue
    }
    faltantes.push(i.clave)
  }
  return faltantes
}

/**
 * Estado derivado de la checklist.
 *  - 'anulado' (factura rectificada) es terminal: se conserva.
 *  - Falta algún requerido → 'incompleto' SIEMPRE (aunque estuviera en
 *    enviado/confirmado: se degrada — un expediente incompleto nunca está
 *    finalizado).
 *  - Todo requerido presente → si estaba 'incompleto' avanza a 'completo';
 *    los estados manuales posteriores (enviado/confirmado) se conservan.
 */
export function evaluarEstado(
  checklist: ChecklistItem[],
  estadoActual: EstadoExpediente = 'incompleto'
): EstadoExpediente {
  // 'anulado' es terminal: la factura ya no existe operativamente, no tiene
  // sentido exigirle documentos.
  if (estadoActual === 'anulado') return 'anulado'
  if (faltanRequeridos(checklist).length > 0) return 'incompleto'
  return estadoActual === 'incompleto' ? 'completo' : estadoActual
}

/** Detecta un vehículo en depósito/consignación por su Vehiculo.tipo
 *  ("Deposito Venta", "Deposito", "D", variantes con acento). */
export function esDepositoVehiculoTipo(
  tipo: string | null | undefined
): boolean {
  if (!tipo) return false
  const t = tipo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return t === 'd' || t.includes('deposito') || t.includes('consignacion')
}

/**
 * Tipo de operación a partir de lo que sabe el emisor.
 * Prioridad: depósito (el justificante de compra es el contrato de depósito,
 * sea retail o B2B) > B2B > tipo de factura (REBU → retail-rebu, resto → retail-vat).
 */
export function inferirTipoOperacion(args: {
  invoiceType?: string | null
  esB2B?: boolean
  esDeposito?: boolean
}): TipoOperacion {
  if (args.esDeposito) return 'deposito'
  if (args.esB2B) return 'b2b'
  return args.invoiceType === 'REBU' ? 'retail-rebu' : 'retail-vat'
}
