// Cargar variables de entorno manualmente
const fs = require('fs');
const path = require('path');

// Función para cargar .env.local
function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          process.env[key] = value.replace(/"/g, '');
        }
      });
    }
  } catch (error) {
    console.error('Error cargando .env.local:', error);
  }
}

// Cargar variables de entorno
loadEnvFile();

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

async function createDepositosTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS depositos (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
        estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'ACTIVO', 'FINALIZADO')),
        fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
        fecha_fin DATE,
        precio_venta DECIMAL(10,2),
        comision_porcentaje DECIMAL(5,2) DEFAULT 5.0,
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vehiculo_id) -- Un solo depósito activo por vehículo
      )
    `)

    // Crear índices
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_depositos_cliente_id ON depositos(cliente_id)
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_depositos_vehiculo_id ON depositos(vehiculo_id)
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_depositos_estado ON depositos(estado)
    `)

    console.log('✅ Tabla depositos creada exitosamente')
  } catch (error) {
    console.error('❌ Error creando tabla depositos:', error)
  } finally {
    await pool.end()
  }
}

createDepositosTable()
