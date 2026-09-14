// Interpretación de las fechas "cortas" de las hojas de checklist ("24/3",
// "06/03/26", "17072026", "nov/25", "06/03/26// 10/03"). Sin require: lo
// consumen src/lib/fechaCorta.ts y los scripts CLI. Nunca lanza.

const MESES_ES = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
}

const pad2 = (n) => String(n).padStart(2, '0')

/** ISO YYYY-MM-DD si d/m/a es una fecha real (31/2 → null). */
function iso(anio, mes, dia) {
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  if (
    d.getUTCFullYear() !== anio ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null
  }
  return `${anio}-${pad2(mes)}-${pad2(dia)}`
}

/**
 * @param {unknown} texto
 * @param {number} [anioReferencia] año para "dd/mm" (por defecto el actual);
 *   si la fecha resultante es futura se usa el año anterior.
 * @param {Date} [hoy] sólo para tests.
 * @returns {string|null} ISO YYYY-MM-DD
 */
function interpretarFechaCorta(texto, anioReferencia, hoy) {
  if (typeof texto !== 'string') return null
  const ahora = hoy instanceof Date ? hoy : new Date()
  const anioRef = Number.isFinite(anioReferencia)
    ? Math.trunc(anioReferencia)
    : ahora.getUTCFullYear()

  // Sólo el primer segmento: "06/03/26// 10/03" → "06/03/26".
  const s = String(texto)
    .split('//')[0]
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!s) return null

  let m
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) {
    return iso(Number(m[3]), Number(m[2]), Number(m[1]))
  }
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/.exec(s))) {
    return iso(2000 + Number(m[3]), Number(m[2]), Number(m[1]))
  }
  if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(s))) {
    return iso(Number(m[3]), Number(m[2]), Number(m[1]))
  }
  if ((m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s))) {
    const r = iso(anioRef, Number(m[2]), Number(m[1]))
    if (!r) return null
    const hoyIso = ahora.toISOString().slice(0, 10)
    return r > hoyIso ? iso(anioRef - 1, Number(m[2]), Number(m[1])) : r
  }
  if ((m = /^([a-z]{3,})[/.\s-]?(\d{2}|\d{4})$/.exec(s))) {
    const mes = MESES_ES[m[1].slice(0, 3)]
    if (!mes) return null
    const anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
    return iso(anio, mes, 1)
  }
  return null
}

module.exports = { interpretarFechaCorta, MESES_ES }
