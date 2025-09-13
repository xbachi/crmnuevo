# 🚀 Guía de Deployment - CRM Vehículos

## 📋 Resumen de Mejoras Implementadas

### ✅ **Optimizaciones de Base de Datos**
- **Migración de SQLite a PostgreSQL** para producción
- **Índices optimizados** para consultas rápidas
- **Relaciones bien definidas** entre entidades
- **Tipos de datos optimizados** (Decimal para precios)

### ✅ **Sistema de Cache con Redis**
- **Cache automático** en consultas frecuentes
- **Invalidación inteligente** de cache
- **TTL configurable** por tipo de datos
- **Fallback graceful** sin Redis en desarrollo

### ✅ **API Optimizada**
- **Paginación** para listas grandes
- **Filtros avanzados** con búsqueda
- **Headers de cache** para mejor performance
- **Validación robusta** de datos

### ✅ **Frontend Optimizado**
- **Componentes de paginación** y búsqueda
- **Lazy loading** de imágenes
- **Optimizaciones de bundle** con Next.js
- **Compresión de assets** automática

---

## 🐳 **Deployment con Docker (Recomendado)**

### **Paso 1: Preparar el entorno**
```bash
# Clonar el repositorio
git clone <tu-repo>
cd crmseven-master

# Instalar dependencias
npm install
```

### **Paso 2: Configurar variables de entorno**
Crear archivo `.env.production`:
```env
# Database
DATABASE_URL="postgresql://crm_user:crm_password@postgres:5432/crm_vehiculos"

# Redis Cache
REDIS_URL="redis://redis:6379"

# Google Sheets (opcional)
GOOGLE_SERVICE_ACCOUNT_EMAIL=tu-email@tu-proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTU_CLAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n"

# App Configuration
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://tu-dominio.com"
```

### **Paso 3: Levantar servicios con Docker**
```bash
# Levantar PostgreSQL y Redis
npm run docker:up

# Esperar que los servicios estén listos (30-60 segundos)
docker-compose logs -f
```

### **Paso 4: Configurar base de datos**
```bash
# Generar cliente Prisma
npm run db:generate

# Crear tablas en PostgreSQL
npm run db:push

# Migrar datos existentes (si tienes datos en JSON)
npm run migrate:postgresql
```

### **Paso 5: Construir y ejecutar la aplicación**
```bash
# Construir imagen Docker
docker build -t crm-vehiculos .

# Ejecutar aplicación
docker run -p 3000:3000 --env-file .env.production crm-vehiculos
```

---

## ☁️ **Deployment en la Nube**

### **Opción 1: Vercel (Más fácil)**
1. **Conectar repositorio** en Vercel
2. **Configurar variables de entorno**:
   - `DATABASE_URL`: URL de PostgreSQL (Supabase, Neon, etc.)
   - `REDIS_URL`: URL de Redis (Upstash, Railway, etc.)
3. **Deploy automático** en cada push

### **Opción 2: Railway**
1. **Conectar repositorio** en Railway
2. **Agregar servicios**:
   - PostgreSQL Database
   - Redis
   - Web Service (Next.js)
3. **Configurar variables** automáticamente

### **Opción 3: DigitalOcean App Platform**
1. **Crear app** desde GitHub
2. **Agregar databases**:
   - PostgreSQL Managed Database
   - Redis Managed Database
3. **Configurar buildpacks** para Node.js

---

## 📊 **Proveedores de Base de Datos Recomendados**

### **PostgreSQL**
- **Supabase** (Gratis hasta 500MB)
- **Neon** (Gratis hasta 3GB)
- **PlanetScale** (MySQL compatible)
- **Railway** (PostgreSQL + Redis)

### **Redis**
- **Upstash** (Serverless Redis)
- **Redis Cloud** (Redis Labs)
- **Railway Redis**

---

## 🔧 **Configuración de Producción**

### **Variables de Entorno Requeridas**
```env
# Base de datos (REQUERIDO)
DATABASE_URL="postgresql://user:password@host:port/database"

# Cache (OPCIONAL - mejora performance)
REDIS_URL="redis://host:port"

# Google Sheets (OPCIONAL)
GOOGLE_SERVICE_ACCOUNT_EMAIL=""
GOOGLE_PRIVATE_KEY=""

# App (REQUERIDO)
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://tu-dominio.com"
```

### **Configuración de Dominio**
1. **Configurar DNS** apuntando a tu servicio
2. **Configurar SSL** (automático en Vercel/Railway)
3. **Actualizar** `NEXT_PUBLIC_APP_URL`

---

## 📈 **Monitoreo y Performance**

### **Métricas Recomendadas**
- **Uptime**: 99.9%+
- **Response time**: <200ms
- **Database queries**: <50ms
- **Cache hit ratio**: >80%

### **Herramientas de Monitoreo**
- **Vercel Analytics** (si usas Vercel)
- **Sentry** para error tracking
- **PostgreSQL logs** para queries lentas
- **Redis monitoring** para cache

---

## 🚨 **Troubleshooting**

### **Error: Database connection failed**
```bash
# Verificar conexión
npm run db:studio

# Verificar variables de entorno
echo $DATABASE_URL
```

### **Error: Redis connection failed**
```bash
# Verificar Redis
redis-cli ping

# Continuar sin Redis (modo degradado)
# La app funcionará sin cache
```

### **Error: Build failed**
```bash
# Limpiar cache
rm -rf .next node_modules
npm install
npm run build
```

---

## 📋 **Checklist de Deployment**

- [ ] **Base de datos PostgreSQL** configurada
- [ ] **Redis** configurado (opcional)
- [ ] **Variables de entorno** configuradas
- [ ] **Dominio** configurado
- [ ] **SSL** habilitado
- [ ] **Monitoreo** configurado
- [ ] **Backup** de base de datos configurado
- [ ] **Health checks** funcionando

---

## 🎯 **Resultado Esperado**

Después del deployment tendrás:
- ✅ **Aplicación escalable** con PostgreSQL
- ✅ **Performance optimizada** con Redis cache
- ✅ **API rápida** con paginación y filtros
- ✅ **Frontend optimizado** con lazy loading
- ✅ **Deployment automatizado** con CI/CD
- ✅ **Monitoreo** y logging configurado

**Performance esperada:**
- 🚀 **Carga inicial**: <2 segundos
- 🔍 **Búsquedas**: <100ms
- 📊 **Listas paginadas**: <200ms
- 💾 **Cache hit ratio**: >80%
