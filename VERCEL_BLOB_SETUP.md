# Configuración de Vercel Blob Storage para Archivos de Vehículos

## Problema Actual

Si estás recibiendo errores 500 al intentar subir archivos en la aplicación online en Vercel, es probable que **Vercel Blob Storage no esté habilitado** en tu proyecto.

## Solución: Habilitar Vercel Blob Storage

### Paso 1: Ir al Dashboard de Vercel

1. Ve a [vercel.com](https://vercel.com) e inicia sesión
2. Selecciona tu proyecto (xbachi/crmnuevo)

### Paso 2: Ir a la Pestaña "Storage"

1. En el dashboard de tu proyecto en Vercel, busca la pestaña **"Storage"** en el menú superior
2. Si no la ves, puedes ir directamente a: `https://vercel.com/[tu-usuario]/[tu-proyecto]/storage`
3. **NO es "Settings"** - debe ser una pestaña separada llamada **"Storage"**

### Paso 3: Crear un Almacén de Blobs

1. En la página de Storage, haz clic en el botón **"Connect Database"** (o "Create Database")
2. En la sección **"Create New"**, selecciona **"Blob"** y haz clic en **"Continue"**
3. Selecciona **"Create a new Blob store"**
4. Asigna un nombre al almacén de blobs (por ejemplo: "vehiculos-files" o "archivos-vehiculos")
5. Selecciona los entornos donde quieres que el token esté disponible:
   - ✅ **Production** (recomendado)
   - ✅ **Preview** (opcional)
   - ✅ **Development** (opcional)
6. Haz clic en **"Create"** para crear el almacén de blobs
7. Esto creará automáticamente la variable de entorno `BLOB_READ_WRITE_TOKEN` en tu proyecto

### Paso 4: Verificar Variables de Entorno

1. Ve a **Settings** > **Environment Variables**
2. Verifica que existe la variable `BLOB_READ_WRITE_TOKEN`
3. Si no existe automáticamente, Vercel la debería haber creado al crear el almacén de blobs
4. Para usar la variable localmente (opcional), ejecuta: `vercel env pull`

### Paso 5: Redesplegar la Aplicación

1. Después de habilitar Blob Storage, necesitas hacer un nuevo deploy
2. Puedes hacer un **redeploy** desde el dashboard de Vercel
3. O hacer push de cualquier cambio a tu repositorio para activar un nuevo deploy

## Verificación

Una vez habilitado, los archivos que subas en la sección de inversores deberían:

- ✅ Subirse correctamente sin errores 500
- ✅ Almacenarse en Vercel Blob Storage
- ✅ Estar disponibles permanentemente (no se borran con cada deploy)
- ✅ Ser accesibles públicamente a través de URLs proporcionadas por Vercel

## Notas Importantes

- **En desarrollo local**: Los archivos se siguen guardando en `public/uploads/vehiculos/`
- **En producción (Vercel)**: Los archivos se guardan en Vercel Blob Storage automáticamente
- **No es necesario** configurar manualmente la variable `BLOB_READ_WRITE_TOKEN` - Vercel la crea automáticamente cuando habilitas Blob Storage
- **El código ya está configurado** para usar Blob Storage automáticamente cuando detecta que está en Vercel

## Costos

Vercel Blob Storage tiene un plan gratuito que incluye:

- Hasta cierto límite de almacenamiento gratuito
- Consulta los precios actualizados en la documentación de Vercel

## Si el Problema Persiste

Si después de habilitar Blob Storage sigues teniendo errores:

1. **Revisa los logs de Vercel**: Ve a tu proyecto > **Deployments** > selecciona el último deployment > **Logs**
2. **Verifica el mensaje de error**: Los logs ahora mostrarán información más detallada sobre qué está fallando
3. **Contacta a Vercel Support**: Si el problema es con la configuración de Blob Storage

## Logs Mejorados

El código ahora incluye logs mejorados que te ayudarán a diagnosticar problemas:

- ✅ Indica si el token de Blob está disponible
- ✅ Muestra mensajes de error detallados
- ✅ Proporciona información sobre qué está fallando exactamente
