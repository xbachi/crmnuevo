/**
 * Contactos que recibieron presupuesto de un vehículo (puro, importable desde
 * cliente). Agrupa las filas por teléfono normalizado, si no por email, si no
 * por nombre: es la lista a la que reavisar cuando el coche baja de precio.
 */
import { normalizarTelefono } from '@/lib/plantillasMensajes'
import type { EstadoPresupuesto } from './tipos'

export interface FilaContacto {
  id: number
  numero: string
  nombre_cliente: string
  telefono: string | null
  email: string | null
  estado: EstadoPresupuesto
  valido_hasta: string
  created_at: string
}

export interface ContactoPresupuesto {
  clave: string
  nombre: string
  telefono: string | null
  email: string | null
  /** Más reciente primero (mismo orden que las filas). */
  presupuestos: FilaContacto[]
}

function claveDe(f: FilaContacto): string {
  const tel = normalizarTelefono(f.telefono)
  if (tel) return `tel:${tel}`
  const mail = (f.email ?? '').trim().toLowerCase()
  if (mail) return `mail:${mail}`
  return `nombre:${f.nombre_cliente.trim().toLowerCase()}`
}

/** Filas ordenadas de más reciente a más antigua → un contacto por persona. */
export function contactosDe(filas: FilaContacto[]): ContactoPresupuesto[] {
  const porClave = new Map<string, ContactoPresupuesto>()
  for (const f of filas) {
    const clave = claveDe(f)
    const c = porClave.get(clave)
    if (c) {
      c.presupuestos.push(f)
      if (!c.telefono && f.telefono) c.telefono = f.telefono
      if (!c.email && f.email) c.email = f.email
    } else {
      porClave.set(clave, {
        clave,
        nombre: f.nombre_cliente.trim(),
        telefono: f.telefono,
        email: f.email,
        presupuestos: [f],
      })
    }
  }
  return [...porClave.values()]
}

/** Texto del WhatsApp de reaviso (el comercial lo edita antes de enviar). */
export function textoReaviso(
  nombre: string,
  vehiculo: { marca: string; modelo: string; matricula: string },
  empresa = 'Sevencars'
): string {
  const coche = [vehiculo.marca, vehiculo.modelo]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
  const matricula = vehiculo.matricula.trim()
  const desc = matricula ? `${coche} (${matricula})` : coche
  return `Hola ${nombre.trim()}, te escribimos de ${empresa} por el ${desc} que te presupuestamos. Tenemos novedades de precio, ¿te interesa que te lo volvamos a pasar?`
}
