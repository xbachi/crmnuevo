export interface ResyncCostoBeneficioParams {
  year: number
  tab: string
  dryRun: boolean
  confirmed: boolean
  mode: 'fill' | 'overwrite'
  reorderApril: boolean
  clearCompra: string
  destructiveActions: string[]
}

const ALLOWED_PARAMS = new Set([
  'year',
  'tab',
  'dryRun',
  'confirm',
  'mode',
  'reorderApril',
  'clearCompra',
])

function singleValue(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name)
  if (values.length > 1) {
    throw new Error(`parámetro repetido: ${name}`)
  }
  return values[0] ?? null
}

function booleanValue(
  params: URLSearchParams,
  name: string,
  fallback = false
): boolean {
  const value = singleValue(params, name)
  if (value == null) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} debe ser "true" o "false"`)
}

export function parseResyncCostoBeneficioParams(
  params: URLSearchParams,
  currentYear: number
): ResyncCostoBeneficioParams {
  for (const name of params.keys()) {
    if (!ALLOWED_PARAMS.has(name)) {
      throw new Error(`parámetro desconocido: ${name}`)
    }
  }

  const yearRaw = singleValue(params, 'year')
  const year = yearRaw == null ? currentYear : Number(yearRaw)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('year debe ser un entero entre 2000 y 2100')
  }

  const tab = singleValue(params, 'tab')?.trim() || `CB ${year}`
  const dryRun = booleanValue(params, 'dryRun')
  const confirmed = booleanValue(params, 'confirm')
  const reorderApril = booleanValue(params, 'reorderApril')
  const modeRaw = singleValue(params, 'mode') ?? 'fill'
  if (modeRaw !== 'fill' && modeRaw !== 'overwrite') {
    throw new Error('mode debe ser "fill" u "overwrite"')
  }
  const mode = modeRaw
  const clearCompra = singleValue(params, 'clearCompra')?.trim() ?? ''

  const destructiveActions: string[] = []
  if (mode === 'overwrite') destructiveActions.push('overwrite')
  if (reorderApril) destructiveActions.push('reorderApril')
  if (clearCompra) destructiveActions.push('clearCompra')

  if (clearCompra && (mode === 'overwrite' || reorderApril)) {
    throw new Error(
      'clearCompra no se puede combinar con overwrite ni reorderApril'
    )
  }

  if (destructiveActions.length > 0 && !dryRun && !confirmed) {
    throw new Error(
      `acción destructiva sin confirmación: ${destructiveActions.join(', ')}; usá dryRun=true o confirm=true`
    )
  }

  return {
    year,
    tab,
    dryRun,
    confirmed,
    mode,
    reorderApril,
    clearCompra,
    destructiveActions,
  }
}
