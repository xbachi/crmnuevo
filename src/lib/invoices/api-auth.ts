export function enforceInvoicesApiKey(req: { headers: Headers }) {
  const expected = process.env.INVOICES_API_KEY
  if (!expected) return

  const got = req.headers.get('x-api-key') || ''
  if (got !== expected) {
    const err = new Error('Unauthorized')
    ;(err as any).status = 401
    throw err
  }
}
