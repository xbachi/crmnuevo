import { normalizarReferencia, refCarpeta } from '@/lib/normalizacion'

// Configuración de rutas para carpetas de vehículos según tipo
export const FOLDER_PATHS = {
  // Compra
  COMPRA: {
    COMPRAS:
      '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\3_Compras',
    VENTAS:
      '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\1_Ventas',
  },
  // Coche R
  COCHE_R: {
    VENTAS:
      '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\1_Ventas\\-----------Coches R',
    COMPRAS:
      '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\3_Compras\\-----------Coches R',
  },
  // Deposito Venta (Consignación)
  DEPOSITO_VENTA: {
    COMPRAS:
      '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\3_Compras\\###Consignacion',
    VENTAS:
      '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\1_Ventas\\-------Consignacion',
  },
}

export function generateFolderName(
  referencia: string,
  marca: string,
  modelo: string,
  matricula: string,
  tipo?: string
): string {
  const ref = String(referencia ?? '')
  // Fuera del rango 1000-1199 sin letra: últimos 2 dígitos, como siempre.
  const fallbackLegacy = (parseInt(ref.replace(/\D/g, ''), 10) % 100 || 0)
    .toString()
    .padStart(2, '0')
  const numeroCarpeta =
    refCarpeta(normalizarReferencia(ref, tipo)) ?? fallbackLegacy

  // Convertir a CamelCase: primera letra de cada palabra en mayúscula
  const marcaCamelCase = String(marca ?? '')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())
  const modeloCamelCase = String(modelo ?? '')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())

  // Matrícula en mayúsculas
  const matriculaMayuscula = String(matricula ?? '').toUpperCase()

  // Crear nombre de carpeta con formato: NumeroCarpeta-Marca-Modelo-Matricula
  return `${numeroCarpeta}-${marcaCamelCase}-${modeloCamelCase}-${matriculaMayuscula}`
}

export function getFolderPathsByTipo(
  tipo: string,
  folderName: string
): string[] {
  switch (tipo) {
    case 'Compra':
      return [
        `${FOLDER_PATHS.COMPRA.COMPRAS}\\${folderName}`,
        `${FOLDER_PATHS.COMPRA.VENTAS}\\${folderName}`,
      ]
    case 'Coche R':
      return [
        `${FOLDER_PATHS.COCHE_R.VENTAS}\\${folderName}`,
        `${FOLDER_PATHS.COCHE_R.COMPRAS}\\${folderName}`,
      ]
    case 'Deposito Venta':
      return [
        `${FOLDER_PATHS.DEPOSITO_VENTA.COMPRAS}\\${folderName}`,
        `${FOLDER_PATHS.DEPOSITO_VENTA.VENTAS}\\${folderName}`,
      ]
    default:
      return []
  }
}
