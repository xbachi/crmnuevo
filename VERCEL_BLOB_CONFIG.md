# Configuración de Vercel Blob Storage

## ✅ Estado Actual

Tienes Vercel Blob Storage creado y funcionando. La carpeta `vehiculos/` ya existe en tu storage.

## 🔧 Verificación Necesaria

### 1. **Verificar que Blob Storage esté vinculado al proyecto:**

- Ve a tu dashboard de Vercel: https://vercel.com/dashboard
- Selecciona tu proyecto (el que tiene el CRM)
- Ve a **Settings** → **Storage**
- Verifica que tu Blob Storage esté **vinculado** al proyecto
- Si ves un botón "Connect" o "Link Storage", haz clic en él
- El nombre del storage debería aparecer en la lista de storages vinculados

### 2. **Verificar variables de entorno:**

- En el dashboard de Vercel, ve a **Settings** → **Environment Variables**
- Busca `BLOB_READ_WRITE_TOKEN`
- **Si NO está presente:**
  - Vercel debería agregarlo automáticamente cuando vincules el storage
  - Si no aparece, puedes obtenerlo desde:
    - **Storage** → Selecciona tu store → **Settings** → Copia el token
  - Agrégalo manualmente:
    - **Name:** `BLOB_READ_WRITE_TOKEN`
    - **Value:** (pega el token)
    - **Environment:** Production, Preview, Development (marca todas)

### 3. **Redeploy:**

- Después de vincular el storage o agregar la variable, haz un redeploy:
- Ve a **Deployments**
- Haz clic en los tres puntos del último deploy → **Redeploy**

## 🔍 Verificación en Logs

Una vez configurado correctamente, cuando subas un archivo en producción deberías ver en los logs de Vercel (Function Logs):

- `📤 [VEHICULO UPLOAD] Subiendo a Vercel Blob Storage... Token presente: true`
- `✅ [VEHICULO UPLOAD] Archivo subido a Blob: [URL]`

Si ves `Token presente: false`, significa que:

1. El Blob Storage no está vinculado al proyecto, O
2. La variable `BLOB_READ_WRITE_TOKEN` no está configurada

## 📝 Notas importantes:

- Los archivos subidos a Vercel Blob Storage son **permanentes** y no se pierden entre deploys
- Los archivos se almacenan con el prefijo `vehiculos/{vehiculoId}/`
- Los archivos son públicos y accesibles mediante URL directa
- El almacenamiento tiene límites según tu plan de Vercel

## 🐛 Troubleshooting

Si los archivos aún no se suben después de vincular:

1. **Verifica los logs de Vercel:**
   - Ve a **Deployments** → Selecciona el último deploy → **Function Logs**
   - Busca errores relacionados con Blob Storage

2. **Verifica el prefijo en el código:**
   - El código usa `vehiculos/${vehiculoId}/` como prefijo
   - En el Browser de Blob Storage deberías ver carpetas como `vehiculos/1014/`, `vehiculos/1019/`, etc.

3. **Prueba manualmente:**
   - Intenta subir un archivo desde la interfaz
   - Revisa la consola del navegador (F12) para ver errores
   - Revisa los logs de Vercel en tiempo real
