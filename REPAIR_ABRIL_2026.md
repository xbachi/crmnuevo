# Reparación Inmediata - Abril 2026

## Estado actual

- **8 facturas emitidas en abril 2026**
- **0 insertadas en CB 2026** ❌
- **Causa:** credenciales Google no configuradas o `COSTOBENEFICIO_DISABLED=1` cuando se emitieron

## Solución implementada

✅ Sistema completo de prevención + logging + monitoreo + reparación
✅ Migración DB aplicada (tabla `costobeneficio_logs`)
✅ Código pusheado a `main` (commits `fdaad3d`, `91582a4`)
✅ Tests pasando

## Próximos pasos (ejecutar cuando deploy esté listo)

### 1. Verificar deploy de Vercel

```bash
curl -I https://crmnuevo.vercel.app/api/admin/check-costobeneficio
```

**Esperado:** Status 200 o 401 (NO 404)

Si aún 404: verificar en Vercel Dashboard que el deploy haya terminado sin errores.

### 2. Ejecutar reparación

```bash
# Obtener secreto
export SECRET=$(grep N8N_INVOICE_WEBHOOK_SECRET .env.local | cut -d'=' -f2 | tr -d '"' | tr -d "'")

# DRY-RUN (ver qué insertaría)
curl -s -X POST "https://crmnuevo.vercel.app/api/admin/repair-costobeneficio?year=2026&dryRun=true" \
  -H "X-Admin-Secret: $SECRET" | python3 -m json.tool

# Si el output muestra las 8 facturas de abril → continuar

# EJECUTAR REPAIR
curl -s -X POST "https://crmnuevo.vercel.app/api/admin/repair-costobeneficio?year=2026" \
  -H "X-Admin-Secret: $SECRET" | python3 -m json.tool
```

### 3. Verificar resultado

**En la respuesta JSON:**
- `inserted`: debe ser 8
- `failed`: debe ser 0

**En CB 2026:**
- Abrir hoja en Google Sheets
- Buscar banda "ABRIL"
- Verificar 8 filas insertadas

### 4. Configurar monitoreo diario

Para que NO vuelva a pasar:

```bash
# Verificar diariamente (9 AM)
curl -X GET "https://crmnuevo.vercel.app/api/admin/check-costobeneficio?year=2026" \
  -H "X-Admin-Secret: $SECRET"
```

**Respuesta esperada si todo OK:**
```json
{
  "ok": true,
  "summary": {
    "total": 89,
    "missing": 0
  }
}
```

**Si `ok: false`:** revisar `missing[]` y ejecutar repair.

## Documentación completa

Ver `docs/costobeneficio-system.md` para:
- Arquitectura del sistema
- Troubleshooting
- Configuración de monitoreo automático
- Referencias de código

## Troubleshooting rápido

**404 en endpoints:**
→ Deploy no terminó o falló. Verificar Vercel Dashboard.

**401 unauthorized:**
→ `X-Admin-Secret` incorrecto. Verificar env var en Vercel.

**Error de credenciales Google:**
→ `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY` no configuradas en Vercel.
→ Agregar en Settings → Environment Variables → Redeploy.

**"duplicate" en vez de "inserted":**
→ Factura ya existe en hoja. Verificar manualmente si es verdadero duplicado.
