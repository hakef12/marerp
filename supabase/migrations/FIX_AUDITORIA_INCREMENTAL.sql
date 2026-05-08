-- =====================================================
-- MIGRACIÓN INCREMENTAL - AGREGAR COLUMNAS FALTANTES
-- M.A.R ERP - Sistema Multi-Tenant
-- =====================================================
-- Este script agrega las columnas faltantes sin eliminar datos existentes
-- =====================================================

-- 1. Agregar TODAS las columnas necesarias (si no existen)

-- Columna ID (Primary Key)
ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Columnas obligatorias
ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS empresa_id UUID;

ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS usuario_id UUID;

ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS accion VARCHAR(50);

ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS modulo VARCHAR(100);

-- Columnas opcionales
ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS resultado VARCHAR(20) DEFAULT 'exitoso';

ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS tabla VARCHAR(100);

ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS registro_id VARCHAR(100);

ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS datos_anteriores JSONB;

ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS datos_nuevos JSONB;

ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);

-- Columna de timestamp
ALTER TABLE auditoria 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Establecer Primary Key si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'auditoria_pkey' 
    AND conrelid = 'auditoria'::regclass
  ) THEN
    ALTER TABLE auditoria ADD PRIMARY KEY (id);
  END IF;
END $$;

-- 3. Actualizar registros existentes que tienen valores NULL
UPDATE auditoria 
SET modulo = 'sistema' 
WHERE modulo IS NULL;

UPDATE auditoria 
SET accion = 'ver' 
WHERE accion IS NULL;

UPDATE auditoria 
SET created_at = NOW() 
WHERE created_at IS NULL;

-- 4. Hacer columnas obligatorias (ahora que todos tienen valor)
DO $$
BEGIN
  -- Solo hacerlas NOT NULL si tienen datos
  IF EXISTS (SELECT 1 FROM auditoria LIMIT 1) THEN
    ALTER TABLE auditoria ALTER COLUMN modulo SET NOT NULL;
    ALTER TABLE auditoria ALTER COLUMN accion SET NOT NULL;
    ALTER TABLE auditoria ALTER COLUMN created_at SET NOT NULL;
  ELSE
    -- Si la tabla está vacía, igualmente hacerlas NOT NULL
    ALTER TABLE auditoria ALTER COLUMN modulo SET NOT NULL;
    ALTER TABLE auditoria ALTER COLUMN accion SET NOT NULL;
    ALTER TABLE auditoria ALTER COLUMN created_at SET NOT NULL;
  END IF;
END $$;

-- 5. Crear índices (si no existen)
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria(accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_resultado ON auditoria(resultado);

-- 6. Habilitar RLS si no está habilitado
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- 7. Eliminar políticas existentes (para recrearlas correctamente)
DROP POLICY IF EXISTS "Usuarios admin pueden ver auditoría de su empresa" ON auditoria;
DROP POLICY IF EXISTS "Sistema puede crear logs de auditoría" ON auditoria;

-- 8. Recrear políticas con el nombre de columna correcto (rol, no role)
CREATE POLICY "Usuarios admin pueden ver auditoría de su empresa"
  ON auditoria
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT u.empresa_id 
      FROM usuarios u 
      WHERE u.id = auth.uid() 
      AND u.rol IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Sistema puede crear logs de auditoría"
  ON auditoria
  FOR INSERT
  WITH CHECK (true);

-- 9. Agregar comentarios descriptivos
COMMENT ON TABLE auditoria IS 'Registro de auditoría de todas las acciones del sistema ERP M.A.R';
COMMENT ON COLUMN auditoria.id IS 'Identificador único del registro de auditoría';
COMMENT ON COLUMN auditoria.empresa_id IS 'ID de la empresa (multi-tenancy)';
COMMENT ON COLUMN auditoria.usuario_id IS 'ID del usuario que realizó la acción';
COMMENT ON COLUMN auditoria.accion IS 'Tipo de acción realizada';
COMMENT ON COLUMN auditoria.modulo IS 'Módulo del sistema donde se realizó la acción';
COMMENT ON COLUMN auditoria.tabla IS 'Tabla de la base de datos afectada';
COMMENT ON COLUMN auditoria.registro_id IS 'ID del registro afectado';
COMMENT ON COLUMN auditoria.datos_anteriores IS 'Estado anterior del registro (JSON)';
COMMENT ON COLUMN auditoria.datos_nuevos IS 'Estado nuevo del registro (JSON)';
COMMENT ON COLUMN auditoria.ip_address IS 'Dirección IP del usuario';
COMMENT ON COLUMN auditoria.resultado IS 'Resultado de la acción (exitoso o error)';
COMMENT ON COLUMN auditoria.created_at IS 'Fecha y hora de la acción';

-- 10. Mostrar mensaje de éxito
DO $$
DECLARE
  columnas_count INTEGER;
  indices_count INTEGER;
  politicas_count INTEGER;
BEGIN
  -- Contar columnas
  SELECT COUNT(*) INTO columnas_count
  FROM information_schema.columns
  WHERE table_name = 'auditoria';
  
  -- Contar índices
  SELECT COUNT(*) INTO indices_count
  FROM pg_indexes
  WHERE tablename = 'auditoria';
  
  -- Contar políticas
  SELECT COUNT(*) INTO politicas_count
  FROM pg_policies
  WHERE tablename = 'auditoria';
  
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════���═══════════════════════════════╗';
  RAISE NOTICE '║   ✓ TABLA DE AUDITORÍA ACTUALIZADA               ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Detalles:';
  RAISE NOTICE '  • % columnas totales', columnas_count;
  RAISE NOTICE '  • % índices creados', indices_count;
  RAISE NOTICE '  • % políticas de seguridad', politicas_count;
  RAISE NOTICE '  • RLS habilitado';
  RAISE NOTICE '';
  RAISE NOTICE 'El sistema de auditoría está listo para usar.';
  RAISE NOTICE '';
END $$;

-- 11. Verificar la estructura final
SELECT 
  'Columna' AS tipo,
  column_name AS nombre,
  data_type AS detalle,
  CASE WHEN is_nullable = 'NO' THEN '✓ Requerida' ELSE '○ Opcional' END as obligatoria
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;