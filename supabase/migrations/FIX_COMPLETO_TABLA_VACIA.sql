-- =====================================================
-- FIX COMPLETO - TABLA VACÍA O CASI VACÍA
-- M.A.R ERP - Sistema Multi-Tenant
-- =====================================================
-- Este script detecta si la tabla está muy vacía
-- y la completa con TODAS las columnas necesarias
-- =====================================================

-- PASO 1: Si la tabla NO existe, crearla
CREATE TABLE IF NOT EXISTS auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID,
  usuario_id UUID,
  accion VARCHAR(50) NOT NULL,
  modulo VARCHAR(100) NOT NULL,
  tabla VARCHAR(100),
  registro_id VARCHAR(100),
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  ip_address VARCHAR(50),
  resultado VARCHAR(20) DEFAULT 'exitoso',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- PASO 2: Agregar columnas si faltan (para tablas parcialmente creadas)
DO $$
BEGIN
  -- Columna id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'id'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN id UUID DEFAULT gen_random_uuid();
  END IF;

  -- Columna empresa_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'empresa_id'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN empresa_id UUID;
  END IF;

  -- Columna usuario_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'usuario_id'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN usuario_id UUID;
  END IF;

  -- Columna accion
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'accion'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN accion VARCHAR(50);
  END IF;

  -- Columna modulo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'modulo'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN modulo VARCHAR(100);
  END IF;

  -- Columna tabla
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'tabla'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN tabla VARCHAR(100);
  END IF;

  -- Columna registro_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'registro_id'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN registro_id VARCHAR(100);
  END IF;

  -- Columna datos_anteriores
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'datos_anteriores'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN datos_anteriores JSONB;
  END IF;

  -- Columna datos_nuevos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'datos_nuevos'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN datos_nuevos JSONB;
  END IF;

  -- Columna ip_address
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN ip_address VARCHAR(50);
  END IF;

  -- Columna resultado
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'resultado'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN resultado VARCHAR(20) DEFAULT 'exitoso';
  END IF;

  -- Columna created_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- PASO 3: Establecer Primary Key si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'auditoria_pkey' 
    AND conrelid = 'auditoria'::regclass
  ) THEN
    -- Asegurarse de que id existe y es único antes de hacer PK
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'id') THEN
      -- Actualizar IDs NULL si existen
      UPDATE auditoria SET id = gen_random_uuid() WHERE id IS NULL;
      -- Hacer NOT NULL
      ALTER TABLE auditoria ALTER COLUMN id SET NOT NULL;
      -- Agregar Primary Key
      ALTER TABLE auditoria ADD PRIMARY KEY (id);
    END IF;
  END IF;
END $$;

-- PASO 4: Actualizar registros NULL
UPDATE auditoria SET modulo = 'sistema' WHERE modulo IS NULL;
UPDATE auditoria SET accion = 'ver' WHERE accion IS NULL;
UPDATE auditoria SET created_at = NOW() WHERE created_at IS NULL;
UPDATE auditoria SET resultado = 'exitoso' WHERE resultado IS NULL;

-- PASO 5: Hacer columnas críticas NOT NULL
DO $$
BEGIN
  -- Columna accion
  BEGIN
    ALTER TABLE auditoria ALTER COLUMN accion SET NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo hacer accion NOT NULL: %', SQLERRM;
  END;

  -- Columna modulo
  BEGIN
    ALTER TABLE auditoria ALTER COLUMN modulo SET NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo hacer modulo NOT NULL: %', SQLERRM;
  END;

  -- Columna created_at
  BEGIN
    ALTER TABLE auditoria ALTER COLUMN created_at SET NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo hacer created_at NOT NULL: %', SQLERRM;
  END;
END $$;

-- PASO 6: Crear índices
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria(accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_resultado ON auditoria(resultado);

-- PASO 7: Habilitar RLS
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- PASO 8: Eliminar políticas viejas
DROP POLICY IF EXISTS "Usuarios admin pueden ver auditoría de su empresa" ON auditoria;
DROP POLICY IF EXISTS "Sistema puede crear logs de auditoría" ON auditoria;

-- PASO 9: Crear políticas correctas (con u.rol, no u.role)
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

-- PASO 10: Agregar comentarios
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

-- PASO 11: Mostrar resumen final
DO $$
DECLARE
  columnas_count INTEGER;
  indices_count INTEGER;
  politicas_count INTEGER;
  registros_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO columnas_count FROM information_schema.columns WHERE table_name = 'auditoria';
  SELECT COUNT(*) INTO indices_count FROM pg_indexes WHERE tablename = 'auditoria';
  SELECT COUNT(*) INTO politicas_count FROM pg_policies WHERE tablename = 'auditoria';
  SELECT COUNT(*) INTO registros_count FROM auditoria;
  
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════════╗';
  RAISE NOTICE '║   ✓ TABLA DE AUDITORÍA COMPLETAMENTE LISTA       ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Resumen:';
  RAISE NOTICE '   • Columnas: % de 12', columnas_count;
  RAISE NOTICE '   • Índices: %', indices_count;
  RAISE NOTICE '   • Políticas RLS: %', politicas_count;
  RAISE NOTICE '   • Registros: %', registros_count;
  RAISE NOTICE '   • RLS: ✓ Habilitado';
  RAISE NOTICE '';
  
  IF columnas_count = 12 AND politicas_count = 2 THEN
    RAISE NOTICE '🎉 ¡PERFECTO! El sistema de auditoría está 100%% funcional.';
    RAISE NOTICE '';
    RAISE NOTICE 'Próximos pasos:';
    RAISE NOTICE '  1. Recarga tu aplicación M.A.R ERP';
    RAISE NOTICE '  2. Ve al módulo de Auditoría';
    RAISE NOTICE '  3. ¡Disfruta del sistema completo!';
  ELSE
    RAISE NOTICE '⚠️  Configuración parcial:';
    IF columnas_count < 12 THEN
      RAISE NOTICE '   • Faltan % columnas', (12 - columnas_count);
    END IF;
    IF politicas_count < 2 THEN
      RAISE NOTICE '   • Faltan políticas de seguridad';
    END IF;
  END IF;
  RAISE NOTICE '';
END $$;

-- PASO 12: Mostrar estructura final
SELECT 
  '📋 COLUMNAS CREADAS' as categoria,
  column_name as nombre,
  data_type as tipo,
  CASE WHEN is_nullable = 'NO' THEN '✓ Requerida' ELSE '○ Opcional' END as estado,
  column_default as valor_default
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;
