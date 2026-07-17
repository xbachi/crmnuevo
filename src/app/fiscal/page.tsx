/**
 * /fiscal no tiene contenido propio: el trabajo del módulo empieza en la bandeja
 * de validación. Sin esto, entrar por el link "Fiscal" da 404.
 */

import { redirect } from 'next/navigation'

export default function FiscalIndexPage() {
  redirect('/fiscal/validacion')
}
