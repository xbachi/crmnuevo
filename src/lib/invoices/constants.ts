import type { ExpenseCategory } from './domain'

export const DEFAULT_ROOT = '/Concesionaria'

export const ONE_DRIVE_FOLDERS = {
  INBOX: (ym: string) => `${DEFAULT_ROOT}/FACTURAS_INBOX/${ym}`,
  DUPLICADAS: `${DEFAULT_ROOT}/FACTURAS_DUPLICADAS`,
  PENDIENTES: `${DEFAULT_ROOT}/FACTURAS_PENDIENTES`,
  EXPEDIENTES: `${DEFAULT_ROOT}/EXPEDIENTES`,
} as const

export const CATEGORY_TO_SUBPATH: Record<ExpenseCategory, string> = {
  limpieza: '02_Reacond/limpieza',
  pintura: '02_Reacond/pintura',
  taller: '02_Reacond/taller',
  transporte: '03_transporte',
  gestoria: '04_gestoria',
  otro: '99_otro',
}

export const CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  limpieza: ['limpieza', 'lavado', 'detailing', 'aspirado', 'desinfeccion'],
  pintura: ['pintura', 'chapisteria', 'chapa', 'barniz', 'pulido'],
  taller: [
    'taller',
    'mecanica',
    'mecánica',
    'reparacion',
    'reparación',
    'cambio',
    'aceite',
    'filtro',
    'neumatico',
    'neumático',
  ],
  transporte: [
    'transporte',
    'grua',
    'grúa',
    'logistica',
    'logística',
    'portacoches',
    'recogida',
    'entrega',
  ],
  gestoria: [
    'gestoria',
    'gestoría',
    'transferencia',
    'dgt',
    'tasas',
    'matriculacion',
    'matriculación',
  ],
  otro: [],
}
