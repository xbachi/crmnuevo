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

async function addFinancialFields() {
  try {
    // Agregar nuevos campos a la tabla depositos
    await pool.query(`
      ALTER TABLE depositos 
      ADD COLUMN IF NOT EXISTS monto_recibir DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS dias_gestion INTEGER,
      ADD COLUMN IF NOT EXISTS multa_retiro_anticipado DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS numero_cuenta VARCHAR(50)
    `)
    
    console.log('✅ Campos financieros agregados a la tabla depositos')
    
    // Verificar la estructura actual
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'depositos' 
      ORDER BY ordinal_position
    `)
    
    console.log('📋 Estructura actual de la tabla depositos:')
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`)
    })

  } catch (error) {
    console.error('❌ Error agregando campos financieros:', error)
  } finally {
    await pool.end()
  }
}

addFinancialFields()
