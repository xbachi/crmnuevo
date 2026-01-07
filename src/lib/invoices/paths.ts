import type { ExpenseCategory } from './domain'
import type { Vehiculo } from '@prisma/client'
import { CATEGORY_TO_SUBPATH, ONE_DRIVE_FOLDERS } from './constants'

export function formatYearMonth(d = new Date()) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

export function expedienteFolderNameForVehiculo(
  v: Pick<Vehiculo, 'matricula' | 'referencia'>
) {
  const matricula = (v.matricula || '').trim().toUpperCase()
  const ref = (v.referencia || '').trim()
  return ref ? `${matricula} - ${ref}` : matricula
}

export function buildExpedienteDestinationPath(params: {
  vehiculo: Pick<Vehiculo, 'matricula' | 'referencia'>
  category: ExpenseCategory
  filename: string
}) {
  const folderName = expedienteFolderNameForVehiculo(params.vehiculo)
  const sub = CATEGORY_TO_SUBPATH[params.category]
  return `${ONE_DRIVE_FOLDERS.EXPEDIENTES}/${folderName}/${sub}/${params.filename}`
}
