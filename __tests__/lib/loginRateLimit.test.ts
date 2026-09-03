/** @jest-environment node */

import {
  claveLogin,
  estaBloqueado,
  limpiar,
  registrarFallo,
  VENTANA_MS,
} from '@/lib/loginRateLimit'

const T0 = 1_700_000_000_000

describe('loginRateLimit', () => {
  it('claveLogin normaliza el usuario a minúsculas', () => {
    expect(claveLogin('1.2.3.4', '  Admin@Test.COM ')).toBe(
      '1.2.3.4:admin@test.com'
    )
  })

  it('4 fallos no bloquean', () => {
    const k = 'ip-a:cuatro'
    for (let i = 0; i < 4; i++) registrarFallo(k, T0 + i * 1000)
    expect(estaBloqueado(k, T0 + 5000)).toBe(false)
  })

  it('5 fallos en 15 minutos bloquean', () => {
    const k = 'ip-b:cinco'
    let ultimo = { intentos: 0, bloqueado: false }
    for (let i = 0; i < 5; i++) ultimo = registrarFallo(k, T0 + i * 60_000)
    expect(ultimo).toEqual({ intentos: 5, bloqueado: true })
    expect(estaBloqueado(k, T0 + 5 * 60_000)).toBe(true)
  })

  it('el bloqueo expira a los 15 minutos del último fallo', () => {
    const k = 'ip-c:expira'
    for (let i = 0; i < 5; i++) registrarFallo(k, T0)
    expect(estaBloqueado(k, T0 + VENTANA_MS - 1)).toBe(true)
    expect(estaBloqueado(k, T0 + VENTANA_MS)).toBe(false)
    // tras vencer, el contador arranca de cero
    expect(registrarFallo(k, T0 + VENTANA_MS + 1).intentos).toBe(1)
  })

  it('fallos separados por más de 15 minutos no se acumulan', () => {
    const k = 'ip-d:ventana'
    for (let i = 0; i < 4; i++) registrarFallo(k, T0)
    expect(registrarFallo(k, T0 + VENTANA_MS + 1)).toEqual({
      intentos: 1,
      bloqueado: false,
    })
    expect(estaBloqueado(k, T0 + VENTANA_MS + 2)).toBe(false)
  })

  it('un login correcto limpia la entrada', () => {
    const k = 'ip-e:exito'
    for (let i = 0; i < 5; i++) registrarFallo(k, T0)
    expect(estaBloqueado(k, T0 + 1)).toBe(true)
    limpiar(k)
    expect(estaBloqueado(k, T0 + 1)).toBe(false)
    expect(registrarFallo(k, T0 + 2).intentos).toBe(1)
  })

  it('las claves son independientes entre sí', () => {
    for (let i = 0; i < 5; i++) registrarFallo('ip-f:uno', T0)
    expect(estaBloqueado('ip-f:uno', T0)).toBe(true)
    expect(estaBloqueado('ip-f:dos', T0)).toBe(false)
    expect(estaBloqueado('ip-g:uno', T0)).toBe(false)
  })
})
