/**
 * @jest-environment node
 *
 * lib/fichaTecnica: normalizadores, comparación CRM/web y la regla dura de
 * decidir() — matrícula y bastidor NUNCA se corrigen solos.
 *
 * El módulo es puro (no toca pg ni la red), así que no hace falta mockear nada:
 * el resto de la suite mockea '@/lib/direct-database' porque sus módulos
 * importan el pool; éste no lo importa a propósito.
 */

import {
  CONFIANZA_MINIMA,
  compararConCrm,
  compararConWeb,
  decidir,
  dedupKeyFicha,
  dedupKeySinFicha,
  mismaFecha,
  normalizarBastidor,
  normalizarCombustible,
  normalizarFecha,
  normalizarNumero,
  type CamposFicha,
  type Discrepancia,
  type FichaWeb,
  type VehiculoCrm,
} from '@/lib/fichaTecnica'

const campo = (valor: string | number | null, confianza = 0.95) => ({
  valor,
  confianza,
})

const VEHICULO: VehiculoCrm = {
  id: 42,
  referencia: '1234',
  marca: 'KIA',
  modelo: 'SPORTAGE',
  matricula: '3429 LHT',
  bastidor: 'U5YPH81ADLL123456',
  color: 'Blanco',
  fechaMatriculacion: '2020-07-15',
}

const CAMPOS_LIMPIOS: CamposFicha = {
  matricula: campo('3429LHT', 0.98),
  bastidor: campo('U5YPH81ADLL123456', 0.95),
  marca: campo('KIA', 0.97),
  modelo: campo('SPORTAGE', 0.9),
  combustible: campo('GASOLINA', 0.9),
  cilindrada_cc: campo(1598, 0.9),
  potencia_kw: campo(100, 0.9),
  potencia_cv: campo(136, 0.8),
  plazas: campo(5, 0.9),
  fecha_primera_matriculacion: campo('2020-07-15', 0.9),
  color: campo('Blanco', 0.6),
}

const WEB_LIMPIA: FichaWeb = {
  id: 987,
  url: 'https://www.sevencars.es/vehiculo/kia-sportage/',
  marca: 'Kia',
  modelo: 'Sportage',
  version: '1.6 GDi Drive',
  combustible: 'Gasolina',
  cubicaje: '1.598',
  cv: '136',
  caja: 'Manual',
  matriculacion: 'Jul 2020',
  fecha_matriculacion: '2020-07-15',
  matricula: '3429LHT',
  plazas: 5,
}

describe('normalizarCombustible', () => {
  it('lleva lo que dice la ITV al vocabulario de la web', () => {
    expect(normalizarCombustible('GASOLINA')).toBe('Gasolina')
    expect(normalizarCombustible('gasolina')).toBe('Gasolina')
    expect(normalizarCombustible('GASÓLEO')).toBe('Diésel')
    expect(normalizarCombustible('DIESEL')).toBe('Diésel')
    expect(normalizarCombustible('Diésel')).toBe('Diésel')
    expect(normalizarCombustible('gasoil')).toBe('Diésel')
    expect(normalizarCombustible('ELÉCTRICO')).toBe('Eléctrico')
    expect(normalizarCombustible('HÍBRIDO')).toBe('Híbrido')
    expect(normalizarCombustible('GLP')).toBe('GLP')
    expect(normalizarCombustible('GAS LICUADO DEL PETRÓLEO')).toBe('GLP')
  })

  it('un híbrido eléctrico es híbrido, no eléctrico', () => {
    expect(normalizarCombustible('HÍBRIDO ELÉCTRICO')).toBe('Híbrido')
    expect(normalizarCombustible('Híbrido enchufable')).toBe('Híbrido')
  })

  it('devuelve null con lo que no reconoce', () => {
    expect(normalizarCombustible('')).toBeNull()
    expect(normalizarCombustible(null)).toBeNull()
    expect(normalizarCombustible('hidrógeno')).toBeNull()
  })
})

describe('normalizarFecha', () => {
  it('acepta los tres formatos que llegan de verdad', () => {
    expect(normalizarFecha('2020-07-15')).toBe('2020-07-15')
    expect(normalizarFecha('15/07/2020')).toBe('2020-07-15')
    expect(normalizarFecha('Jul 2020')).toBe('2020-07')
  })

  it('tolera variantes sueltas y descarta la basura', () => {
    expect(normalizarFecha('2020-7-5')).toBe('2020-07-05')
    expect(normalizarFecha('2020-07-15T00:00:00.000Z')).toBe('2020-07-15')
    expect(normalizarFecha('15-07-2020')).toBe('2020-07-15')
    expect(normalizarFecha('07/2020')).toBe('2020-07')
    expect(normalizarFecha('julio 2020')).toBe('2020-07')
    expect(normalizarFecha('2020')).toBe('2020')
    expect(normalizarFecha('')).toBeNull()
    expect(normalizarFecha('no legible')).toBeNull()
    expect(normalizarFecha('2020-13-01')).toBeNull()
  })

  it('mismaFecha admite menos precisión, no otra fecha', () => {
    expect(mismaFecha('2020-07', '2020-07-15')).toBe(true)
    expect(mismaFecha('2020-07-15', '2020-07-15')).toBe(true)
    expect(mismaFecha('2020-06', '2020-07-15')).toBe(false)
    expect(mismaFecha(null, '2020-07-15')).toBe(false)
  })
})

