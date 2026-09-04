import fs from 'fs'
import path from 'path'
import {
  sha256,
  tieneDirectivaNoTransaccion,
  separarSentencias,
  sinComentarios,
  columnasDeclaradas,
  indicesDeclarados,
} from '../../scripts/lib/sqlUtils'

describe('tieneDirectivaNoTransaccion', () => {
  it('detecta la directiva solo en la primera línea (espacios y mayúsculas tolerados)', () => {
    expect(
      tieneDirectivaNoTransaccion('-- apply-sql: no-transaction\nCREATE INDEX')
    ).toBe(true)
    expect(
      tieneDirectivaNoTransaccion('--apply-sql:NO-TRANSACTION  \r\nSELECT 1')
    ).toBe(true)
    expect(
      tieneDirectivaNoTransaccion('\uFEFF-- apply-sql: no-transaction\n')
    ).toBe(true)
    expect(
      tieneDirectivaNoTransaccion(
        '-- migración\n-- apply-sql: no-transaction\n'
      )
    ).toBe(false)
    expect(tieneDirectivaNoTransaccion('CREATE INDEX x ON t(a);')).toBe(false)
  })
})

describe('separarSentencias', () => {
  it("ignora ';' dentro de comentarios y descarta trozos que solo son comentarios", () => {
    const sql = [
      '-- cabecera; con punto y coma',
      'CREATE INDEX a ON t(x); -- cola; con más',
      '/* bloque; multi',
      '   línea; */ CREATE INDEX b ON t(y);',
      '-- solo comentario final;',
      '',
    ].join('\n')
    const s = separarSentencias(sql)
    expect(s).toHaveLength(2)
    expect(s[0]).toContain('CREATE INDEX a ON t(x)')
    expect(s[1]).toContain('CREATE INDEX b ON t(y)')
  })

  it("respeta ';' dentro de strings, identificadores y bloques $$", () => {
    const sql = [
      "DO $$ BEGIN RAISE NOTICE 'a;b'; END $$;",
      `SELECT 'x;y' AS "col;rara";`,
      'DO $fn$ BEGIN PERFORM 1; END $fn$;',
    ].join('\n')
    const s = separarSentencias(sql)
    expect(s).toHaveLength(3)
    expect(s[0]).toBe("DO $$ BEGIN RAISE NOTICE 'a;b'; END $$")
    expect(s[1]).toBe(`SELECT 'x;y' AS "col;rara"`)
    expect(s[2]).toBe('DO $fn$ BEGIN PERFORM 1; END $fn$')
  })

  it('la migración de índices real se parte en sentencias CREATE fuera de transacción', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'add-indexes-deals-vehiculos.sql'),
      'utf8'
    )
    expect(tieneDirectivaNoTransaccion(sql)).toBe(true)
    const s = separarSentencias(sql)
    expect(s.length).toBeGreaterThanOrEqual(10)
    for (const st of s) {
      expect(sinComentarios(st).trim()).toMatch(
        /^CREATE (EXTENSION|INDEX CONCURRENTLY)/
      )
    }
    expect(indicesDeclarados(sql)).toHaveLength(s.length - 1)
  })
})

describe('sha256', () => {
  it('vector conocido y sensibilidad al contenido', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(sha256('abc\n')).not.toBe(sha256('abc'))
  })
})

describe('columnasDeclaradas / indicesDeclarados', () => {
  it('extrae columnas de ALTER TABLE ADD COLUMN e índices de CREATE INDEX (ignorando comentados)', () => {
    const sql = `
      ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "mandatoGestoria" TEXT, ADD COLUMN otra INT;
      ALTER TABLE public.depositos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_uno ON t(a);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dos ON "Vehiculo" USING gin (LOWER(marca) gin_trgm_ops);
      -- CREATE INDEX idx_comentado ON t(b);
    `
    expect(columnasDeclaradas(sql)).toEqual([
      { tabla: 'Deal', columna: 'mandatoGestoria' },
      { tabla: 'Deal', columna: 'otra' },
      { tabla: 'depositos', columna: 'updated_at' },
    ])
    expect(indicesDeclarados(sql)).toEqual(['idx_uno', 'idx_dos'])
  })
})
