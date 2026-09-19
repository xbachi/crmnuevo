import {
  CAMPOS_ALTA,
  CAMPOS_DOC,
  CAMPOS_PUBLICAR,
  esCampoDoc,
  faltantesAlta,
  faltantesPublicar,
  resumenFaltantes,
  vacio,
} from '@/lib/camposVehiculo'

/** Alta mínima válida de un coche de compra. */
const ALTA_OK = {
  tipo: 'C',
  marca: 'Kia',
  modelo: 'Ceed',
  matricula: '1234BCD',
  kms: 90000,
  fechaCompra: '2026-01-15',
  proveedor: 'Subasta X',
  precioCompra: 9500,
}

/** Coche listo para publicar: todo P y todo D con valor. */
const VEHICULO_OK = {
  color: 'Blanco',
  bastidor: 'VF1RFA00567890123',
  fechaMatriculacion: '2019-04-10',
  precioPublicacion: 13990,
}
const FICHA_OK = {
  nombre_comercial: 'Ceed 1.6 CRDi Drive',
  caja: 'Manual',
  regimen: 'IVA21',
  tarifa_financiacion: 'NORMAL',
  url_imagen: 'https://cdn.example/coche.jpg',
  combustible: 'Diésel',
  cubicaje: 1598,
  motor_kw: 100,
  motor_cv: 136,
  plazas: 5,
}

const campos = (fs: { campo: string }[]) => fs.map((f) => f.campo)

describe('vacio', () => {
  it('trata como vacío null, undefined y el string en blanco', () => {
    expect(vacio(null)).toBe(true)
    expect(vacio(undefined)).toBe(true)
    expect(vacio('')).toBe(true)
    expect(vacio('   ')).toBe(true)
    expect(vacio(NaN)).toBe(true)
  })

  it('el 0 NO está vacío: un coche con 0 km es un coche nuevo', () => {
    expect(vacio(0)).toBe(false)
    expect(vacio(false)).toBe(false)
    expect(vacio('0')).toBe(false)
  })
})

describe('faltantesAlta', () => {
  it('no falta nada en un alta completa', () => {
    expect(faltantesAlta(ALTA_OK)).toEqual([])
  })

  it('lista los ocho campos A cuando el body viene vacío', () => {
    expect(campos(faltantesAlta({}))).toEqual([
      'tipo',
      'marca',
      'modelo',
      'matricula',
      'kms',
      'fechaCompra',
      'proveedor',
      'precioCompra',
    ])
  })

  it('NO exige bastidor: lo trae el permiso de circulación', () => {
    expect(campos(faltantesAlta({ ...ALTA_OK, bastidor: '' }))).toEqual([])
    expect(campos(CAMPOS_ALTA as unknown as { campo: string }[])).not.toContain(
      'bastidor'
    )
  })

  it('acepta 0 kilómetros', () => {
    expect(faltantesAlta({ ...ALTA_OK, kms: 0 })).toEqual([])
  })

  it('devuelve etiqueta y motivo legibles', () => {
    const f = faltantesAlta({ ...ALTA_OK, proveedor: '' })
    expect(f).toEqual([
      { campo: 'proveedor', etiqueta: 'Proveedor', motivo: 'Falta proveedor.' },
    ])
  })

  it('rechaza un tipo no reconocible aunque venga relleno', () => {
    const f = faltantesAlta({ ...ALTA_OK, tipo: 'Furgoneta' })
    expect(campos(f)).toEqual(['tipo'])
    expect(f[0].motivo).toContain('no reconocido')
  })

  it('acepta el tipo escrito como palabra (Compra, Inversor…)', () => {
    expect(faltantesAlta({ ...ALTA_OK, tipo: 'Compra' })).toEqual([])
  })

  describe('condicional de inversor (tipo I)', () => {
    it('exige inversor', () => {
      expect(campos(faltantesAlta({ ...ALTA_OK, tipo: 'I' }))).toEqual([
        'inversorId',
      ])
    })

    it('se conforma con un inversorId > 0, también como string', () => {
      expect(faltantesAlta({ ...ALTA_OK, tipo: 'I', inversorId: 7 })).toEqual(
        []
      )
      expect(faltantesAlta({ ...ALTA_OK, tipo: 'I', inversorId: '7' })).toEqual(
        []
      )
    })

    it('rechaza 0 y basura', () => {
      expect(
        campos(faltantesAlta({ ...ALTA_OK, tipo: 'I', inversorId: 0 }))
      ).toEqual(['inversorId'])
      expect(
        campos(faltantesAlta({ ...ALTA_OK, tipo: 'I', inversorId: 'x' }))
      ).toEqual(['inversorId'])
    })

    it('no lo exige a los demás tipos', () => {
      expect(faltantesAlta({ ...ALTA_OK, tipo: 'C' })).toEqual([])
      expect(faltantesAlta({ ...ALTA_OK, tipo: 'R' })).toEqual([])
    })
  })

  describe('condicional de depósito (tipo D)', () => {
    it('llama al precio «precio acordado con el cliente»', () => {
      const f = faltantesAlta({ ...ALTA_OK, tipo: 'D', precioCompra: '' })
      expect(f).toEqual([
        {
          campo: 'precioCompra',
          etiqueta: 'Precio acordado con el cliente',
          motivo: 'Falta precio acordado con el cliente.',
        },
      ])
    })

    it('para los demás tipos sigue siendo el precio de compra', () => {
      const f = faltantesAlta({ ...ALTA_OK, tipo: 'C', precioCompra: null })
      expect(f[0].etiqueta).toBe('Precio de compra')
    })
  })
})

