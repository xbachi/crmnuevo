/**
 * Derivación en cliente de las cifras del widget "Ventas" del home a partir
 * de una única serie mensual (`/api/ventas?periodo=13_meses`), en lugar de
 * tres requests (año / mes_anterior / mes_actual) que eran el mismo GROUP BY
 * con otro WHERE.
 *
 * Las claves se comparan en UTC porque la serie viene de Postgres
 * (TO_CHAR("updatedAt", 'YYYY-MM') con NOW() en sesión UTC), igual que hacían
 * las queries por período.
 */

export interface VentaMes {
  mes: string // 'YYYY-MM'
  año: number
  cantidad: number
}

export interface VentasStats {
  añoActual: number
  ultimoMes: number
  mesActual: number
}

export function claveMes(fecha: Date): string {
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  return `${fecha.getUTCFullYear()}-${mes}`
}

export function derivarVentasStats(
  serie: VentaMes[],
  hoy: Date = new Date()
): VentasStats {
  const añoHoy = hoy.getUTCFullYear()
  const mesActualKey = claveMes(hoy)
  const mesAnteriorKey = claveMes(
    new Date(Date.UTC(añoHoy, hoy.getUTCMonth() - 1, 1))
  )

  let añoActual = 0
  let ultimoMes = 0
  let mesActual = 0

  for (const v of serie) {
    const n = Number(v.cantidad) || 0
    if (Number(v.año) === añoHoy) añoActual += n
    if (v.mes === mesActualKey) mesActual += n
    if (v.mes === mesAnteriorKey) ultimoMes += n
  }

  return { añoActual, ultimoMes, mesActual }
}
