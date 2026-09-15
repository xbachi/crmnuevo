/** @jest-environment node */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  RAICES,
  claveBusqueda,
  extraerMatriculaNombre,
  nombreCarpetaSeguro,
  listarCarpetasRaiz,
  buscarPorMatricula,
  procesarCarpetas,
  peorResultado,
} from '../../scripts/rename_expediente_files'

type Ctx = { root: string; dryRun: boolean; logFile: string }

let root: string
let ctx: Ctx

const abs = (...p: string[]) => path.join(root, ...p)
const mk = (...p: string[]) => fs.mkdirSync(abs(...p), { recursive: true })
const hay = (...p: string[]) => fs.existsSync(abs(...p))
const ls = (...p: string[]) => fs.readdirSync(abs(...p)).sort()
const lineasLog = () =>
  fs
    .readFileSync(ctx.logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-'))
  for (const [raiz, cfg] of Object.entries(RAICES)) {
    mk(raiz)
    for (const c of cfg.contenedores) mk(raiz, c)
  }
  fs.writeFileSync(abs('1_Ventas', 'MASTER-BASE.xlsx'), '')
  fs.writeFileSync(abs('1_Ventas', 'Sevencars - Personal.lnk'), '')
  fs.writeFileSync(abs('3_Compras', '1_CONTRATO_COMPRA.doc'), '')
  mk('3_Compras', '_incidencias-0bytes')
  mk('3_Compras', '_revisar-duplicados')
  ctx = { root, dryRun: false, logFile: path.join(root, 'log.jsonl') }
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('helpers puros', () => {
  it('claveBusqueda', () => {
    expect(claveBusqueda('88- Tesla Model 3-AlemanIa-2848NR')).toBe(
      '88TESLAMODEL3ALEMANIA2848NR'
    )
    expect(claveBusqueda('')).toBe('')
  })

  it('extraerMatriculaNombre', () => {
    expect(extraerMatriculaNombre('69-Ford-Kuga-0703NLP-Alemania')).toBe(
      '0703NLP'
    )
    expect(extraerMatriculaNombre('10-Opel-Insignia-1657KLB')).toBe('1657KLB')
    expect(extraerMatriculaNombre('Yamaha-Raptor-Quad-E9961BDJ')).toBe(
      'E9961BDJ'
    )
    expect(extraerMatriculaNombre('88- Tesla Model 3-AlemanIa-2848NR')).toBe(
      '2848NR'
    )
    expect(extraerMatriculaNombre('82-Kia-Xceed-')).toBeNull()
    expect(extraerMatriculaNombre('Golf')).toBeNull()
  })

  it('nombreCarpetaSeguro', () => {
    expect(nombreCarpetaSeguro('  10-Opel-Insignia-1657KLB ')).toBe(
      '10-Opel-Insignia-1657KLB'
    )
    for (const malo of [
      '../x',
      '-x',
      '_x',
      'a/b',
      'a\\b',
      'a:b',
      'a?b',
      '',
      '..',
    ]) {
      expect(() => nombreCarpetaSeguro(malo)).toThrow()
    }
  })

  it('peorResultado', () => {
    expect(peorResultado([])).toBe('sin_cambios')
    expect(peorResultado(['creado', 'sin_cambios'])).toBe('creado')
    expect(peorResultado(['creado', 'existente'])).toBe('existente')
    expect(peorResultado(['existente', 'no_existe'])).toBe('no_existe')
    expect(peorResultado(['no_existe', 'conflicto', 'movido'])).toBe(
      'conflicto'
    )
  })
})

describe('listar', () => {
  it('ignora archivos, prefijo _ y contenedores; incluye nivel 2', async () => {
    mk('1_Ventas', '10-Opel-Insignia-1657KLB')
    mk('1_Ventas', '----VENDIDOS', '69-Ford-Kuga-0703NLP-Alemania')
    mk(
      '1_Ventas',
      '----VENDIDOS',
      '0--------------------Coches-R',
      'R-8-Citroen-C4-0539GNZ'
    )
    mk('1_Ventas', '------IMPORTACION', '308')
    mk('3_Compras', 'Golf')
    mk('3_Compras', '----VENDIDOS', 'COCHES R', 'R-8-Citroen-C4-0539GNZ')
    mk('3_Compras', '--------Consignacion', 'D-19-Citroen-C3-7466LMF')

    const ventas = await listarCarpetasRaiz(root, '1_Ventas')
    expect(ventas.map((c) => c.rel).sort()).toEqual(
      [
        '1_Ventas/10-Opel-Insignia-1657KLB',
        '1_Ventas/----VENDIDOS/69-Ford-Kuga-0703NLP-Alemania',
        '1_Ventas/----VENDIDOS/0--------------------Coches-R/R-8-Citroen-C4-0539GNZ',
        '1_Ventas/------IMPORTACION/308',
      ].sort()
    )
    expect(ventas.find((c) => c.nombre === '308')?.contenedor).toBe(
      '------IMPORTACION'
    )

    const r = await procesarCarpetas({ accion: 'carpetas', op: 'listar' }, ctx)
    expect(r.ok).toBe(true)
    const rels = r.carpetas.map((c: { rel: string }) => c.rel)
    expect(rels).toContain('3_Compras/Golf')
    expect(rels).toContain(
      '3_Compras/----VENDIDOS/COCHES R/R-8-Citroen-C4-0539GNZ'
    )
    expect(rels).toContain(
      '3_Compras/--------Consignacion/D-19-Citroen-C3-7466LMF'
    )
    expect(rels).not.toContain('3_Compras/----VENDIDOS/COCHES R')
    expect(rels).not.toContain(
      '1_Ventas/----VENDIDOS/0--------------------Coches-R'
    )
    expect(
      rels.some(
        (x: string) => x.includes('_incidencias') || x.includes('_revisar')
      )
    ).toBe(false)
    expect(
      rels.some(
        (x: string) => x.includes('MASTER-BASE') || x.includes('CONTRATO')
      )
    ).toBe(false)
    expect(rels).toHaveLength(7)
  })

  it('contenedores inexistentes no fallan', async () => {
    fs.rmSync(abs('3_Compras', '----VENDIDOS'), { recursive: true })
    const r = await listarCarpetasRaiz(root, '3_Compras')
    expect(r).toEqual([])
  })
})

describe('crear', () => {
  const body = {
    accion: 'carpetas',
    op: 'crear',
    nombre: '10-Opel-Insignia-1657KLB',
    tipo: 'C',
  }

  it('C → creado en ambas raíces; repetir → sin_cambios; dryRun no crea', async () => {
    const dry = await procesarCarpetas({ ...body, dryRun: true }, ctx)
    expect(dry.dryRun).toBe(true)
    expect(dry.resultado).toBe('creado')
    expect(hay('1_Ventas', body.nombre)).toBe(false)

    const r = await procesarCarpetas(body, ctx)
    expect(r.ok).toBe(true)
    expect(r.resultado).toBe('creado')
    expect(r.rutas).toEqual([
      '1_Ventas/10-Opel-Insignia-1657KLB',
      '3_Compras/10-Opel-Insignia-1657KLB',
    ])
    expect(hay('1_Ventas', body.nombre)).toBe(true)
    expect(hay('3_Compras', body.nombre)).toBe(true)

    const r2 = await procesarCarpetas(body, ctx)
    expect(r2.ok).toBe(true)
    expect(r2.resultado).toBe('sin_cambios')
    expect(r2.rutas).toEqual(r.rutas)
  })

  it('D → Consignacion (7/8 guiones); R → Coches R', async () => {
    const d = await procesarCarpetas(
      { ...body, nombre: 'D-19-Citroen-C3-7466LMF', tipo: 'D' },
      ctx
    )
    expect(d.rutas).toEqual([
      '1_Ventas/-------Consignacion/D-19-Citroen-C3-7466LMF',
      '3_Compras/--------Consignacion/D-19-Citroen-C3-7466LMF',
    ])
    expect(
      hay('1_Ventas', '-------Consignacion', 'D-19-Citroen-C3-7466LMF')
    ).toBe(true)
    expect(
      hay('3_Compras', '--------Consignacion', 'D-19-Citroen-C3-7466LMF')
    ).toBe(true)

    const r = await procesarCarpetas(
      { ...body, nombre: 'R-8-Citroen-C4-0539GNZ', tipo: 'R' },
      ctx
    )
    expect(r.rutas).toEqual([
      '1_Ventas/-----------Coches R/R-8-Citroen-C4-0539GNZ',
      '3_Compras/-----------Coches R/R-8-Citroen-C4-0539GNZ',
    ])
    expect(
      hay('3_Compras', '-----------Coches R', 'R-8-Citroen-C4-0539GNZ')
    ).toBe(true)
  })

  it('carpeta previa sólo distinta en mayúsculas → renombrado y queda canónica', async () => {
    mk('1_Ventas', '10-opel-insignia-1657KLB')
    mk('3_Compras', '10-opel-insignia-1657KLB')
    const r = await procesarCarpetas(body, ctx)
    expect(r.ok).toBe(true)
    expect(r.resultado).toBe('renombrado')
    expect(ls('1_Ventas').filter((n) => /opel/i.test(n))).toEqual([
      '10-Opel-Insignia-1657KLB',
    ])
    expect(ls('3_Compras').filter((n) => /opel/i.test(n))).toEqual([
      '10-Opel-Insignia-1657KLB',
    ])
  })

  it('carpeta previa con otro nombre en la raíz → renombrado', async () => {
    mk('1_Ventas', 'Opel-Insignia-1657KLB')
    const r = await procesarCarpetas(body, ctx)
    expect(r.porRaiz['1_Ventas'].resultado).toBe('renombrado')
    expect(r.porRaiz['3_Compras'].resultado).toBe('creado')
    expect(r.resultado).toBe('renombrado')
    expect(hay('1_Ventas', 'Opel-Insignia-1657KLB')).toBe(false)
    expect(hay('1_Ventas', '10-Opel-Insignia-1657KLB')).toBe(true)
  })

  it('ya en VENDIDOS → existente, no se mueve', async () => {
    mk('1_Ventas', '----VENDIDOS', 'Opel-Insignia-1657KLB')
    const r = await procesarCarpetas(body, ctx)
    expect(r.ok).toBe(true)
    expect(r.resultado).toBe('existente')
    expect(r.existentes).toEqual([
      '1_Ventas/----VENDIDOS/Opel-Insignia-1657KLB',
    ])
    expect(r.motivo).toMatch(/1_Ventas/)
    expect(hay('1_Ventas', '----VENDIDOS', 'Opel-Insignia-1657KLB')).toBe(true)
    expect(hay('1_Ventas', '10-Opel-Insignia-1657KLB')).toBe(false)
    expect(hay('3_Compras', '10-Opel-Insignia-1657KLB')).toBe(true)
  })

  it('dos coincidencias → conflicto sin crear', async () => {
    mk('3_Compras', 'Opel-Insignia-1657KLB')
    mk('3_Compras', '----VENDIDOS', '10-Opel-1657KLB')
    const r = await procesarCarpetas(body, ctx)
    expect(r.ok).toBe(false)
    expect(r.resultado).toBe('conflicto')
    expect(r.porRaiz['3_Compras'].resultado).toBe('conflicto')
    expect(r.existentes?.sort()).toEqual([
      '3_Compras/----VENDIDOS/10-Opel-1657KLB',
      '3_Compras/Opel-Insignia-1657KLB',
    ])
    expect(hay('3_Compras', '10-Opel-Insignia-1657KLB')).toBe(false)
    expect(hay('1_Ventas', '10-Opel-Insignia-1657KLB')).toBe(true)
  })

  it('matricula explícita manda sobre el nombre', async () => {
    mk('1_Ventas', 'Tesla-Electrico-2848NRN')
    const r = await procesarCarpetas(
      {
        ...body,
        nombre: '88- Tesla Model 3-AlemanIa-2848NR',
        matricula: '2848NRN',
      },
      ctx
    )
    expect(r.porRaiz['1_Ventas'].resultado).toBe('renombrado')
    expect(hay('1_Ventas', '88- Tesla Model 3-AlemanIa-2848NR')).toBe(true)
    const b = await buscarPorMatricula(root, '1_Ventas', '2848NR')
    expect(b.map((c) => c.nombre)).toEqual([
      '88- Tesla Model 3-AlemanIa-2848NR',
    ])
  })

  it('tipo inválido / op inválida → rechaza', async () => {
    await expect(procesarCarpetas({ ...body, tipo: 'X' }, ctx)).rejects.toThrow(
      /tipo/
    )
    await expect(
      procesarCarpetas({ accion: 'carpetas', op: 'borrar' }, ctx)
    ).rejects.toThrow(/op/)
  })
})

describe('vendido', () => {
  it('C → movido a ----VENDIDOS; repetir → sin_cambios', async () => {
    mk('1_Ventas', '10-Opel-Insignia-1657KLB')
    mk('3_Compras', '10-Opel-Insignia-1657KLB')
    const body = {
      accion: 'carpetas',
      op: 'vendido',
      nombre: '10-Opel-Insignia-1657KLB',
      tipo: 'C',
    }
    const r = await procesarCarpetas(body, ctx)
    expect(r.ok).toBe(true)
    expect(r.resultado).toBe('movido')
    expect(r.rutas).toEqual([
      '1_Ventas/----VENDIDOS/10-Opel-Insignia-1657KLB',
      '3_Compras/----VENDIDOS/10-Opel-Insignia-1657KLB',
    ])
    expect(hay('1_Ventas', '10-Opel-Insignia-1657KLB')).toBe(false)
    expect(hay('1_Ventas', '----VENDIDOS', '10-Opel-Insignia-1657KLB')).toBe(
      true
    )
    expect(hay('3_Compras', '----VENDIDOS', '10-Opel-Insignia-1657KLB')).toBe(
      true
    )

    const r2 = await procesarCarpetas(body, ctx)
    expect(r2.ok).toBe(true)
    expect(r2.resultado).toBe('sin_cambios')
  })

  it('R → a las dos subcarpetas de Coches R, renombrando al canónico en el mismo paso', async () => {
    mk('1_Ventas', '-----------Coches R', 'R-8-Citroen-C4-0539GNZ')
    mk('3_Compras', '-----------Coches R', 'r8-citroen-0539GNZ')
    const r = await procesarCarpetas(
      {
        accion: 'carpetas',
        op: 'vendido',
        nombre: 'R-8-Citroen-C4-0539GNZ',
        tipo: 'R',
      },
      ctx
    )
    expect(r.resultado).toBe('movido')
    expect(
      hay(
        '1_Ventas',
        '----VENDIDOS',
        '0--------------------Coches-R',
        'R-8-Citroen-C4-0539GNZ'
      )
    ).toBe(true)
    expect(
      hay('3_Compras', '----VENDIDOS', 'COCHES R', 'R-8-Citroen-C4-0539GNZ')
    ).toBe(true)
    expect(hay('3_Compras', '-----------Coches R', 'r8-citroen-0539GNZ')).toBe(
      false
    )
  })

  it('destino ocupado → conflicto, nada se fusiona', async () => {
    mk('1_Ventas', '10-Opel-Insignia-1657KLB')
    mk('1_Ventas', '----VENDIDOS', '10-Opel-Insignia-1657KLB')
    mk('3_Compras', '10-Opel-Insignia-1657KLB')
    fs.writeFileSync(abs('1_Ventas', '10-Opel-Insignia-1657KLB', 'a.pdf'), 'x')
    const r = await procesarCarpetas(
      {
        accion: 'carpetas',
        op: 'vendido',
        nombre: '10-Opel-Insignia-1657KLB',
        tipo: 'C',
      },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.resultado).toBe('conflicto')
    expect(r.porRaiz['1_Ventas'].resultado).toBe('conflicto')
    expect(r.porRaiz['3_Compras'].resultado).toBe('movido')
    expect(hay('1_Ventas', '10-Opel-Insignia-1657KLB', 'a.pdf')).toBe(true)
  })

  it('sin carpeta → no_existe y ok:false', async () => {
    const r = await procesarCarpetas(
      { accion: 'carpetas', op: 'vendido', nombre: 'Golf', tipo: 'C' },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.resultado).toBe('no_existe')
    expect(r.rutas).toEqual([])
  })

  it('dryRun no mueve', async () => {
    mk('1_Ventas', '10-Opel-Insignia-1657KLB')
    mk('3_Compras', '10-Opel-Insignia-1657KLB')
    const r = await procesarCarpetas(
      {
        accion: 'carpetas',
        op: 'vendido',
        nombre: '10-Opel-Insignia-1657KLB',
        tipo: 'C',
      },
      { ...ctx, dryRun: true }
    )
    expect(r.resultado).toBe('movido')
    expect(hay('1_Ventas', '10-Opel-Insignia-1657KLB')).toBe(true)
    expect(hay('1_Ventas', '----VENDIDOS', '10-Opel-Insignia-1657KLB')).toBe(
      false
    )
  })
})

describe('renombrar', () => {
  it('ok en ambas raíces, respetando el contenedor', async () => {
    mk('1_Ventas', 'Golf')
    mk('3_Compras', '----VENDIDOS', 'Golf')
    const r = await procesarCarpetas(
      {
        accion: 'carpetas',
        op: 'renombrar',
        de: 'Golf',
        a: '5-VW-Golf-1234ABC',
      },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(r.resultado).toBe('renombrado')
    expect(r.rutas).toEqual([
      '1_Ventas/5-VW-Golf-1234ABC',
      '3_Compras/----VENDIDOS/5-VW-Golf-1234ABC',
    ])
    expect(hay('1_Ventas', 'Golf')).toBe(false)
    expect(hay('3_Compras', '----VENDIDOS', '5-VW-Golf-1234ABC')).toBe(true)
  })

  it('de === a → sin_cambios', async () => {
    mk('1_Ventas', 'Golf')
    const r = await procesarCarpetas(
      { accion: 'carpetas', op: 'renombrar', de: 'Golf', a: 'Golf' },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(r.resultado).toBe('sin_cambios')
  })

  it('sólo mayúsculas → renombrado', async () => {
    mk('1_Ventas', 'golf')
    const r = await procesarCarpetas(
      { accion: 'carpetas', op: 'renombrar', de: 'golf', a: 'Golf' },
      ctx
    )
    expect(r.porRaiz['1_Ventas'].resultado).toBe('renombrado')
    expect(ls('1_Ventas')).toContain('Golf')
    expect(ls('1_Ventas')).not.toContain('golf')
  })

  it('no_existe', async () => {
    const r = await procesarCarpetas(
      { accion: 'carpetas', op: 'renombrar', de: 'Golf', a: 'Polo' },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.resultado).toBe('no_existe')
  })

  it('de no existe exacto pero hay carpeta con su matrícula → renombrado a `a`', async () => {
    mk('1_Ventas', 'Opel-Insignia-1657KLB')
    mk('3_Compras', '----VENDIDOS', 'Opel-Insignia-1657KLB')
    const r = await procesarCarpetas(
      {
        accion: 'carpetas',
        op: 'renombrar',
        de: '10-Opel-Insignia-1657KLB',
        a: '10-Opel-Insignia-9999ZZZ',
      },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(r.resultado).toBe('renombrado')
    expect(r.rutas).toEqual([
      '1_Ventas/10-Opel-Insignia-9999ZZZ',
      '3_Compras/----VENDIDOS/10-Opel-Insignia-9999ZZZ',
    ])
    expect(hay('1_Ventas', 'Opel-Insignia-1657KLB')).toBe(false)
    expect(hay('1_Ventas', '10-Opel-Insignia-9999ZZZ')).toBe(true)
    expect(hay('3_Compras', '----VENDIDOS', '10-Opel-Insignia-9999ZZZ')).toBe(
      true
    )
  })

  it('de no existe pero `a` ya está en disco (matrícula nueva) → sin_cambios', async () => {
    mk('1_Ventas', '10-Opel-Insignia-9999ZZZ')
    mk('3_Compras', '10-Opel-Insignia-9999ZZZ')
    const r = await procesarCarpetas(
      {
        accion: 'carpetas',
        op: 'renombrar',
        de: '10-Opel-Insignia-1657KLB',
        a: '10-Opel-Insignia-9999ZZZ',
      },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(r.resultado).toBe('sin_cambios')
    expect(r.rutas).toEqual([
      '1_Ventas/10-Opel-Insignia-9999ZZZ',
      '3_Compras/10-Opel-Insignia-9999ZZZ',
    ])
    expect(ls('1_Ventas').filter((n) => /opel/i.test(n))).toEqual([
      '10-Opel-Insignia-9999ZZZ',
    ])
  })

  it('a ya existe → conflicto', async () => {
    mk('1_Ventas', 'Golf')
    mk('1_Ventas', 'Polo')
    const r = await procesarCarpetas(
      { accion: 'carpetas', op: 'renombrar', de: 'Golf', a: 'Polo' },
      ctx
    )
    expect(r.porRaiz['1_Ventas'].resultado).toBe('conflicto')
    expect(r.ok).toBe(false)
    expect(hay('1_Ventas', 'Golf')).toBe(true)
  })

  it('nombres inválidos → rechaza', async () => {
    for (const malo of ['../x', '-x', 'a/b']) {
      await expect(
        procesarCarpetas(
          { accion: 'carpetas', op: 'renombrar', de: 'Golf', a: malo },
          ctx
        )
      ).rejects.toThrow()
      await expect(
        procesarCarpetas(
          { accion: 'carpetas', op: 'crear', nombre: malo, tipo: 'C' },
          ctx
        )
      ).rejects.toThrow()
    }
  })
})

describe('log', () => {
  it('una línea JSON por op', async () => {
    await procesarCarpetas(
      { accion: 'carpetas', op: 'crear', nombre: 'Golf', tipo: 'C' },
      ctx
    )
    await procesarCarpetas(
      { accion: 'carpetas', op: 'renombrar', de: 'Golf', a: 'Polo' },
      ctx
    )
    await procesarCarpetas({ accion: 'carpetas', op: 'listar' }, ctx)
    await expect(
      procesarCarpetas(
        { accion: 'carpetas', op: 'crear', nombre: '-x', tipo: 'C' },
        ctx
      )
    ).rejects.toThrow()
    const lineas = lineasLog()
    expect(lineas).toHaveLength(4)
    expect(lineas[0]).toMatchObject({
      op: 'crear',
      ok: true,
      resultado: 'creado',
      nombre: 'Golf',
      dryRun: false,
    })
    expect(lineas[1]).toMatchObject({
      op: 'renombrar',
      resultado: 'renombrado',
      de: 'Golf',
      a: 'Polo',
    })
    expect(lineas[2]).toMatchObject({ op: 'listar', ok: true })
    expect(lineas[3]).toMatchObject({ op: 'crear', ok: false, nombre: '-x' })
    expect(typeof lineas[0].ts).toBe('string')
  })
})
