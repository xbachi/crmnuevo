export function normalizeTextForFingerprint(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 €$%\/\-\.\:,;]/g, ' ')
    .trim()
}
