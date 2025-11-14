-- Agregar columna garantiaPremium a la tabla Vehiculo si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'Vehiculo' 
        AND column_name = 'garantiaPremium'
    ) THEN
        ALTER TABLE "Vehiculo" 
        ADD COLUMN "garantiaPremium" BOOLEAN DEFAULT false;
        
        RAISE NOTICE 'Columna garantiaPremium agregada exitosamente';
    ELSE
        RAISE NOTICE 'La columna garantiaPremium ya existe';
    END IF;
END $$;

