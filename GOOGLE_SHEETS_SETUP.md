# Configuración de Google Sheets

## Paso 1: Crear proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Anota el ID del proyecto

## Paso 2: Habilitar Google Sheets API

1. En el menú lateral, ve a "APIs y servicios" > "Biblioteca"
2. Busca "Google Sheets API"
3. Haz clic en "Habilitar"

## Paso 3: Crear cuenta de servicio

1. Ve a "APIs y servicios" > "Credenciales"
2. Haz clic en "Crear credenciales" > "Cuenta de servicio"
3. Completa:
   - **Nombre**: `crm-vehiculos-sheets`
   - **Descripción**: `Cuenta de servicio para CRM de vehículos`
4. Haz clic en "Crear y continuar"
5. En "Roles", selecciona "Editor" o "Propietario"
6. Haz clic en "Listo"

## Paso 4: Generar clave JSON

1. En la lista de cuentas de servicio, haz clic en la que acabas de crear
2. Ve a la pestaña "Claves"
3. Haz clic en "Agregar clave" > "Crear nueva clave"
4. Selecciona "JSON" y haz clic en "Crear"
5. Se descargará un archivo JSON con las credenciales

## Paso 5: Crear las dos hojas de cálculo

### Hoja 1: CRM Vehículos
1. Ve a [Google Sheets](https://sheets.google.com/)
2. Crea una nueva hoja de cálculo
3. Renómbrala como **"CRM Vehículos"**
4. En la fila 1, crea los encabezados:
   ```
   A1: Referencia | B1: Marca | C1: Modelo | D1: Matrícula | E1: Bastidor | F1: KMs | G1: Tipo | H1: Fecha Creación
   ```

### Hoja 2: Inventario Vehículos
1. Crea **otra hoja de cálculo nueva** (separada)
2. Renómbrala como **"Inventario Vehículos"**
3. En la fila 1, crea los mismos encabezados:
   ```
   A1: Referencia | B1: Marca | C1: Modelo | D1: Matrícula | E1: Bastidor | F1: KMs | G1: Tipo | H1: Fecha Creación
   ```

## Paso 6: Compartir ambas hojas

### Para cada hoja de cálculo:
1. Haz clic en "Compartir"
2. Agrega el email de la cuenta de servicio (del archivo JSON)
3. Dale permisos de "Editor"
4. Copia el ID de la hoja de la URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

### Anota los IDs:
- **CRM Vehículos**: `GOOGLE_SPREADSHEET_ID_VEHICULOS`
- **Inventario Vehículos**: `GOOGLE_SPREADSHEET_ID_INVENTARIO`

## Paso 7: Configurar variables de entorno

1. Crea un archivo `.env.local` en la raíz del proyecto
2. Agrega las siguientes variables:

```env
# Google Sheets Configuration
GOOGLE_SERVICE_ACCOUNT_EMAIL=tu-email@tu-proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTU_CLAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n"

# IDs de las dos hojas de cálculo separadas
GOOGLE_SPREADSHEET_ID_VEHICULOS=tu-vehiculos-spreadsheet-id-aqui
GOOGLE_SPREADSHEET_ID_INVENTARIO=tu-inventario-spreadsheet-id-aqui
```

3. Reemplaza los valores con los datos del archivo JSON descargado

## Paso 8: Probar la integración

1. Reinicia el servidor de desarrollo: `pnpm dev`
2. Ve a `http://localhost:3000/cargar-vehiculo`
3. Carga un vehículo de prueba
4. Verifica que aparezca en ambas hojas de Google Sheets

## Solución de problemas

### Error de autenticación
- Verifica que las credenciales estén correctas
- Asegúrate de que la cuenta de servicio tenga permisos en la hoja

### Error de permisos
- Verifica que la hoja esté compartida con el email de la cuenta de servicio
- Asegúrate de que tenga permisos de "Editor"

### Error de API no habilitada
- Verifica que la Google Sheets API esté habilitada en tu proyecto
