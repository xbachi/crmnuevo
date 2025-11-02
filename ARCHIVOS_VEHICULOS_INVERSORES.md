# Sistema de Archivos para Vehículos de Inversores

## 📁 Ubicación de Archivos

Los archivos se almacenan en:

```
public/uploads/vehiculos/[vehiculoId]/
├── [timestamp]-[nombre-archivo].pdf
├── [timestamp]-[nombre-archivo].jpg
└── archivos-metadata.json (metadatos)
```

## 🔄 Flujo de Funcionamiento

### 1. **Desarrollo Local**

- Los archivos se guardan físicamente en `public/uploads/vehiculos/[vehiculoId]/`
- Los metadatos se guardan en `archivos-metadata.json` en la misma carpeta
- **Después de subir archivos**, debes commitearlos a Git manualmente:
  ```bash
  git add public/uploads/vehiculos/
  git commit -m "feat: agregar archivos para vehículo X"
  git push
  ```

### 2. **Producción (Vercel)**

- Los archivos ya están en el repositorio Git
- Se sirven como archivos estáticos desde `public/uploads/`
- **NO se pueden subir archivos nuevos en producción** (filesystem es read-only)
- Todos los archivos deben estar commitados antes del deploy

## ✅ Ventajas de este Sistema

1. **Simplicidad**: No requiere configuración adicional de almacenamiento
2. **Gratuito**: No hay costos de almacenamiento en la nube
3. **Acceso directo**: Archivos servidos directamente por Vercel
4. **Versionado**: Los archivos están versionados en Git
5. **Buscable**: Los metadatos permiten buscar y filtrar

## ⚠️ Limitaciones

1. **No subida en producción**: Los archivos nuevos solo se pueden agregar localmente
2. **Tamaño del repositorio**: Muchos archivos grandes pueden hacer crecer el repo
3. **Workflow manual**: Requiere commitear archivos a Git después de subirlos

## 🔧 Workflow Recomendado

### Cuando agregues archivos:

1. **Sube el archivo** desde la interfaz del CRM (solo funciona en local)
2. **Commitéalos a Git**:
   ```bash
   git add public/uploads/vehiculos/[vehiculoId]/
   git commit -m "docs: agregar facturas para vehículo [referencia]"
   git push
   ```
3. **Espera el deploy** automático en Vercel (o haz deploy manual)

### Para inversores en producción:

- Los archivos ya están disponibles automáticamente
- Solo pueden **descargarlos**, no subirlos
- Los archivos están siempre disponibles, no se borran

## 📝 Estructura de Metadatos

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

## 🚀 Para Migrar a Almacenamiento en la Nube (Futuro)

Si necesitas subir archivos en producción, considera:

- **Supabase Storage**
- **AWS S3**
- **Cloudinary**
- **Vercel Blob Storage**

Esto requeriría refactorizar los endpoints de archivos para usar la API de almacenamiento en la nube en lugar del sistema de archivos local.
