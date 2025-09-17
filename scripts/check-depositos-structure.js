const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/crmseven'
});

async function checkDepositosStructure() {
  try {
    console.log('🔍 Verificando estructura de tabla depositos...\n');
    
    // 1. Verificar si la tabla existe
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'depositos'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('❌ La tabla depositos NO EXISTE');
      return;
    }
    
    console.log('✅ La tabla depositos existe\n');
    
    // 2. Obtener estructura de la tabla
    const columns = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'depositos' 
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Estructura de la tabla depositos:');
    console.log('═══════════════════════════════════════');
    columns.rows.forEach(col => {
      console.log(`${col.column_name.padEnd(25)} | ${col.data_type.padEnd(15)} | ${col.is_nullable} | ${col.column_default || 'NULL'}`);
    });
    
    // 3. Verificar campos específicos
    console.log('\n🔍 Verificando campos críticos:');
    console.log('══════════════════════════════════════');
    
    const criticalFields = ['notas', 'contrato_deposito', 'contrato_compra'];
    criticalFields.forEach(field => {
      const exists = columns.rows.find(col => col.column_name === field);
      if (exists) {
        console.log(`✅ ${field}: ${exists.data_type}`);
      } else {
        console.log(`❌ ${field}: NO EXISTE`);
      }
    });
    
    // 4. Verificar datos de prueba
    console.log('\n📊 Datos existentes:');
    console.log('═══════════════════');
    const count = await pool.query('SELECT COUNT(*) FROM depositos');
    console.log(`Total de depósitos: ${count.rows[0].count}`);
    
    if (parseInt(count.rows[0].count) > 0) {
      const sample = await pool.query('SELECT * FROM depositos LIMIT 1');
      console.log('\n📝 Muestra de datos:');
      console.log(sample.rows[0]);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDepositosStructure();
