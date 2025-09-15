# Estructura de Carpetas para Producción

## 📁 Carpetas necesarias para el funcionamiento completo

### 1. **public/uploads/** (CRÍTICO)
```
public/
├── uploads/
│   ├── deals/           # Archivos específicos de deals
│   └── documentacion/   # Archivos de documentación global
│       ├── *.pdf        # Archivos PDF subidos
│       └── documentacion-metadata.json  # Metadatos de archivos
```

### 2. **Crear carpetas automáticamente**
El sistema crea automáticamente estas carpetas cuando se suben archivos, pero para producción es recomendable crearlas manualmente:

```bash
mkdir -p public/uploads/deals
mkdir -p public/uploads/documentacion
```

### 3. **Permisos de escritura**
Asegúrate de que el servidor web tenga permisos de escritura en:
- `public/uploads/`
- `public/uploads/deals/`
- `public/uploads/documentacion/`

### 4. **Archivos de metadatos**
- `public/uploads/documentacion/documentacion-metadata.json` - Se crea automáticamente
- Contiene información de archivos subidos (nombre, tipo, fecha, etc.)

## 🚀 Para producción (Vercel/Netlify/etc.)

### Opción 1: Usar almacenamiento en la nube
- **Recomendado:** Migrar a AWS S3, Cloudinary, o similar
- Los archivos se suben directamente a la nube
- No dependes del sistema de archivos local

### Opción 2: Mantener sistema actual
- Asegúrate de que `public/uploads/` esté en el repositorio
- Los archivos se suben con el deploy
- **Limitación:** No se pueden subir archivos nuevos en producción

## 📋 Checklist de despliegue

- [ ] Crear carpetas `public/uploads/deals` y `public/uploads/documentacion`
- [ ] Verificar permisos de escritura
- [ ] Probar subida de archivos
- [ ] Verificar que los archivos se pueden descargar
- [ ] Considerar migración a almacenamiento en la nube para escalabilidad

## 🔧 Comandos útiles

```bash
# Crear estructura completa
mkdir -p public/uploads/deals
mkdir -p public/uploads/documentacion

# Verificar permisos (Linux/Mac)
chmod 755 public/uploads
chmod 755 public/uploads/deals
chmod 755 public/uploads/documentacion

# Verificar contenido
ls -la public/uploads/
ls -la public/uploads/documentacion/
```
