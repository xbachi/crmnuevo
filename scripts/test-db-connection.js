const { Pool } = require('pg');

// Intentar diferentes configuraciones de conexión
const configs = [
  'postgresql://postgres:password@localhost:5432/crmseven',
  process.env.DATABASE_URL,
  'postgresql://postgres@localhost:5432/crmseven'
];

async function testConnection() {
  for (const config of configs) {
    if (!config) continue;
    
    console.log(`🔌 Probando conexión: ${config.substring(0, 30)}...`);
    
    try {
      const pool = new Pool({ connectionString: config });
      const result = await pool.query('SELECT NOW()');
      console.log('✅ Conexión exitosa!');
      console.log('Hora del servidor:', result.rows[0].now);
      
      // Verificar tabla depositos
      try {
        const tableCheck = await pool.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_name = 'depositos'
        `);
        
        if (tableCheck.rows.length > 0) {
          console.log('✅ Tabla depositos existe');
          
          // Obtener columnas
          const columns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'depositos'
            ORDER BY ordinal_position
          `);
          
          console.log('📋 Columnas de depositos:');
          columns.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type}`);
          });
          
        } else {
          console.log('❌ Tabla depositos NO existe');
        }
      } catch (tableError) {
        console.log('❌ Error verificando tabla:', tableError.message);
      }
      
      await pool.end();
      return true;
      
    } catch (error) {
      console.log('❌ Error de conexión:', error.message);
    }
  }
  
  console.log('❌ No se pudo conectar con ninguna configuración');
  return false;
}

testConnection();
