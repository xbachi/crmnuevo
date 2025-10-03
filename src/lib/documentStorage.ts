import { promises as fs } from 'fs'
import path from 'path'

const DOCUMENTS_DIR = path.join(process.cwd(), 'public', 'documents')

// Crear directorio de documentos si no existe
async function ensureDocumentsDir() {
  try {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creando directorio de documentos:', error)
  }
}

// Crear directorio específico para un deal
async function ensureDealDir(dealId: number) {
  const dealDir = path.join(DOCUMENTS_DIR, `deal-${dealId}`)
  try {
    await fs.mkdir(dealDir, { recursive: true })
    return dealDir
  } catch (error) {
    console.error(`Error creando directorio para deal ${dealId}:`, error)
    throw error
  }
}

// Obtener ruta de un documento específico
export function getDocumentPath(
  dealId: number,
  documentType: 'contrato-reserva' | 'contrato-venta' | 'factura',
  dealNumber: string
): string {
  const fileName = `${documentType}-${dealNumber}.pdf`
  return path.join(DOCUMENTS_DIR, `deal-${dealId}`, fileName)
}

// Verificar si un documento existe
export async function documentExists(
  dealId: number,
  documentType: 'contrato-reserva' | 'contrato-venta' | 'factura',
  dealNumber: string
): Promise<boolean> {
  try {
    const filePath = getDocumentPath(dealId, documentType, dealNumber)
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// Guardar un documento
export async function saveDocument(
  dealId: number,
  documentType: 'contrato-reserva' | 'contrato-venta' | 'factura',
  dealNumber: string,
  pdfBuffer: Buffer
): Promise<string> {
  await ensureDocumentsDir()

  let filePath: string
  let url: string

  if (dealId === 0) {
    // Factura independiente (sin deal)
    const fileName = `${documentType}-${dealNumber}.pdf`
    filePath = path.join(DOCUMENTS_DIR, fileName)
    url = `/documents/${fileName}`
  } else {
    // Documento de deal
    const dealDir = await ensureDealDir(dealId)
    const fileName = `${documentType}-${dealNumber}.pdf`
    filePath = path.join(dealDir, fileName)
    url = `/documents/deal-${dealId}/${fileName}`
  }

  await fs.writeFile(filePath, pdfBuffer)
  return url
}

// Obtener URL de descarga de un documento
export function getDocumentUrl(
  dealId: number,
  documentType: 'contrato-reserva' | 'contrato-venta' | 'factura',
  dealNumber: string
): string {
  return `/documents/deal-${dealId}/${documentType}-${dealNumber}.pdf`
}

// Eliminar un documento
export async function deleteDocument(
  dealId: number,
  documentType: 'contrato-reserva' | 'contrato-venta' | 'factura',
  dealNumber: string
): Promise<void> {
  try {
    const filePath = getDocumentPath(dealId, documentType, dealNumber)
    await fs.unlink(filePath)
  } catch (error) {
    console.error(
      `Error eliminando documento ${documentType} para deal ${dealId}:`,
      error
    )
  }
}

// Eliminar todos los documentos de un deal
export async function deleteDealDocuments(dealId: number): Promise<void> {
  try {
    const dealDir = path.join(DOCUMENTS_DIR, `deal-${dealId}`)
    await fs.rmdir(dealDir, { recursive: true })
  } catch (error) {
    console.error(`Error eliminando documentos del deal ${dealId}:`, error)
  }
}
