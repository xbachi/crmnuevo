# Sistema de Archivos para Vehículos de Inversores

## 📁 Ubicación de Archivos

### Desarrollo Local

Los archivos se almacenan en:

```
public/uploads/vehiculos/[vehiculoId]/
├── [timestamp]-[nombre-archivo].pdf
├── [timestamp]-[nombre-archivo].jpg
└── archivos-metadata.json (metadatos)
```

### Producción (Vercel)

Los archivos se almacenan en **Vercel Blob Storage**:

- URL: `https://[project].public.blob.vercel-storage.com/vehiculos/[vehiculoId]/[filename]`
- Automáticamente servidos por Vercel
- Persistentes entre deploys
- **1GB gratis** incluido en Vercel

## 🔄 Flujo de Funcionamiento

### 1. **Desarrollo Local**

- Los archivos se guardan físicamente en `public/uploads/vehiculos/[vehiculoId]/`
- Los metadatos se guardan en `archivos-metadata.json`
- Funciona sin configuración adicional

### 2. **Producción (Vercel)**

- Los archivos se suben automáticamente a **Vercel Blob Storage**
- Se pueden subir archivos nuevos **en cualquier momento** desde el CRM
- Los archivos persisten automáticamente entre deploys
- **No requiere configurar nada adicional** - Vercel detecta `@vercel/blob` automáticamente
- Los archivos se sirven con URLs CDN optimizadas

## ✅ Ventajas de este Sistema

1. **Híbrido**: Filesystem en desarrollo, Blob Storage en producción
2. **Subida en producción**: Puedes agregar facturas desde el CRM en producción
3. **Persistencia**: Los archivos nunca se borran entre deploys
4. **Automático**: No requiere configuración manual en Vercel
5. **Gratuito**: Vercel Blob incluye 1GB gratis
6. **CDN**: Los archivos se sirven desde la CDN global de Vercel

## 🔧 Uso del Sistema

### Administrador

1. Accede al perfil del inversor en el CRM
2. Abre la tarjeta del vehículo
3. Expande la sección "Archivos"
4. Haz clic en "Subir Archivo"
5. Selecciona el archivo (PDF, JPG, etc.)
6. El archivo se sube automáticamente y permanece disponible para siempre

### Inversor

1. Accede a su perfil en el CRM
2. Ve sus vehículos en el dashboard
3. Abre un vehículo específico
4. Expande la sección "Archivos"
5. Descarga las facturas de costes cuando las necesite

## 📝 Estructura de Metadatos

**Desarrollo:**

```json
[
  {
    "id": "1762084644620",
    "name": "nombre-original.pdf",
    "fileName": "1762084644620-nombre-original.pdf",
    "size": 626770,
    "type": "application/pdf",
    "uploadDate": "2025-11-02T12:04:04.620Z",
    "path": "/uploads/vehiculos/278/1762084644620-nombre-original.pdf"
  }
]
```

**Producción:**

```json
[
  {
    "id": "1762084644620",
    "name": "nombre-original.pdf",
    "fileName": "1762084644620-nombre-original.pdf",
    "size": 626770,
    "type": "application/pdf",
    "uploadDate": "2025-11-02T12:04:04.620Z",
    "path": "https://project.public.blob.vercel-storage.com/vehiculos/278/..."
  }
]
```

## 🔑 Permisos

- **Administrador**: Puede subir, ver, descargar y eliminar archivos
- **Inversor**: Solo puede ver y descargar archivos
- Los inversores no pueden subir ni eliminar archivos

## ⚡ Rendimiento

- **CDN**: Archivos servidos desde edge locations cercanas al usuario
- **Optimización**: Vercel optimiza automáticamente las imágenes
- **Escalabilidad**: Maneja miles de archivos sin problemas

## 💰 Costos

- **Gratis hasta 1GB**: Incluido en el plan gratuito de Vercel
- **Después**: $0.15/GB mes para almacenamiento adicional
- **Transferencia**: Incluida en el plan de Vercel

## 🔄 Migración desde el Sistema Anterior

Si ya tienes archivos en `public/uploads/vehiculos/`:

1. Los archivos existentes siguen funcionando
2. Los nuevos archivos se suben automáticamente a Blob Storage en producción
3. No necesitas migrar nada manualmente
4. El sistema funciona automáticamente en ambos entornos
