const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/crmseven'
});

async function addFields() {
  try {
    console.log('Agregando campos a la tabla depositos...');
    
    await pool.query(`
      ALTER TABLE depositos 
      ADD COLUMN IF NOT EXISTS contrato_generado BOOLEAN DEFAULT FALSE
    `);
    console.log('✓ Campo contrato_generado agregado');
    
    await pool.query(`
      ALTER TABLE depositos 
      ADD COLUMN IF NOT EXISTS contrato_compra_generado BOOLEAN DEFAULT FALSE
    `);
    console.log('✓ Campo contrato_compra_generado agregado');
    
    await pool.query(`
      ALTER TABLE depositos 
      DROP CONSTRAINT IF EXISTS depositos_estado_check
    `);
    console.log('✓ Constraint anterior eliminada');
    
    await pool.query(`
      ALTER TABLE depositos 
      ADD CONSTRAINT depositos_estado_check 
      CHECK (estado IN ('BORRADOR', 'ACTIVO', 'FINALIZADO', 'VENDIDO'))
    `);
    console.log('✓ Nueva constraint agregada con estado VENDIDO');
    
    console.log('✅ Todos los campos agregados exitosamente');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

addFields();
