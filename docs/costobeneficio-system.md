# Sistema de Prevención y Reparación - CostoBeneficio

Sistema completo para prevenir y detectar facturas faltantes en la hoja CB 2026.

## Problema resuelto

**Síntoma:** Facturas de venta emitidas en CRM que NO aparecen en la hoja CB 2026.

**Caso abril 2026:**
- 8 facturas emitidas en abril
- 0 insertadas en CB 2026
- Causas: credenciales no configuradas, `COSTOBENEFICIO_DISABLED=1`, errores silenciosos (best-effort)

## Solución implementada

### 1. Logging obligatorio (`costobeneficio_logs`)

**Tabla nueva:**
```sql
CREATE TABLE costobeneficio_logs (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  success BOOLEAN NOT NULL,          -- TRUE = insertó/duplicate, FALSE = error
  action TEXT NOT NULL,              -- 'inserted' | 'duplicate' | 'error' | 'skipped'
  detail TEXT NOT NULL,
  warnings TEXT[],
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Cambio en código:**
- `notifyCostoBeneficio()` ahora SIEMPRE loguea en `costobeneficio_logs`
- Nunca silencioso: todo éxito/error queda registrado
- Archivo: `src/lib/costoBeneficio.ts` línea 198-230

### 2. Endpoint de monitoreo

**GET `/api/admin/check-costobeneficio?year=2026`**

Verifica que TODAS las facturas emitidas estén en la hoja.

```bash
curl -X GET "https://crmnuevo.vercel.app/api/admin/check-costobeneficio?year=2026" \
  -H "X-Admin-Secret: $SECRET"
```

**Respuesta:**
```json
{
  "ok": false,
  "summary": {
    "year": 2026,
    "total": 89,
    "inSheet": 81,
    "missing": 8,
    "byMonth": {
      "2026-04": 8
    }
  },
  "missing": [
    {
      "date": "2026-04-01",
      "number": "F-2026-016",
      "ref": "#1074",
      "plate": "8061KRN",
      "dealNumber": "CCV-2024-0016"
    },
    ...
  ]
}
```

**Uso:**
- Llamar diariamente desde cron (AM)
- Si `ok: false`, alertar y revisar
- Archivo: `src/app/api/admin/check-costobeneficio/route.ts`

### 3. Endpoint de reparación

**POST `/api/admin/repair-costobeneficio?year=2026&dryRun=true`**

Inserta facturas faltantes en CB 2026.

```bash
# 1. DRY-RUN: ver qué insertaría
curl -X POST "https://crmnuevo.vercel.app/api/admin/repair-costobeneficio?year=2026&dryRun=true" \
  -H "X-Admin-Secret: $SECRET"

# 2. REAL: insertar
curl -X POST "https://crmnuevo.vercel.app/api/admin/repair-costobeneficio?year=2026" \
  -H "X-Admin-Secret: $SECRET"
