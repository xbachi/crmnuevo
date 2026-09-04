/**
 * documentStorage: la escritura va SIEMPRE a Vercel Blob (el disco de Vercel
 * es efímero); lectura y borrado aceptan tanto la referencia Blob (https://…)
 * como el nombre de archivo legacy que quedó en public/documents/.
 */

jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }))
jest.mock('fs', () => ({
  promises: { readFile: jest.fn(), unlink: jest.fn() },
}))

import path from 'path'
import { promises as fs } from 'fs'
import { del, put } from '@vercel/blob'
import {
  buildBlobPath,
  deleteDocument,
  DocumentNotAvailableError,
  isBlobRef,
  LEGACY_NOT_AVAILABLE_MESSAGE,
  readDocument,
  saveDocument,
  type DocumentLocator,
} from '@/lib/documentStorage'

const mockedPut = put as jest.Mock
const mockedDel = del as jest.Mock
const mockedReadFile = fs.readFile as unknown as jest.Mock
const mockedUnlink = fs.unlink as unknown as jest.Mock
const mockedFetch = jest.fn()

const LEGACY_DEAL_DIR = path.join(
  process.cwd(),
  'public',
  'documents',
  'deal-42'
)
const BLOB_URL =
  'https://x.public.blob.vercel-storage.com/documentos/42/contrato-reserva-DEAL-0007-1-abc.pdf'

const locator: DocumentLocator = {
  dealId: 42,
  documentType: 'contrato-reserva',
  dealNumber: 'DEAL-0007',
}

function enoent(): NodeJS.ErrnoException {
  const error = new Error('ENOENT') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return error
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(global as unknown as { fetch: jest.Mock }).fetch = mockedFetch
})

describe('isBlobRef', () => {
  it('distingue URL de Blob de nombre legacy', () => {
    expect(isBlobRef(BLOB_URL)).toBe(true)
    expect(isBlobRef('contrato-reserva-DEAL-0007.pdf')).toBe(false)
    expect(isBlobRef(null)).toBe(false)
    expect(isBlobRef(undefined)).toBe(false)
  })
})

describe('saveDocument', () => {
  it('sube a Blob con sufijo aleatorio y devuelve url + pathname', async () => {
    mockedPut.mockResolvedValue({
      url: BLOB_URL,
      pathname: 'documentos/42/contrato-reserva-DEAL-0007-1-abc.pdf',
    })

    const result = await saveDocument(locator, Buffer.from('%PDF-1.4'))

    expect(mockedPut).toHaveBeenCalledTimes(1)
    const [blobPath, body, options] = mockedPut.mock.calls[0]
    expect(blobPath).toMatch(
      /^documentos\/42\/contrato-reserva-DEAL-0007-\d+\.pdf$/
    )
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(options).toEqual({
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true,
    })
    expect(result).toEqual({
      url: BLOB_URL,
      pathname: 'documentos/42/contrato-reserva-DEAL-0007-1-abc.pdf',
    })
  })

  it('los documentos sueltos (dealId 0) van a documentos/sueltos/', () => {
    expect(buildBlobPath({ ...locator, dealId: 0 }, 5)).toBe(
      'documentos/sueltos/contrato-reserva-DEAL-0007-5.pdf'
    )
  })

  it('sanea el número de deal en la ruta del Blob', () => {
    expect(buildBlobPath({ ...locator, dealNumber: 'DEAL/00 7' }, 5)).toBe(
      'documentos/42/contrato-reserva-DEAL-00-7-5.pdf'
    )
  })

  it('propaga el error de put (no hay fallback a disco)', async () => {
    mockedPut.mockRejectedValue(new Error('No token'))
    await expect(saveDocument(locator, Buffer.from('x'))).rejects.toThrow(
      'No token'
    )
  })
})

