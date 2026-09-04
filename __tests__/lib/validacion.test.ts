import {
  validarCampos,
  primerCampoConError,
  sinError,
  resumenErrores,
  type Regla,
} from '@/lib/validacion'
import { validarNif } from '@/lib/nifValidator'

describe('validarCampos', () => {
  it('requerido vacío → "Indica {etiqueta}"; con espacios también cuenta como vacío', () => {
    const reglas: Record<string, Regla> = {
      nombre: { requerido: true, etiqueta: 'el nombre' },
      apellidos: { requerido: true, etiqueta: 'los apellidos' },
    }
    const r = validarCampos({ nombre: '', apellidos: '   ' }, reglas)
    expect(r.ok).toBe(false)
    expect(r.errores).toEqual({
      nombre: 'Indica el nombre',
      apellidos: 'Indica los apellidos',
    })
  })

  it('opcional vacío no falla; email inválido sí', () => {
    const reglas: Record<string, Regla> = {
      email: { etiqueta: 'el email', tipo: 'email' },
    }
    expect(validarCampos({ email: '' }, reglas).ok).toBe(true)
    expect(validarCampos({ email: 'juan@email.com' }, reglas).ok).toBe(true)
    const r = validarCampos({ email: 'juan@' }, reglas)
    expect(r.ok).toBe(false)
    expect(r.errores.email).toBe('El email no es válido')
  })

  it('NIF: válido e inválido, coherente con nifValidator', () => {
    const reglas: Record<string, Regla> = {
      dni: { etiqueta: 'el DNI', tipo: 'nif' },
    }
    const valido = '12345678Z'
    const invalido = '12345678A'
    expect(validarNif(valido).valido).toBe(true)
    expect(validarNif(invalido).valido).toBe(false)

    expect(validarCampos({ dni: valido }, reglas).ok).toBe(true)
    // NIE válido
    expect(validarCampos({ dni: 'X1234567L' }, reglas).ok).toBe(true)
    const r = validarCampos({ dni: invalido }, reglas)
    expect(r.ok).toBe(false)
    expect(r.errores.dni).toBe('El DNI/NIE no es válido')
  })

  it('teléfono español válido (con y sin prefijo, con espacios); basura inválida', () => {
    const reglas: Record<string, Regla> = {
      telefono: { requerido: true, etiqueta: 'el teléfono', tipo: 'telefono' },
    }
    expect(validarCampos({ telefono: '612345678' }, reglas).ok).toBe(true)
    expect(validarCampos({ telefono: '+34 612 34 56 78' }, reglas).ok).toBe(
      true
    )
    expect(validarCampos({ telefono: '96 123 45 67' }, reglas).ok).toBe(true)
    const r = validarCampos({ telefono: '12345' }, reglas)
    expect(r.errores.telefono).toBe('El teléfono no es válido')
    expect(validarCampos({ telefono: '' }, reglas).errores.telefono).toBe(
      'Indica el teléfono'
    )
  })

  it('matrícula: "1234 ABC" y "1234ABC" válidas, "ABC 1234" inválida', () => {
    const reglas: Record<string, Regla> = {
      matricula: {
        requerido: true,
        etiqueta: 'la matrícula',
        tipo: 'matricula',
      },
    }
    expect(validarCampos({ matricula: '1234 ABC' }, reglas).ok).toBe(true)
    expect(validarCampos({ matricula: '1234ABC' }, reglas).ok).toBe(true)
    expect(validarCampos({ matricula: '1234bcd' }, reglas).ok).toBe(true)
    const r = validarCampos({ matricula: 'ABC 1234' }, reglas)
    expect(r.ok).toBe(false)
    expect(r.errores.matricula).toBe(
      'La matrícula no tiene un formato válido (1234 ABC)'
    )
  })

  it('número: negativo con min 0 falla, texto no numérico falla, 0 pasa', () => {
    const reglas: Record<string, Regla> = {
      kms: {
        requerido: true,
        etiqueta: 'los kilómetros',
        tipo: 'numero',
        min: 0,
      },
    }
    expect(validarCampos({ kms: '-5' }, reglas).errores.kms).toBe(
      'Debe ser un número mayor o igual que 0'
    )
    expect(validarCampos({ kms: 'abc' }, reglas).errores.kms).toBe(
      'Debe ser un número'
    )
    expect(validarCampos({ kms: '0' }, reglas).ok).toBe(true)
    expect(validarCampos({ kms: 0 }, reglas).ok).toBe(true)
    expect(validarCampos({ kms: '' }, reglas).errores.kms).toBe(
      'Indica los kilómetros'
    )
  })

  it('fecha ISO válida/inválida', () => {
    const reglas: Record<string, Regla> = {
      fecha: { etiqueta: 'la fecha', tipo: 'fecha' },
    }
    expect(validarCampos({ fecha: '2026-02-28' }, reglas).ok).toBe(true)
    expect(validarCampos({ fecha: '2026-02-30' }, reglas).errores.fecha).toBe(
      'La fecha no es válida'
    )
  })

  it('personalizada: corre en vacío no requerido (obligatorio condicional) y tras el tipo', () => {
    const reglas: Record<string, Regla> = {
      financiacion: { etiqueta: 'financiación' },
      entidadFinanciera: {
        etiqueta: 'la entidad financiera',
        personalizada: (v, valores) =>
          valores.financiacion && !v ? 'Indica la entidad financiera' : null,
      },
      importeSena: {
        etiqueta: 'la seña',
        tipo: 'numero',
        min: 0,
        personalizada: (v, valores) =>
          Number(v) > Number(valores.importeTotal)
            ? 'La seña no puede superar el importe total'
            : null,
      },
    }
    const r = validarCampos(
      {
        financiacion: true,
        entidadFinanciera: '',
        importeSena: '500',
        importeTotal: '300',
      },
      reglas
    )
    expect(r.errores).toEqual({
      entidadFinanciera: 'Indica la entidad financiera',
      importeSena: 'La seña no puede superar el importe total',
    })
    // el chequeo de tipo gana a la personalizada
    expect(
      validarCampos({ importeSena: '-1', importeTotal: '300' }, reglas).errores
        .importeSena
    ).toBe('Debe ser un número mayor o igual que 0')
  })

  it('primerCampoConError respeta el orden de las reglas, no el de los valores', () => {
    const reglas: Record<string, Regla> = {
      marca: { requerido: true, etiqueta: 'la marca' },
      modelo: { requerido: true, etiqueta: 'el modelo' },
      matricula: { requerido: true, etiqueta: 'la matrícula' },
    }
    const { errores } = validarCampos(
      { matricula: '', modelo: '', marca: 'Opel' },
      reglas
    )
    expect(primerCampoConError(errores)).toBe('modelo')
    expect(primerCampoConError({})).toBeNull()
  })

  it('sinError y resumenErrores', () => {
    const errores = { a: 'x', b: 'y' }
    expect(sinError(errores, 'a')).toEqual({ b: 'y' })
    expect(sinError(errores, 'z')).toBe(errores)
    expect(resumenErrores({ a: 'x' })).toBe('Revisa el campo marcado')
    expect(resumenErrores(errores)).toBe('Revisa los 2 campos marcados')
  })
})
