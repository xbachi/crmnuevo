const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function createNotasDepositoTable() {
  try {
    console.log('📊 Creando tabla NotaDeposito...');
    
    // Crear tabla para notas de depósitos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "NotaDeposito" (
        id SERIAL PRIMARY KEY,
        "depositoId" INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
        tipo VARCHAR(50) DEFAULT 'general',
        titulo VARCHAR(255),
        contenido TEXT NOT NULL,
        prioridad VARCHAR(20) DEFAULT 'normal',
        completada BOOLEAN DEFAULT FALSE,
        fecha TIMESTAMP DEFAULT NOW(),
        usuario VARCHAR(100) DEFAULT 'Sistema',
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('✅ Tabla NotaDeposito creada');
    
    // Crear índices
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "NotaDeposito_depositoId_idx" ON "NotaDeposito"("depositoId");
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "NotaDeposito_fecha_idx" ON "NotaDeposito"(fecha DESC);
    `);
    
    console.log('✅ Índices creados');
    
    // Verificar que la tabla se creó correctamente
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'NotaDeposito'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Estructura de NotaDeposito:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n🎉 Tabla NotaDeposito lista para usar!');
    
  } catch (error) {
    console.error('❌ Error creando tabla NotaDeposito:', error);
  } finally {
    await pool.end();
  }
}

createNotasDepositoTable();
