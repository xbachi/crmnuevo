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

async function fixDepositosConstraint() {
  try {
    // Eliminar la restricción única existente
    await pool.query(`
      ALTER TABLE depositos DROP CONSTRAINT IF EXISTS depositos_vehiculo_id_key
    `)
    console.log('✅ Restricción única eliminada')

    // Crear una restricción parcial que solo permita un depósito activo por vehículo
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_deposito_vehiculo 
      ON depositos (vehiculo_id) 
      WHERE estado = 'ACTIVO'
    `)
    console.log('✅ Índice único parcial creado (solo para depósitos activos)')

    // Verificar la estructura actual
    const result = await pool.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'depositos'
    `)
    console.log('📋 Restricciones actuales:', result.rows)

  } catch (error) {
    console.error('❌ Error modificando restricciones:', error)
  } finally {
    await pool.end()
  }
}

fixDepositosConstraint()
