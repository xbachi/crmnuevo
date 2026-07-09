# Precio de COMPRA de coches en depósito / consignación / "coches R"

Cómo cargar el `precioCompra` (columna G de "CB 2026") para coches que NO tienen
factura de compra estándar. Documentado tras un incidente real (ver "Regla de oro").

## Por qué son distintos

Los coches **de particular, depósito (`D-`) o "coches R"** se compran bajo régimen
**REBU** (Bienes Usados) → **no hay factura, hay un CONTRATO de compraventa**. Ese
contrato es un **PDF con texto** o, muy a menudo, un **.jpeg escaneado** (a veces
`.doc`). El monto está en la cláusula:

> "El precio de la compra-venta se fija en **18.100€** (dieciocho mil cien euros)
> impuestos incluidos (REBU)..."

## Dónde están los contratos (OneDrive)

Hay que buscar por matrícula, **recursivo**, en estas rutas (el coche puede estar
en compras o, si ya se vendió, dentro de VENDIDOS):

- `1_Ventas/-------Consignacion`
- `1_Ventas/----VENDIDOS` (y `.../0--------------------Coches-R`)
- `1_Ventas/-----------Coches R`
- `3_Compras/--------Consignacion`
- `3_Compras/----VENDIDOS` (y `.../COCHES R`)
- `3_Compras/-----------Coches R`

En el server: `/mnt/onedrive/<ruta>`. La carpeta del coche lleva la matrícula en
el nombre (ej. `D-4-A4-Avant 1187MGT`) y adentro el contrato
(`Contrato compra ... .jpeg`, `Contrato depósito.jpeg`, `PAGO VEHICULO ....pdf`).

## 🔴 Regla de oro: NO extraer el monto automáticamente de escaneos

**Un scan automático que toma "el mayor número" del PDF carga BASURA.** Ocurrió
(2026-07-09): se cargaron `47.104` (VW Tiguan) y `156.372` (Mazda) — números que
eran IDs/registros, no el precio. Hubo que revertir DB + hoja CB. Además los
contratos escaneados (.jpeg/.doc) **el server no los puede OCR**.

**Método FIABLE (el único que se debe usar):**
1. Copiar el contrato a local: `ssh root@server "base64 -w0 '<ruta>'" | base64 -d > contrato.jpeg`
2. **Leerlo visualmente** (herramienta de lectura de imágenes) → ver el monto exacto
   (viene también en letras, sin ambigüedad).
3. Cargar verificado:
   ```
   POST /api/vehiculos/gasto  (X-Webhook-Secret)
   { "matricula": "1187MGT", "tipo": "compra", "importe": 18100,
     "numeroFactura": "CONTRATO-<matricula>", "proveedor": "particular-rebu" }
   ```
   Idempotente por `numeroFactura` estable. El auto-resync (P1) refleja G en CB solo.

## Revertir una carga equivocada

```sql
DELETE FROM gasto_facturas WHERE numero_factura = 'CONTRATO-<mat>';
-- recomputar: UPDATE "Vehiculo" SET "precioCompra" = (SELECT COALESCE(SUM(importe),0)
--   FROM gasto_facturas WHERE vehiculo_id=<id> AND tipo='compra') WHERE id=<id>;
```
Y limpiar la celda de la hoja: `POST /api/admin/resync-costobeneficio?clearCompra=<mat>`.

## Config a futuro (recomendado)

No automatizar la extracción de montos de contratos escaneados. En su lugar: al
archivar el contrato, registrar el monto en un paso (o guardar el contrato como PDF
con texto). Un OCR ciego sobre imágenes de contratos = riesgo de datos financieros
erróneos.
