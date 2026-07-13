/**
 * Piezas puras del expediente de venta (sin pg, testeables).
 *
 * Un expediente ("deal jacket") agrupa los documentos que la gestoría necesita
 * por cada venta. La checklist requerida depende del tipo de operación:
 *   · retail-vat  → coche con factura de compra
 *   · retail-rebu → coche comprado a particular (contrato de compra, no factura)
 *   · b2b         → venta a empresa (factura de compra requerida; contrato opcional)
 *   · deposito    → coche en depósito/consignación (contrato de depósito)
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
}

export interface ChecklistItem extends ChecklistItemDef {
  presente: boolean
  nota?: string | null
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

const item = (clave: string, requerido: boolean): ChecklistItemDef => ({
  clave,
  label: ITEM_LABELS[clave] ?? clave,
  requerido,
})

/** Checklist de documentos por tipo de operación (definición, sin estado). */
export function checklistRequerida(tipo: TipoOperacion): ChecklistItemDef[] {
  // El contrato de compraventa con el comprador solo existe en REBU a
  // particular y en depósito (regla del negocio); en ventas con IVA y B2B la
  // factura es el documento de la operación (contrato opcional si aparece).
  switch (tipo) {
    case 'retail-vat':
      return [item('factura-venta', true), item('contrato-venta', false), item('factura-compra', true)]
    case 'retail-rebu':
      // Comprado a particular → el justificante de compra es un CONTRATO.
      return [item('factura-venta', true), item('contrato-venta', true), item('contrato-compra', true)]
    case 'b2b':
      return [item('factura-venta', true), item('contrato-venta', false), item('factura-compra', true), item('contrato-compra', false)]
    case 'deposito':
      // El contrato de depósito es un acuerdo interno con el propietario: la
      // gestoría no lo necesita en el expediente (regla del negocio).
      return [item('factura-venta', true), item('contrato-venta', true), item('contrato-deposito', false)]
  }
}

/** Checklist inicial al emitir: todos los items presentes=false. */
export function checklistInicial(tipo: TipoOperacion): ChecklistItem[] {
  return checklistRequerida(tipo).map((def) => ({ ...def, presente: false }))
}

/** Claves de items requeridos que faltan. */
export function faltanRequeridos(checklist: ChecklistItem[]): string[] {
  return checklist.filter((i) => i.requerido && !i.presente).map((i) => i.clave)
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
export function esDepositoVehiculoTipo(tipo: string | null | undefined): boolean {
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