describe('faltantesPublicar', () => {
  it('no falta nada con todo relleno y confirmado', () => {
    expect(faltantesPublicar(VEHICULO_OK, FICHA_OK, [])).toEqual([])
  })

  it('un coche recién dado de alta sin ficha lista todos los P y D', () => {
    const f = campos(faltantesPublicar({}, null, []))
    for (const def of [...CAMPOS_DOC, ...CAMPOS_PUBLICAR]) {
      expect(f).toContain(def.campo)
    }
  })

  it('nombre_comercial aparece UNA sola vez aunque esté en P y en D', () => {
    const f = campos(faltantesPublicar({}, null, []))
    expect(f.filter((c) => c === 'nombre_comercial')).toHaveLength(1)
  })

  it('bloquea un campo D relleno pero sin confirmar', () => {
    const f = faltantesPublicar(VEHICULO_OK, FICHA_OK, ['bastidor'])
    expect(campos(f)).toEqual(['bastidor'])
    expect(f[0].motivo).toContain('falta confirmarlo')
  })

  it('un campo D relleno y sin fila pendiente no bloquea (lo escribió una persona)', () => {
    expect(faltantesPublicar(VEHICULO_OK, FICHA_OK, [])).toEqual([])
  })

  it('distingue vacío de sin confirmar', () => {
    const f = faltantesPublicar({ ...VEHICULO_OK, bastidor: null }, FICHA_OK, [
      'bastidor',
    ])
    expect(f).toHaveLength(1)
    expect(f[0].motivo).toBe('Falta bastidor.')
  })

  it('un pendiente de un campo que no es D se ignora', () => {
    expect(faltantesPublicar(VEHICULO_OK, FICHA_OK, ['inventado'])).toEqual([])
  })

  it('lee precio_contado de "Vehiculo"."precioPublicacion"', () => {
    const f = campos(
      faltantesPublicar({ ...VEHICULO_OK, precioPublicacion: null }, FICHA_OK)
    )
    expect(f).toEqual(['precio_contado'])
  })

  it('exige la foto principal y la tarifa de financiación', () => {
    const f = campos(
      faltantesPublicar(
        VEHICULO_OK,
        { ...FICHA_OK, url_imagen: '', tarifa_financiacion: null },
        []
      )
    )
    expect(f).toEqual(['tarifa_financiacion', 'url_imagen'])
  })

  it('acepta 0 CV / 0 plazas como dato (no como hueco)', () => {
    expect(
      faltantesPublicar(VEHICULO_OK, { ...FICHA_OK, plazas: 0 }, [])
    ).toEqual([])
  })
})

describe('esCampoDoc', () => {
  it('reconoce los ocho campos del documento', () => {
    for (const def of CAMPOS_DOC) expect(esCampoDoc(def.campo)).toBe(true)
  })

  it('rechaza cualquier otra cosa', () => {
    expect(esCampoDoc('color')).toBe(false)
    expect(esCampoDoc('precioCompra')).toBe(false)
    expect(esCampoDoc(null)).toBe(false)
    expect(esCampoDoc(7)).toBe(false)
  })
})

describe('resumenFaltantes', () => {
  it('junta las etiquetas', () => {
    expect(
      resumenFaltantes(faltantesAlta({ ...ALTA_OK, marca: '', kms: '' }))
    ).toBe('Marca, Kilómetros')
  })

  it('cadena vacía si no falta nada', () => {
    expect(resumenFaltantes([])).toBe('')
  })
})
