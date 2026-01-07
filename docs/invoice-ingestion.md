# Invoice Ingestion (Outlook + OneDrive) — Local → Production

## Objetivo

Procesar automáticamente facturas (PDF con texto) desde OneDrive/Outlook:

- Deduplicar (sha256, vendor+invoiceNumber, fingerprint)
- Extraer matrícula (regex)
- Detectar proveedor (NIF/IBAN/keywords)
- Clasificar categoría (reglas)
- Mover PDF en OneDrive a expediente por matrícula + subcarpeta por categoría
- Crear gasto en la ficha del vehículo (DB) con link al PDF
- Si falta matrícula / baja confianza / PDF sin texto → **Pendientes** para resolución manual

## Variables de entorno

Copiar los valores de `docs/invoices-env.example` a tu `.env.local` (no está versionado).

## Local (end-to-end)

1. Levantar Postgres + Redis:

```bash
docker-compose up -d
```

2. Aplicar migración de facturas (solo agrega tablas nuevas):

```bash
npm run db:migrate:invoices
```

3. Generar Prisma Client (si no lo hiciste):

```bash
npm run db:generate
```

4. Levantar el CRM:

```bash
npm run dev
```

5. Levantar el worker (cola BullMQ):

```bash
npm run worker:invoices:dev
```

## Ingesta (manual para pruebas)

Encolar procesamiento por `oneDriveItemId` o por `oneDrivePath`:

```bash
curl -X POST http://localhost:3000/api/invoices/ingest \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"onedrive\",\"oneDriveItemId\":\"<ITEM_ID>\"}"
```

O por path (relativo al root del drive o absoluto desde `/Concesionaria/...`):

```bash
curl -X POST http://localhost:3000/api/invoices/ingest \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"onedrive\",\"oneDrivePath\":\"/Concesionaria/FACTURAS_INBOX/2026-01/mi.pdf\"}"
```

### Ingesta desde Outlook (adjunto)

El worker puede descargar un adjunto de Outlook y subirlo a OneDrive INBOX automáticamente:

```bash
curl -X POST http://localhost:3000/api/invoices/ingest \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"outlook\",\"outlookMessageId\":\"<MESSAGE_ID>\",\"outlookAttachmentId\":\"<ATTACHMENT_ID>\"}"
```

Notas:

- `MS_GRAPH_MAILBOX_USER_ID` (o `outlookUserId` en el body) indica qué mailbox usar.

## Bandeja Pendientes (UI)

- `GET /invoices/pending`
- Lista documentos en `PENDING` o `NEEDS_REVIEW`
- Permite asignar matrícula + categoría → encola `resolve_pending`

## Producción (Vercel + worker)

**Importante**: Vercel (serverless) solo hace **enqueue**. El procesamiento pesado corre en un **worker separado** (Node).

- Deploy Next.js a Vercel (como hoy).
- Deploy/ejecutar el worker en un entorno con proceso persistente (VM, Railway, Fly.io, ECS, etc):
  - `npm ci`
  - `npm run worker:build`
  - `npm run worker:invoices`

### Seguridad (mínima)

Si definís `INVOICES_API_KEY`, entonces los endpoints `/api/invoices/*` exigen header:

- `x-api-key: <INVOICES_API_KEY>`

En local podés dejarlo vacío para no bloquear la UI.

## TODOs (próximos pasos)

- Webhooks/polling de Outlook para adjuntos → subir a INBOX y llamar `/api/invoices/ingest`
- Extracción más robusta de proveedor y totales
- UI de resolución con selección por vehículo + proveedor + edición de importes
- Seguridad server-side (API key o auth real en endpoints)
