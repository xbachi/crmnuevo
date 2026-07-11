export function normalizeProveedorKey(proveedor: string): string {
  return proveedor.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeNumeroFacturaKey(numeroFactura: string): string {
  return numeroFactura.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()
}

export function sameMoneyAmount(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100)
}
