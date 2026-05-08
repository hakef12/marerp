-- Script para actualizar tabla de auditoría existente
-- Usa este script si la tabla 'auditoria' ya existe y solo necesitas agregar la columna 'resultado'

-- Agregar la columna resultado si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'auditoria' 
    AND column_name = 'resultado'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN resultado VARCHAR(20) DEFAULT 'exitoso';
    COMMENT ON COLUMN auditoria.resultado IS 'Resultado de la acción (exitoso o error)';
  END IF;
END $$;
