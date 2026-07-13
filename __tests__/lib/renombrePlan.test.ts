/**
 * Troceado y reanudación del renombrado (src/lib/renombrePlan.ts).
 */

import { aplicarTraza, armarLotes, type Op, type TrazaRow } from '@/lib/renombrePlan'

const traza = (t: Partial<TrazaRow>): TrazaRow => ({
  id: 1,
  carpeta: 'C',
  nombre_original: '',
  nombre_nuevo: null,
  accion: 'renombrado',
  estado: 'aplicado',
  ...t,
})

const op = (carpeta: string, nombre: string): Op => ({
  tipo: 'renombrar',
  mes: '04-Abril',
  carpeta,
  nombre,
  destino: `${nombre}.canon`,
  hash: null,
})

describe('aplicarTraza', () => {
  const archivos = [
    { nombre: 'FRA.pdf', hash: 'h1' },
    { nombre: 'copia-FRA.pdf', hash: 'h1' },
  ]

  it('proyecta lo aplicado sobre el snapshot viejo (renombra y quita lo borrado)', () => {
    const out = aplicarTraza(archivos, [
      traza({ nombre_original: 'FRA.pdf', nombre_nuevo: 'Factura-Compra.pdf' }),
      traza({ id: 2, nombre_original: 'copia-FRA.pdf', accion: 'borrado' }),
    ])
    expect(out).toEqual([{ nombre: 'Factura-Compra.pdf', hash: 'h1' }])
  })

  it('lo pendiente NO se da por hecho: el archivo sigue como estaba', () => {
    const out = aplicarTraza(archivos, [
      traza({ nombre_original: 'FRA.pdf', nombre_nuevo: 'Factura-Compra.pdf', estado: 'pendiente' }),
    ])
    expect(out.map((a) => a.nombre)).toEqual(['FRA.pdf', 'copia-FRA.pdf'])
  })

  it('lo fallido tampoco toca el snapshot', () => {
    const out = aplicarTraza(archivos, [
      traza({ nombre_original: 'FRA.pdf', nombre_nuevo: 'X.pdf', estado: 'fallido' }),
    ])
    expect(out.map((a) => a.nombre)).toEqual(['FRA.pdf', 'copia-FRA.pdf'])
  })
})

describe('armarLotes', () => {
  it('respeta el tope y nunca parte una carpeta en dos lotes', () => {
    const ops = [
      op('A', 'a1'),
      op('A', 'a2'),
      op('B', 'b1'),
      op('B', 'b2'),
      op('C', 'c1'),
    ]
    const lotes = armarLotes(ops, 3)
    expect(lotes.map((l) => l.map((o) => o.carpeta))).toEqual([
      ['A', 'A'],
      ['B', 'B', 'C'],
    ])
  })

  it('una carpeta más grande que el tope va sola (no se parte)', () => {
    const ops = [op('A', 'a1'), op('A', 'a2'), op('A', 'a3'), op('B', 'b1')]
    const lotes = armarLotes(ops, 2)
    expect(lotes).toHaveLength(2)
    expect(lotes[0]).toHaveLength(3)
    expect(lotes[1].map((o) => o.carpeta)).toEqual(['B'])
  })

  it('sin operaciones no hay lotes', () => {
    expect(armarLotes([], 8)).toEqual([])
  })
})
