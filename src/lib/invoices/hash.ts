import crypto from 'crypto'

export function sha256Hex(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export function fingerprintHex(
  parts: Array<string | number | null | undefined>
) {
  const payload = parts
    .map((p) => (p == null ? '' : String(p)))
    .join('|')
    .trim()
  return crypto.createHash('sha256').update(payload).digest('hex')
}
