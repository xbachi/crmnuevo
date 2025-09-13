# 🔄 Git Workflow - SevenCars CRM

## 📋 Comandos Básicos

### Ver estado actual
```bash
git status
```

### Ver historial de commits
```bash
git log --oneline
```

### Ver cambios en archivos
```bash
git diff
```

## 🚀 Workflow de Desarrollo

### 1. Antes de hacer cambios
```bash
# Verificar que estamos en la versión estable
git status
git log --oneline -5
```

### 2. Hacer cambios
```bash
# Hacer cambios en el código
# Probar que funcione
pnpm dev
```

### 3. Commit de cambios
```bash
# Agregar archivos modificados
git add .

# Commit con mensaje descriptivo
git commit -m "✨ FEATURE: Descripción del cambio

- Detalle 1
- Detalle 2
- Detalle 3"
```

### 4. Si algo falla - ROLLBACK
```bash
# Ver historial
git log --oneline

# Rollback al commit anterior
git reset --hard HEAD~1

# O rollback a un commit específico
git reset --hard <commit-hash>
```

## 🏷️ Convención de Commits

### Tipos de commits:
- `✨ FEATURE:` - Nueva funcionalidad
- `🐛 FIX:` - Corrección de bugs
- `🎨 STYLE:` - Cambios de estilo/UI
- `♻️ REFACTOR:` - Refactorización de código
- `📚 DOCS:` - Documentación
- `⚡ PERFORMANCE:` - Mejoras de rendimiento
- `🔧 CONFIG:` - Configuración

### Ejemplos:
```bash
git commit -m "✨ FEATURE: Agregar búsqueda de vehículos"
git commit -m "🐛 FIX: Corregir error en formulario de carga"
git commit -m "🎨 STYLE: Mejorar diseño de tarjetas Kanban"
git commit -m "♻️ REFACTOR: Optimizar componente Navigation"
```

## 🚨 Rollback de Emergencia

### Si la aplicación no funciona:
```bash
# 1. Ver último commit estable
git log --oneline

# 2. Rollback al commit estable
git reset --hard <commit-hash>

# 3. Limpiar cache de Next.js
rm -rf .next
# En Windows: rmdir /s /q .next

# 4. Reinstalar dependencias
pnpm install

# 5. Iniciar servidor
pnpm dev
```

## 📊 Estados de Git

### Working Directory (Archivos modificados)
```bash
git status
```

### Staging Area (Archivos preparados)
```bash
git diff --cached
```

### Repository (Commits guardados)
```bash
git log --oneline
```

## 🔍 Comandos Útiles

### Ver cambios específicos
```bash
# Ver cambios en un archivo
git diff src/app/page.tsx

# Ver cambios en el último commit
git show HEAD
```

### Deshacer cambios
```bash
# Deshacer cambios en archivo específico
git checkout -- src/app/page.tsx

# Deshacer todos los cambios
git checkout -- .
```

### Crear rama para experimentos
```bash
# Crear nueva rama
git checkout -b experimento-design-system

# Volver a main
git checkout main

# Eliminar rama
git branch -d experimento-design-system
```

## 🎯 Mejores Prácticas

### ✅ HACER:
- Commit frecuente con mensajes descriptivos
- Probar antes de hacer commit
- Usar rollback si algo falla
- Mantener commits pequeños y enfocados

### ❌ NO HACER:
- Commit de código que no funciona
- Commits muy grandes con muchos cambios
- Ignorar errores de compilación
- Trabajar sin git (sin versiones)

## 🚀 Flujo Recomendado

1. **Hacer cambio pequeño**
2. **Probar que funcione** (`pnpm dev`)
3. **Commit inmediato** con mensaje descriptivo
4. **Si falla** → Rollback inmediato
5. **Repetir** con cambios más pequeños

## 📝 Ejemplo de Workflow

```bash
# 1. Estado inicial
git status
git log --oneline -3

# 2. Hacer cambio
# Editar archivo...

# 3. Probar
pnpm dev
# Verificar que funcione en navegador

# 4. Commit
git add .
git commit -m "✨ FEATURE: Agregar botón de búsqueda"

# 5. Si algo falla
git reset --hard HEAD~1
```

---

**💡 Tip:** Siempre hacer commits pequeños y probar antes de commitear. Es mejor hacer 10 commits pequeños que 1 commit grande que rompa todo.
