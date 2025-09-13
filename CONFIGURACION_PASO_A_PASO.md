# 🚀 Configuración Paso a Paso - Google Sheets

## 📋 Resumen
Las hojas de Google Sheets ya están creadas y configuradas. Solo necesitas configurar las credenciales para que el sistema pueda escribir en ellas.

### 📊 Hojas Configuradas:
- **Ventas-Sevencars**: `1RwnqBYlPMXj2rUJ3XqegrSQ-kM5RIJG61uGALy-pEH8`
- **COMPRAS**: `1asyKq66_4_GUwkYQdgjSIOLR5wY3ur06ebgleFFWiW0`

### 📋 Columnas en cada hoja:
`REFERENCIA | MARCA | MODELO | MATRICULA | BASTIDOR | KMS`

---

## 🔧 Paso 1: Crear cuenta de servicio en Google Cloud

### 1.1 Ir a Google Cloud Console
- Ve a: https://console.cloud.google.com/
- Inicia sesión con tu cuenta de Google

### 1.2 Crear o seleccionar proyecto
- Si no tienes proyecto: "Crear proyecto" → Nombre: "CRM Vehículos"
- Si tienes proyecto: Selecciónalo del dropdown

### 1.3 Habilitar Google Sheets API
- En el menú lateral: "APIs y servicios" → "Biblioteca"
- Busca: "Google Sheets API"
- Haz clic en "Habilitar"

### 1.4 Crear cuenta de servicio
- Ve a: "APIs y servicios" → "Credenciales"
- Clic en: "Crear credenciales" → "Cuenta de servicio"
- **Nombre**: `crm-vehiculos-sheets`
- **Descripción**: `Cuenta de servicio para CRM de vehículos`
- Clic en: "Crear y continuar"
- **Rol**: "Editor" o "Propietario"
- Clic en: "Listo"

### 1.5 Generar clave JSON
- En la lista de cuentas de servicio, clic en la que acabas de crear
- Pestaña "Claves" → "Agregar clave" → "Crear nueva clave"
- Selecciona "JSON" → "Crear"
- **¡IMPORTANTE!** Se descarga un archivo JSON - guárdalo seguro

---

## 📊 Paso 2: Compartir las hojas existentes

### Para cada hoja de cálculo:
1. Ve a la hoja "Ventas-Sevencars": https://docs.google.com/spreadsheets/d/1RwnqBYlPMXj2rUJ3XqegrSQ-kM5RIJG61uGALy-pEH8
2. Haz clic en "Compartir" (esquina superior derecha)
3. En "Agregar personas y grupos":
   - Pega el email de la cuenta de servicio (del archivo JSON)
   - Rol: "Editor"
4. Haz clic en "Enviar"

5. Repite el proceso para "COMPRAS": https://docs.google.com/spreadsheets/d/1asyKq66_4_GUwkYQdgjSIOLR5wY3ur06ebgleFFWiW0

---

## ⚙️ Paso 3: Configurar variables de entorno

### 3.1 Crear archivo .env.local
En la raíz del proyecto (donde está `package.json`), crea un archivo llamado `.env.local`

### 3.2 Agregar las variables
Copia este contenido y reemplaza con tus datos:

```env
# Google Sheets Configuration
GOOGLE_SERVICE_ACCOUNT_EMAIL=tu-email@tu-proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTU_CLAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n"
```

### 3.3 Obtener los datos del archivo JSON
Del archivo JSON descargado, copia:
- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY`

**NOTA**: Los IDs de las hojas ya están configurados en el código, no necesitas agregarlos.

---

## 🧪 Paso 4: Probar la integración

### 4.1 Reiniciar el servidor
```bash
pnpm dev
```

### 4.2 Probar con la página de prueba
1. Ve a: http://localhost:3000/test-sheets
2. Clic en "Probar Google Sheets"
3. Si funciona, verás: "✅ Vehículo de prueba guardado exitosamente"

### 4.3 Probar con un vehículo real
1. Ve a: http://localhost:3000/cargar-vehiculo
2. Completa el formulario con datos como:
   - Referencia: `#1006`
   - Marca: `Peugeot`
   - Modelo: `508`
   - Matrícula: `2839KTK`
   - Bastidor: `VR3F35GFRJY211608`
   - KMs: `119417`
   - Tipo: `Compra`
3. Clic en "Guardar Vehículo"
4. Verifica que aparezca en ambas hojas de Google Sheets

---

## ✅ Verificación Final

### ¿Qué debería pasar?
- ✅ Cada vehículo se guarda en la base de datos local
- ✅ Se crean las carpetas en el servidor
- ✅ Se agrega una fila nueva en "Ventas-Sevencars"
- ✅ Se agrega una fila nueva en "COMPRAS"
- ✅ Ambas filas tienen los mismos datos en las 6 columnas

### ¿Qué hacer si hay errores?
- Verifica que las credenciales estén correctas
- Asegúrate de que ambas hojas estén compartidas con la cuenta de servicio
- Mira la consola del navegador para errores específicos

---

## 🎯 Resultado Final

Cuando cargues un vehículo como el ejemplo:
- **Referencia**: `#1006`
- **Marca**: `Peugeot`
- **Modelo**: `508`
- **Matrícula**: `2839KTK`
- **Bastidor**: `VR3F35GFRJY211608`
- **KMs**: `119417`

Se guardará:
1. **Base de datos**: Localmente
2. **Carpetas**: En el servidor
3. **Ventas-Sevencars**: Nueva fila con los 6 datos
4. **COMPRAS**: Nueva fila con los mismos 6 datos

¡Listo! 🚀