```

**Respuesta:**
```json
{
  "ok": true,
  "year": 2026,
  "totalInvoices": 89,
  "missing": [ ... ],
  "inserted": 8,
  "failed": 0,
  "details": "..."
}
```

**Lógica:**
1. Carga todas las facturas emitidas del año de `invoices`
2. Carga todas las filas de CB 2026 (cols A-E: fecha, mes, ref, coche, matrícula)
3. Detecta faltantes: busca por matrícula normalizada (col E) o referencia normalizada (col C)
4. Inserta llamando a `syncCostoBeneficio()` directamente (sin timeout, sin best-effort)

**Archivo:** `src/app/api/admin/repair-costobeneficio/route.ts`

### 4. Script CLI (alternativa local)

**`scripts/repair-costobeneficio.ts`**

Mismo comportamiento que el endpoint, pero ejecutable localmente con `npx tsx`.

```bash
npx tsx scripts/repair-costobeneficio.ts --year=2026 --dry-run
npx tsx scripts/repair-costobeneficio.ts --year=2026
```

**Nota:** Requiere credenciales Google configuradas localmente (`.env.local`).

### 5. Tests

**`__tests__/lib/costoBeneficioSync.test.ts`**

- Parseo de fechas (abril → índice 3 → MESES[3] = 'ABRIL')
- Casos de skip (DISABLED, sin credenciales)
- Validación de la estructura de logging

**Ejecutar:**
```bash
npm run test:unit -- __tests__/lib/costoBeneficioSync.test.ts
```

## Cómo ejecutar el repair (abril 2026)

**Pasos:**

1. **Verificar que el deploy esté listo:**
   ```bash
   curl -I https://crmnuevo.vercel.app/api/admin/check-costobeneficio
   # Debe responder 200 o 401 (no 404)
   ```

2. **Obtener el secreto:**
   ```bash
   # Desde .env.local (local) o Vercel dashboard (prod)
   export SECRET="..."
   ```

3. **DRY-RUN (ver facturas faltantes):**
   ```bash
   curl -s -X POST "https://crmnuevo.vercel.app/api/admin/repair-costobeneficio?year=2026&dryRun=true" \
     -H "X-Admin-Secret: $SECRET" \
     -H "Content-Type: application/json" | python3 -m json.tool
   ```

4. **Verificar output:**
   - `missing`: debe listar las 8 facturas de abril
   - `byMonth`: debe mostrar `"2026-04": 8`

5. **EJECUTAR REPAIR:**
   ```bash
   curl -s -X POST "https://crmnuevo.vercel.app/api/admin/repair-costobeneficio?year=2026" \
     -H "X-Admin-Secret: $SECRET" \
     -H "Content-Type: application/json" | python3 -m json.tool
   ```

6. **Verificar resultado:**
   - `inserted`: debe ser 8 (o menos si alguna ya existía)
   - `failed`: debe ser 0

7. **Validar en la hoja CB 2026:**
   - Abrir hoja en Google Sheets
   - Buscar banda "ABRIL"
   - Verificar que aparezcan las 8 filas:
     - F-2026-016 (01-abr) #1074 8061KRN
     - LEGACY-130 (12-abr) D-31 6351LRG
     - LEGACY-133 (12-abr) #1064 0886LRM
     - LEGACY-127 (12-abr) #1062 0427MLJ
     - LEGACY-129 (22-abr) #1068 0608NLF
     - LEGACY-137 (25-abr) #1037 4864NLP
     - F-2026-019 (25-abr) #D-4 1187MGT
     - F-2026-020 (25-abr) D-28 7487MGV

8. **Verificar logs:**
   ```sql
   SELECT * FROM costobeneficio_logs 
   WHERE invoice_date >= '2026-04-01' AND invoice_date < '2026-05-01'
   ORDER BY created_at DESC;
   ```

## Monitoreo continuo

**Configurar cron diario:**

Opción A - Vercel Cron (recomendado):
```json
{
  "crons": [{
    "path": "/api/admin/check-costobeneficio?year=2026",
    "schedule": "0 9 * * *"
  }]
}
```

Opción B - n8n workflow:
- Trigger: Schedule (9:00 AM diario)
- HTTP Request: GET `/api/admin/check-costobeneficio`
- IF: `ok === false`
- Slack/Email: alertar con `summary.missing` y `missing[]`

Opción C - GitHub Actions:
```yaml
name: Check CostoBeneficio
on:
  schedule:
    - cron: '0 9 * * *'
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: |
          RESPONSE=$(curl -s -X GET "https://crmnuevo.vercel.app/api/admin/check-costobeneficio?year=2026" \
            -H "X-Admin-Secret: ${{ secrets.ADMIN_SECRET }}")
          OK=$(echo $RESPONSE | jq -r '.ok')
          if [ "$OK" != "true" ]; then
            echo "❌ Facturas faltantes detectadas:"
            echo $RESPONSE | jq '.missing'
            exit 1
          fi
```

## Troubleshooting

### Error: "unauthorized"
- Verificar que `X-Admin-Secret` sea correcto
- Debe coincidir con `ADMIN_SECRET` o `N8N_INVOICE_WEBHOOK_SECRET` en Vercel

### Error: "Missing required environment variables: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY"
- Credenciales no configuradas en Vercel
- Agregar en Vercel Dashboard → Settings → Environment Variables
- Redeploy después de agregar

### Error: "COSTOBENEFICIO_DISABLED=1"
- Variable de entorno activa que skippea la sincronización
- Remover de Vercel env vars si no es intencional

### "Duplicate" en vez de "inserted"
- La factura ya existe en la hoja (por matrícula o referencia)
- Verificar manualmente en CB 2026 si realmente está duplicada
- Si es falso positivo: revisar normalización de matrícula/ref

### Timeout 20s
- `syncCostoBeneficio` tiene timeout de 20s en el flujo normal
- El endpoint de repair NO tiene timeout (llama directo sin wrapper)
- Si falla por timeout: usar endpoint repair en vez del flujo automático

### Facturas LEGACY no se insertan
- Las facturas LEGACY-* fueron migraciones, NO pasaron por `issueInvoice()`
- NO tienen log en `costobeneficio_logs`
- Para insertarlas: usar el endpoint repair (las detecta y las inserta)

## Archivos modificados/creados

**Nuevos:**
- `add-costobeneficio-logs.sql` - Migración DB
- `src/app/api/admin/check-costobeneficio/route.ts` - Endpoint monitoreo
- `src/app/api/admin/repair-costobeneficio/route.ts` - Endpoint reparación
- `scripts/repair-costobeneficio.ts` - Script CLI
- `__tests__/lib/costoBeneficioSync.test.ts` - Tests
- `docs/costobeneficio-system.md` - Esta documentación

**Modificados:**
- `src/lib/costoBeneficio.ts` - Logging obligatorio en `notifyCostoBeneficio()`
- `src/middleware.ts` - Whitelist de endpoints admin

## Commits

1. `fdaad3d` - feat(costobeneficio): sistema completo de prevención y reparación
2. `91582a4` - fix(middleware): whitelist endpoints admin de costobeneficio

## Referencias

- Hoja CB 2026: `1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM`
- Tabla de facturas: `invoices`
- Tabla de logs: `costobeneficio_logs`
- Middleware: requiere `X-Admin-Secret` en endpoints admin
