/* eslint-disable @typescript-eslint/no-require-imports */
// Helpers puros de scripts/apply-sql.js (sin pg ni dotenv) para poder testearlos.
const crypto = require('crypto')

const RE_DIRECTIVA_NO_TX = /^--\s*apply-sql:\s*no-transaction\s*$/i
const RE_DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y

function sha256(texto) {
  return crypto.createHash('sha256').update(texto, 'utf8').digest('hex')
}

// `-- apply-sql: no-transaction` en la primera línea → ejecutar sentencia a
// sentencia fuera de transacción (CREATE INDEX CONCURRENTLY no admite BEGIN).
function tieneDirectivaNoTransaccion(sql) {
  const primera = String(sql)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/, 1)[0]
  return RE_DIRECTIVA_NO_TX.test(primera.trim())
}

// Tokeniza en segmentos { tipo: 'codigo'|'comentario'|'literal', texto }.
// 'literal' cubre strings 'x', identificadores "x" y bloques $tag$...$tag$;
// el único sitio donde un ';' cuenta como separador es dentro de 'codigo'.
function tokenizar(sql) {
  const segmentos = []
  const n = sql.length
  let codigo = ''
  let i = 0
  const cerrarCodigo = () => {
    if (codigo) segmentos.push({ tipo: 'codigo', texto: codigo })
    codigo = ''
  }
  const pushLiteral = (tipo, hasta) => {
    cerrarCodigo()
    segmentos.push({ tipo, texto: sql.slice(i, hasta) })
    i = hasta
  }

  while (i < n) {
    const ch = sql[i]
    const sig = sql[i + 1]
    if (ch === '-' && sig === '-') {
      const fin = sql.indexOf('\n', i)
      pushLiteral('comentario', fin === -1 ? n : fin)
      continue
    }
    if (ch === '/' && sig === '*') {
      const fin = sql.indexOf('*/', i + 2)
      pushLiteral('comentario', fin === -1 ? n : fin + 2)
      continue
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < n) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2
            continue
          }
          break
        }
        j++
      }
      pushLiteral('literal', Math.min(j + 1, n))
      continue
    }
    if (ch === '$') {
      RE_DOLLAR_TAG.lastIndex = i
      const m = RE_DOLLAR_TAG.exec(sql)
      if (m) {
        const tag = m[0]
        const fin = sql.indexOf(tag, i + tag.length)
        pushLiteral('literal', fin === -1 ? n : fin + tag.length)
        continue
      }
    }
    codigo += ch
    i++
  }
  cerrarCodigo()
  return segmentos
}

function sinComentarios(sql) {
  return tokenizar(sql)
    .filter((s) => s.tipo !== 'comentario')
    .map((s) => s.texto)
    .join('')
}

// Separa por ';' fuera de comentarios, strings, identificadores y bloques $$.
// Descarta trozos vacíos o que solo contienen comentarios.
function separarSentencias(sql) {
  const sentencias = []
  let actual = ''
  for (const seg of tokenizar(sql)) {
    if (seg.tipo !== 'codigo') {
      actual += seg.texto
      continue
    }
    const partes = seg.texto.split(';')
    for (let k = 0; k < partes.length; k++) {
      actual += partes[k]
      if (k < partes.length - 1) {
        sentencias.push(actual)
        actual = ''
      }
    }
  }
  sentencias.push(actual)
  return sentencias
    .map((s) => s.trim())
    .filter((s) => sinComentarios(s).trim().length > 0)
}

// Pares (tabla, columna) de "ALTER TABLE t ADD COLUMN [IF NOT EXISTS] c".
function columnasDeclaradas(texto) {
  const pares = []
  const reAlter = /ALTER\s+TABLE\s+(?:ONLY\s+)?("?[\w.]+"?)([\s\S]*?);/gi
  let m
  while ((m = reAlter.exec(texto))) {
    const tabla = m[1].replace(/"/g, '').replace(/^public\./, '')
    const reCol = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)/gi
    let c
    while ((c = reCol.exec(m[2]))) {
      pares.push({ tabla, columna: c[1].replace(/"/g, '') })
    }
  }
  return pares
}

// Nombres de "CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] nombre ON ...".
function indicesDeclarados(texto) {
  const nombres = []
  const re =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)\s+ON\b/gi
  let m
  while ((m = re.exec(sinComentarios(texto)))) {
    nombres.push(m[1].replace(/"/g, ''))
  }
  return nombres
}

module.exports = {
  sha256,
  tieneDirectivaNoTransaccion,
  separarSentencias,
  sinComentarios,
  columnasDeclaradas,
  indicesDeclarados,
}
