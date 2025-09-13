# 🗄️ Configuración de Supabase para SevenCars CRM

## 📋 Pasos para Configurar Supabase

### 1. **Crear Cuenta en Supabase**
1. Ve a [https://supabase.com](https://supabase.com)
2. Click en "Start your project"
3. Registrate con GitHub o email
4. Confirma tu cuenta

### 2. **Crear Nuevo Proyecto**
1. Click en "New Project"
2. Elige tu organización
3. Nombre del proyecto: `sevencars-crm`
4. Password: `[elige una contraseña segura]`
5. Región: `Frankfurt` (más cerca de España)
6. Click "Create new project"

### 3. **Obtener Connection String**
1. Ve a **Settings** > **Database**
2. Scroll down hasta **Connection string**
3. Selecciona **URI** en el dropdown
4. Copia la URL que aparece

### 4. **Configurar Variables de Entorno**
Crea un archivo `.env.local` en la raíz del proyecto:

```bash
# .env.local
DATABASE_URL="postgresql://postgres:[TU_PASSWORD]@db.[TU_PROJECT_REF].supabase.co:5432/postgres"
```

### 5. **Ejecutar Migraciones**
```bash
# Instalar Prisma CLI si no lo tienes
npm install -g prisma

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma db push

# Ver datos en el panel de Supabase
npx prisma studio
```

## 🔧 Configuración del Proyecto

### **Actualizar Prisma Schema**
El archivo `prisma/schema.prisma` ya está configurado para PostgreSQL:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ... resto del schema
```

### **Scripts de Package.json**
Agregar estos scripts útiles:

```json
{
  "scripts": {
    "db:push": "prisma db push",
    "db:studio": "prisma studio",
    "db:generate": "prisma generate",
    "db:seed": "node prisma/seed.js"
  }
}
```

## 📊 Límites del Plan Gratuito

### **Supabase Free Tier:**
- ✅ **500MB** de almacenamiento
- ✅ **2GB** de transferencia/mes
- ✅ **500MB** de backup
- ✅ **Hasta 50,000** filas
- ✅ **SSL** incluido
- ✅ **Panel web** completo

### **Para tu CRM esto significa:**
- ✅ **~10,000 vehículos** aproximadamente
- ✅ **~1,000 inversores**
- ✅ **~5,000 clientes**
- ✅ **~20,000 notas**
- ✅ **Backup automático diario**

## 🚀 Deploy a Producción

### **Opción 1: Vercel (Recomendado)**
1. Push tu código a GitHub
2. Ve a [vercel.com](https://vercel.com)
3. Importa tu repositorio
4. Agrega `DATABASE_URL` en Environment Variables
5. Deploy automático

### **Opción 2: Railway**
1. Ve a [railway.app](https://railway.app)
2. Conecta tu GitHub
3. Railway detecta automáticamente Next.js
4. Agrega `DATABASE_URL` en Variables
5. Deploy automático

## 🔒 Seguridad

### **Variables de Entorno en Producción:**
```bash
# Vercel Environment Variables
DATABASE_URL="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
NEXTAUTH_SECRET="tu-secret-key-muy-segura"
NEXTAUTH_URL="https://tu-dominio.com"
```

### **Configuración de Supabase:**
1. Ve a **Settings** > **API**
2. Copia `anon` y `service_role` keys
3. Configura Row Level Security (RLS)
4. Crea políticas de seguridad

## 📈 Escalabilidad

### **Cuando Necesites Más:**
- **Pro Plan**: $25/mes - 8GB storage, 250GB transfer
- **Team Plan**: $599/mes - 100GB storage, 1TB transfer
- **Enterprise**: Custom pricing

### **Migración Fácil:**
- Exporta datos desde Supabase
- Importa a cualquier PostgreSQL
- Cambia `DATABASE_URL`
- ¡Listo!

## 🆘 Soporte

### **Recursos:**
- 📚 [Documentación Supabase](https://supabase.com/docs)
- 💬 [Discord Community](https://discord.supabase.com)
- 🎥 [Tutoriales en YouTube](https://youtube.com/supabase)

### **Problemas Comunes:**
1. **Connection timeout**: Verifica la región
2. **SSL errors**: Asegúrate de usar `postgresql://`
3. **Permission denied**: Verifica la password
4. **Schema not found**: Ejecuta `npx prisma db push`

---

## ✅ Checklist Final

- [ ] Cuenta Supabase creada
- [ ] Proyecto creado
- [ ] Password segura configurada
- [ ] DATABASE_URL copiada
- [ ] .env.local creado
- [ ] `npx prisma db push` ejecutado
- [ ] Datos migrados correctamente
- [ ] Panel de Supabase accesible

¡Tu CRM estará listo para producción! 🚀
