import {
  baseUrlApp,
  telefonoWhatsAppEmpresa,
  urlPublicaPresupuesto,
  urlReserva,
} from '@/lib/presupuesto/enlaces'

const DEFECTO = 'https://www.sevencars.es'

describe('urlReserva', () => {
  it('acepta una página de sevencars.es', () => {
    expect(
      urlReserva('https://www.sevencars.es/coches/tesla-1088', DEFECTO)
    ).toBe('https://www.sevencars.es/coches/tesla-1088')
    expect(urlReserva('https://sevencars.es/x', DEFECTO)).toBe(
      'https://sevencars.es/x'
    )
  })

  it('una imagen cae al valor por defecto', () => {
    expect(urlReserva('https://www.sevencars.es/qr/1088.png', DEFECTO)).toBe(
      DEFECTO
    )
    expect(urlReserva('https://www.sevencars.es/qr/1088.JPG', DEFECTO)).toBe(
      DEFECTO
    )
  })

  it('otro dominio, esquema raro, vacío o inválido → defecto', () => {
    expect(urlReserva('https://otro.com/sevencars.es', DEFECTO)).toBe(DEFECTO)
    expect(urlReserva('https://notsevencars.es/x', DEFECTO)).toBe(DEFECTO)
    expect(urlReserva('ftp://www.sevencars.es/x', DEFECTO)).toBe(DEFECTO)
    expect(urlReserva(null, DEFECTO)).toBe(DEFECTO)
    expect(urlReserva('', DEFECTO)).toBe(DEFECTO)
    expect(urlReserva('no es url', DEFECTO)).toBe(DEFECTO)
  })
})

describe('urlPublicaPresupuesto / baseUrlApp', () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = prev
  })

  it('usa NEXT_PUBLIC_APP_URL sin barra final', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://crm.ejemplo.es/'
    expect(baseUrlApp()).toBe('https://crm.ejemplo.es')
    expect(urlPublicaPresupuesto('abc')).toBe('https://crm.ejemplo.es/p/abc')
  })

  it('sin env cae al dominio por defecto', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(urlPublicaPresupuesto('t')).toBe('https://sevencars.vercel.app/p/t')
  })
})

describe('telefonoWhatsAppEmpresa', () => {
  const prev = process.env.NEXT_PUBLIC_WHATSAPP_EMPRESA
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_EMPRESA
    else process.env.NEXT_PUBLIC_WHATSAPP_EMPRESA = prev
  })

  it('env pública manda sobre el parámetro y se normaliza', () => {
    process.env.NEXT_PUBLIC_WHATSAPP_EMPRESA = '+34 600 000 001'
    expect(telefonoWhatsAppEmpresa('600 000 002')).toBe('34600000001')
  })

  it('sin env usa el parámetro; vacío o inválido → null', () => {
    delete process.env.NEXT_PUBLIC_WHATSAPP_EMPRESA
    expect(telefonoWhatsAppEmpresa('600 000 002')).toBe('34600000002')
    expect(telefonoWhatsAppEmpresa('')).toBeNull()
    expect(telefonoWhatsAppEmpresa('abc')).toBeNull()
  })
})