describe('normalizarNumero / normalizarBastidor', () => {
  it('saca el entero útil de lo que venga', () => {
    expect(normalizarNumero(1598)).toBe(1598)
    expect(normalizarNumero('1.598')).toBe(1598)
    expect(normalizarNumero('1.598 cc')).toBe(1598)
    expect(normalizarNumero('136 CV')).toBe(136)
    expect(normalizarNumero('136,00')).toBe(136)
    expect(normalizarNumero('')).toBeNull()
    expect(normalizarNumero(null)).toBeNull()
    expect(normalizarNumero('n/d')).toBeNull()
  })

  it('el bastidor se compara alfanumérico puro', () => {
    expect(normalizarBastidor('u5yph81a-dll 123456')).toBe('U5YPH81ADLL123456')
  })
})

describe('decidir', () => {
  const d = (over: Partial<Discrepancia>): Discrepancia => ({
    fuente: 'crm',
    campo: 'color',
    etiqueta: 'Color',
    tipo: 'vacio',
    valorActual: null,
    valorFicha: 'Blanco',
    valorFichaCrudo: 'Blanco',
    confianza: 0.95,
    ...over,
  })

  it('color vacío con confianza alta se corrige solo', () => {
    expect(decidir(d({}))).toBe('corregir')
  })

  it('fecha con otro formato y confianza alta se canoniza', () => {
    expect(
      decidir(
        d({
          campo: 'fechaMatriculacion',
          tipo: 'formato',
          valorActual: '15/07/2020',
          valorFicha: '2020-07-15',
        })
      )
    ).toBe('corregir')
  })

  it('NUNCA corrige matrícula ni bastidor, aunque la confianza sea 1', () => {
    for (const c of ['matricula', 'bastidor'] as const) {
      for (const tipo of ['vacio', 'formato', 'conflicto'] as const) {
        expect(
          decidir(d({ campo: c, tipo, confianza: 1, valorFicha: '3429LHT' }))
        ).toBe('revisar')
      }
    }
  })

  it('marca y modelo son solo aviso', () => {
    expect(decidir(d({ campo: 'marca', confianza: 1 }))).toBe('revisar')
    expect(decidir(d({ campo: 'modelo', confianza: 1 }))).toBe('revisar')
  })

  it('confianza por debajo del mínimo → revisar', () => {
    expect(decidir(d({ confianza: CONFIANZA_MINIMA - 0.01 }))).toBe('revisar')
    expect(decidir(d({ confianza: 0 }))).toBe('revisar')
    expect(decidir(d({ confianza: CONFIANZA_MINIMA }))).toBe('corregir')
  })

  it('un conflicto real lo decide una persona', () => {
    expect(decidir(d({ tipo: 'conflicto', valorActual: 'Gris' }))).toBe(
      'revisar'
    )
  })

  it('nada de la web se corrige automáticamente', () => {
    expect(
      decidir(d({ fuente: 'web', campo: 'combustible', confianza: 1 }))
    ).toBe('revisar')
  })
})

