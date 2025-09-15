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

async function checkTables() {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    
    console.log('📋 Tablas existentes:')
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`)
    })
  } catch (error) {
    console.error('❌ Error consultando tablas:', error)
  } finally {
    await pool.end()
  }
}

checkTables()
