import * as pdfParseImport from 'pdf-parse'

export async function extractPdfText(pdfBytes: Buffer) {
  // pdf-parse typings vary by version (CJS/ESM). Normalize to callable fn.
  const pdfParse: any = (pdfParseImport as any)?.default
    ? (pdfParseImport as any).default
    : (pdfParseImport as any)

  // pdf-parse returns { text, numpages, info, metadata, version }
  const result = await pdfParse(pdfBytes)
  const text = (result.text || '').trim()
  return {
    text,
    hasText: text.length > 30, // heuristic
    meta: {
      numpages: result.numpages,
      info: result.info,
      metadata: result.metadata,
      version: result.version,
    },
  }
}