describe('readDocument', () => {
  it('referencia Blob: descarga en servidor con fetch y no toca el disco', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })

    const buffer = await readDocument(BLOB_URL, locator)

    expect(mockedFetch).toHaveBeenCalledWith(BLOB_URL)
    expect(Array.from(buffer)).toEqual([1, 2, 3])
    expect(mockedReadFile).not.toHaveBeenCalled()
  })

  it('referencia Blob no recuperable: error tipado no legacy', async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 404 })

    await expect(readDocument(BLOB_URL, locator)).rejects.toMatchObject({
      name: 'DocumentNotAvailableError',
      code: 'DOCUMENT_NOT_AVAILABLE',
      legacy: false,
    })
  })

  it('nombre legacy: lee de public/documents/deal-<id>/ sin usar fetch', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('legacy-pdf'))

    const buffer = await readDocument(
      'contrato-reserva-DEAL-0007-1712345.pdf',
      locator
    )

    expect(buffer.toString()).toBe('legacy-pdf')
    expect(mockedReadFile).toHaveBeenCalledWith(
      path.join(LEGACY_DEAL_DIR, 'contrato-reserva-DEAL-0007-1712345.pdf')
    )
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('nombre legacy ausente: cae al nombre canónico <tipo>-<numero>.pdf', async () => {
    mockedReadFile
      .mockRejectedValueOnce(enoent())
      .mockResolvedValueOnce(Buffer.from('canonico'))

    const buffer = await readDocument('contrato-reserva-otro.pdf', locator)

    expect(buffer.toString()).toBe('canonico')
    expect(mockedReadFile).toHaveBeenLastCalledWith(
      path.join(LEGACY_DEAL_DIR, 'contrato-reserva-DEAL-0007.pdf')
    )
  })

  it('sin referencia (null): solo prueba el nombre canónico', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('ok'))

    await readDocument(null, locator)

    expect(mockedReadFile).toHaveBeenCalledTimes(1)
    expect(mockedReadFile).toHaveBeenCalledWith(
      path.join(LEGACY_DEAL_DIR, 'contrato-reserva-DEAL-0007.pdf')
    )
  })

  it('legacy inexistente: DocumentNotAvailableError con mensaje de migración', async () => {
    mockedReadFile.mockRejectedValue(enoent())

    const promise = readDocument('contrato-reserva-DEAL-0007.pdf', locator)

    await expect(promise).rejects.toBeInstanceOf(DocumentNotAvailableError)
    await expect(promise).rejects.toMatchObject({
      legacy: true,
      message: LEGACY_NOT_AVAILABLE_MESSAGE,
    })
  })

  it('la referencia legacy nunca sale del directorio del deal', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('ok'))

    await readDocument('../../../etc/passwd.pdf', locator)

    for (const [called] of mockedReadFile.mock.calls) {
      expect(String(called).startsWith(LEGACY_DEAL_DIR + path.sep)).toBe(true)
    }
    expect(mockedReadFile).toHaveBeenCalledWith(
      path.join(LEGACY_DEAL_DIR, 'passwd.pdf')
    )
  })

  it('un error de disco distinto de ENOENT se propaga', async () => {
    mockedReadFile.mockRejectedValue(new Error('EACCES'))

    await expect(readDocument('x.pdf', locator)).rejects.toThrow('EACCES')
  })
})

describe('deleteDocument', () => {
  it('referencia Blob: del(url) y no toca el disco', async () => {
    mockedDel.mockResolvedValue(undefined)

    await deleteDocument(BLOB_URL, locator)

    expect(mockedDel).toHaveBeenCalledWith(BLOB_URL)
    expect(mockedUnlink).not.toHaveBeenCalled()
  })

  it('nombre legacy: unlink en public/documents y un ENOENT no es error', async () => {
    mockedUnlink.mockRejectedValue(enoent())

    await expect(
      deleteDocument('contrato-reserva-DEAL-0007-9.pdf', locator)
    ).resolves.toBeUndefined()

    expect(mockedUnlink).toHaveBeenCalledWith(
      path.join(LEGACY_DEAL_DIR, 'contrato-reserva-DEAL-0007-9.pdf')
    )
    expect(mockedUnlink).toHaveBeenCalledWith(
      path.join(LEGACY_DEAL_DIR, 'contrato-reserva-DEAL-0007.pdf')
    )
    expect(mockedDel).not.toHaveBeenCalled()
  })

  it('un fallo de del en Blob se propaga', async () => {
    mockedDel.mockRejectedValue(new Error('blob down'))

    await expect(deleteDocument(BLOB_URL, locator)).rejects.toThrow('blob down')
  })
})
