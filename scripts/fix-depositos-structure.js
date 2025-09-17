const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/crmseven'
});

async function fixDepositosStructure() {
  try {
    console.log('🔧 Verificando y corrigiendo estructura de tabla depositos...\n');
    
    // 1. Verificar campos actuales
    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns 
      WHERE table_name = 'depositos'
    `);
    
    const existingColumns = columns.rows.map(row => row.column_name);
    console.log('📋 Campos existentes:', existingColumns.join(', '));
    
    // 2. Campos que necesitamos
    const requiredFields = [
      { name: 'notas', type: 'TEXT' },
      { name: 'contrato_deposito', type: 'TEXT' },
      { name: 'contrato_compra', type: 'TEXT' }
    ];
    
    console.log('\n🔍 Verificando campos requeridos:');
    
    for (const field of requiredFields) {
      if (!existingColumns.includes(field.name)) {
        console.log(`❌ ${field.name} NO EXISTE - AGREGANDO...`);
        
        try {
          await pool.query(`
            ALTER TABLE depositos 
            ADD COLUMN ${field.name} ${field.type}
          `);
          console.log(`✅ ${field.name} agregado exitosamente`);
        } catch (error) {
          console.log(`❌ Error agregando ${field.name}:`, error.message);
        }
      } else {
        console.log(`✅ ${field.name} ya existe`);
      }
    }
    
    // 3. Verificar estructura final
    console.log('\n📊 Estructura final:');
    const finalColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'depositos' 
      ORDER BY ordinal_position
    `);
    
    finalColumns.rows.forEach(col => {
      const mark = requiredFields.some(f => f.name === col.column_name) ? '🎯' : '  ';
      console.log(`${mark} ${col.column_name.padEnd(25)} | ${col.data_type}`);
    });
    
    // 4. Probar inserción y actualización
    console.log('\n🧪 Probando operaciones...');
    
    try {
      // Probar UPDATE con campos nuevos
      await pool.query(`
        UPDATE depositos 
        SET notas = 'Prueba de notas', 
            contrato_deposito = 'contrato-test.pdf',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT id FROM depositos LIMIT 1)
      `);
      console.log('✅ UPDATE con nuevos campos funciona');
    } catch (error) {
      console.log('❌ Error en UPDATE:', error.message);
    }
    
    console.log('\n✅ Verificación y corrección completada');
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  } finally {
    await pool.end();
  }
}

fixDepositosStructure();
