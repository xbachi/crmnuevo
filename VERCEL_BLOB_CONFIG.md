# Configuración de Vercel Blob Storage

## Problema

Los archivos se suben correctamente en local pero no en Vercel (producción).

## Solución

Necesitas configurar la variable de entorno `BLOB_READ_WRITE_TOKEN` en Vercel.

## Pasos para configurar:

1. **Obtener el token de Vercel Blob:**
   - Ve a tu dashboard de Vercel: https://vercel.com/dashboard
   - Selecciona tu proyecto
   - Ve a **Settings** → **Storage**
   - Si no tienes Blob Storage creado, créalo primero
   - Copia el token `BLOB_READ_WRITE_TOKEN`

2. **Agregar la variable de entorno en Vercel:**
   - En el dashboard de Vercel, ve a **Settings** → **Environment Variables**
   - Agrega una nueva variable:
     - **Name:** `BLOB_READ_WRITE_TOKEN`
     - **Value:** (pega el token que copiaste)
     - **Environment:** Production, Preview, Development (marca todas)
   - Haz clic en **Save**

3. **Redeploy:**
   - Después de agregar la variable, Vercel debería hacer un redeploy automático
   - Si no, ve a **Deployments** y haz clic en **Redeploy** en el último deploy

## Verificación

Una vez configurado, cuando subas un archivo en producción deberías ver en los logs de Vercel:

- `📤 [VEHICULO UPLOAD] Subiendo a Vercel Blob Storage... Token presente: true`
- `✅ [VEHICULO UPLOAD] Archivo subido a Blob: [URL]`

Si ves `Token presente: false`, significa que la variable de entorno no está configurada correctamente.

## Notas importantes:

- Los archivos subidos a Vercel Blob Storage son **permanentes** y no se pierden entre deploys
- Los archivos se almacenan con el prefijo `vehiculos/{vehiculoId}/`
- Los archivos son públicos y accesibles mediante URL directa
- El almacenamiento tiene límites según tu plan de Vercel
