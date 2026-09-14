// Fachada tipada de scripts/lib/fechaCorta.js (fuente única, también la usa
// scripts/importar-checklist-sheets.js fuera de Next).
import * as impl from '../../scripts/lib/fechaCorta'

/** Fecha corta de las hojas ("24/3", "06/03/26", "nov/25") → ISO YYYY-MM-DD o null. */
export function interpretarFechaCorta(
  texto: unknown,
  anioReferencia?: number,
  hoy?: Date
): string | null {
  return impl.interpretarFechaCorta(texto, anioReferencia, hoy)
}
