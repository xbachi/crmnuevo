const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/crmseven'
});

async function addContratoPaths() {
  try {
    console.log('Agregando campos de rutas de contratos a la tabla depositos...');
    
    // Eliminar los campos booleanos antiguos si existen
    try {
      await pool.query(`ALTER TABLE depositos DROP COLUMN IF EXISTS contrato_generado`);
      await pool.query(`ALTER TABLE depositos DROP COLUMN IF EXISTS contrato_compra_generado`);
      console.log('✓ Campos booleanos antiguos eliminados');
    } catch (e) {
      console.log('- Campos booleanos no existían');
    }
    
    // Agregar campos de texto para las rutas de los contratos
    await pool.query(`
      ALTER TABLE depositos 
      ADD COLUMN IF NOT EXISTS contrato_deposito TEXT
    `);
    console.log('✓ Campo contrato_deposito agregado');
    
    await pool.query(`
      ALTER TABLE depositos 
      ADD COLUMN IF NOT EXISTS contrato_compra TEXT
    `);
    console.log('✓ Campo contrato_compra agregado');
    
    console.log('✅ Todos los campos agregados exitosamente');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

addContratoPaths();
