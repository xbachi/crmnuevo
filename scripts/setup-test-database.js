const { Pool } = require('pg')
const fs = require('fs').promises

async function setupTestDatabase() {
  console.log('Setting up test database...')
  
  const dbConfig = {
    user: process.env.TEST_DB_USER || 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    database: process.env.TEST_DB_NAME || 'crm_test',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
  }

  const pool = new Pool(dbConfig)

  try {
    // Test connection
    await pool.query('SELECT NOW()')
    console.log('✅ Database connection established')

    // Read and execute schema creation SQL
    const schemaSQL = await fs.readFile('create-tables.sql', 'utf8')
    await pool.query(schemaSQL)
    console.log('✅ Tables created')

    // Create additional tables for deposits if they don't exist
    const depositSQL = `
      CREATE TABLE IF NOT EXISTS depositos (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES "Cliente"(id) ON DELETE CASCADE,
        vehiculo_id INTEGER UNIQUE NOT NULL REFERENCES "Vehiculo"(id) ON DELETE CASCADE,
        estado VARCHAR(50) DEFAULT 'BORRADOR',
        monto_recibir DECIMAL(10,2),
        dias_gestion INTEGER,
        multa_retiro_anticipado DECIMAL(10,2),
        numero_cuenta VARCHAR(100),
        fecha_inicio TIMESTAMP DEFAULT NOW(),
        fecha_fin TIMESTAMP,
        contrato_deposito TEXT,
        contrato_compra TEXT,
        precio_venta DECIMAL(10,2),
        comision_porcentaje DECIMAL(5,2),
        notas TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `
    await pool.query(depositSQL)
    console.log('✅ Deposits table created')

    // Create notes table for deposits
    const notasSQL = `
      CREATE TABLE IF NOT EXISTS "NotaDeposito" (
        id SERIAL PRIMARY KEY,
        "depositoId" INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
        contenido TEXT NOT NULL,
        fecha TIMESTAMP DEFAULT NOW(),
        usuario VARCHAR(100) DEFAULT 'Sistema',
        tipo VARCHAR(50) DEFAULT 'general',
        titulo VARCHAR(200) DEFAULT 'Nota general',
        prioridad VARCHAR(50) DEFAULT 'normal',
        completada BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notadeposito_depositoId ON "NotaDeposito" ("depositoId");
      CREATE INDEX IF NOT EXISTS idx_notadeposito_fecha ON "NotaDeposito" (fecha DESC);
    `
    await pool.query(notasSQL)
    console.log('✅ Deposit notes table created')

    // Verify tables exist
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    
    const tables = result.rows.map(row => row.table_name)
    console.log('✅ Available tables:', tables.join(', '))

    // Verify critical tables exist
    const requiredTables = ['Cliente', 'Vehiculo', 'Deal', 'Inversor', 'depositos', 'NotaDeposito']
    const missingTables = requiredTables.filter(table => !tables.includes(table))
    
    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`)
    }

    console.log('✅ Test database setup completed successfully')

  } catch (error) {
    console.error('❌ Error setting up test database:', error)
    throw error
  } finally {
    await pool.end()
  }
}

// Run if called directly
if (require.main === module) {
  setupTestDatabase()
    .then(() => {
      console.log('Test database setup complete')
      process.exit(0)
    })
    .catch(error => {
      console.error('Test database setup failed:', error)
      process.exit(1)
    })
}

module.exports = { setupTestDatabase }