describe('compararConCrm', () => {
  it('un coche que cuadra no genera nada', () => {
    expect(compararConCrm(VEHICULO, CAMPOS_LIMPIOS)).toEqual([])
  })

  it('no compara los campos que la ficha no trae', () => {
    expect(compararConCrm(VEHICULO, {})).toEqual([])
    expect(
      compararConCrm(VEHICULO, { color: campo(null), bastidor: campo('') })
    ).toEqual([])
  })

  it('caza vacíos, conflictos y formatos', () => {
    const vehiculo: VehiculoCrm = {
      ...VEHICULO,
      color: null,
      bastidor: 'U5YPH81ADLL999999',
      fechaMatriculacion: '15/07/2020',
      matricula: '3429LHT',
    }
    const out = compararConCrm(vehiculo, CAMPOS_LIMPIOS)
    const porCampo = Object.fromEntries(out.map((d) => [d.campo, d]))

    expect(Object.keys(porCampo).sort()).toEqual([
      'bastidor',
      'color',
      'fechaMatriculacion',
    ])
    expect(porCampo.color.tipo).toBe('vacio')
    expect(porCampo.color.valorFicha).toBe('Blanco')
    expect(porCampo.bastidor.tipo).toBe('conflicto')
    expect(porCampo.bastidor.valorActual).toBe('U5YPH81ADLL999999')
    expect(porCampo.fechaMatriculacion.tipo).toBe('formato')
    expect(porCampo.fechaMatriculacion.valorFicha).toBe('2020-07-15')

    // Y el reparto que hará el cron con eso.
    expect(out.map(decidir).filter((x) => x === 'corregir')).toHaveLength(1) // solo la fecha
    expect(decidir(porCampo.color)).toBe('revisar') // confianza 0.6
    expect(decidir(porCampo.bastidor)).toBe('revisar')
  })

  it('la matrícula que no cuadra se avisa, nunca se corrige', () => {
    const out = compararConCrm(
      { ...VEHICULO, matricula: '1111AAA' },
      CAMPOS_LIMPIOS
    )
    expect(out).toHaveLength(1)
    expect(out[0].campo).toBe('matricula')
    expect(out[0].tipo).toBe('conflicto')
    expect(decidir(out[0])).toBe('revisar')
  })

  it('ignora espacios y guiones de la matrícula del CRM', () => {
    expect(
      compararConCrm({ ...VEHICULO, matricula: '3429-LHT' }, CAMPOS_LIMPIOS)
    ).toEqual([])
  })

  it('el CRM con la fecha más precisa que la ficha no se toca', () => {
    const out = compararConCrm(VEHICULO, {
      fecha_primera_matriculacion: campo('Jul 2020'),
    })
    expect(out).toEqual([])
  })
})

describe('compararConWeb', () => {
  it('una ficha web que cuadra no genera nada', () => {
    expect(compararConWeb(WEB_LIMPIA, CAMPOS_LIMPIOS)).toEqual([])
  })

  it('sin ficha web no hay nada que comparar', () => {
    expect(compararConWeb(null, CAMPOS_LIMPIOS)).toEqual([])
  })

  it('caza combustible, cilindrada y potencia distintos, y el hueco vacío', () => {
    const web: FichaWeb = {
      ...WEB_LIMPIA,
      combustible: 'Diésel',
      cubicaje: '1.998',
      cv: '',
      plazas: 5,
    }
    const out = compararConWeb(web, CAMPOS_LIMPIOS)
    const porCampo = Object.fromEntries(out.map((d) => [d.campo, d]))

    expect(Object.keys(porCampo).sort()).toEqual([
      'cilindrada_cc',
      'combustible',
      'potencia_cv',
    ])
    expect(porCampo.combustible.tipo).toBe('conflicto')
    expect(porCampo.combustible.valorActual).toBe('Diésel')
    expect(porCampo.combustible.valorFicha).toBe('Gasolina')
    expect(porCampo.cilindrada_cc.valorFicha).toBe('1598')
    expect(porCampo.potencia_cv.tipo).toBe('vacio')

    // Ninguno se corrige solo: la web la edita el cliente a mano.
    expect(out.every((d) => decidir(d) === 'revisar')).toBe(true)
    expect(out.every((d) => d.fuente === 'web')).toBe(true)
  })

  it('la matriculación sólo tiene que cuadrar en mes y año, con cualquier formato', () => {
    const web: FichaWeb = {
      ...WEB_LIMPIA,
      matriculacion: 'Julio 2020',
      fecha_matriculacion: '2020-07-01',
    }
    expect(compararConWeb(web, CAMPOS_LIMPIOS)).toEqual([])
  })

  it('caza el texto «Mayo 2018» de un coche matriculado el 5 de diciembre', () => {
    const campos: CamposFicha = {
      ...CAMPOS_LIMPIOS,
      fecha_primera_matriculacion: campo('2018-12-05', 0.75),
    }
    const web: FichaWeb = {
      ...WEB_LIMPIA,
      matriculacion: 'Mayo 2018',
      fecha_matriculacion: '2018-12-05',
    }
    const out = compararConWeb(web, campos)
    expect(out.map((d) => d.campo)).toEqual(['matriculacion_texto'])
    expect(out[0].tipo).toBe('conflicto')
    expect(out[0].valorActual).toBe('Mayo 2018')
    expect(out[0].valorFicha).toBe('Diciembre 2018')
    expect(decidir(out[0])).toBe('revisar')
  })
})

describe('dedup keys', () => {
  it('llevan el hash para que una foto nueva vuelva a avisar', () => {
    expect(dedupKeyFicha(42, 'color', 'abc123')).toBe(
      'ficha_tecnica:42:color:abc123'
    )
    expect(dedupKeyFicha(42, 'color', 'otro')).not.toBe(
      dedupKeyFicha(42, 'color', 'abc123')
    )
    expect(dedupKeySinFicha(42)).toBe('ficha_tecnica:42:sin-ficha')
  })
})
