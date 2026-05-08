-- =====================================================
-- SCRIPT DE DIAGNÓSTICO - TABLA AUDITORÍA
-- M.A.R ERP - Sistema Multi-Tenant
-- =====================================================
-- Este script verifica el estado actual de la tabla
-- NO modifica nada, solo muestra información
-- =====================================================

-- 1. Verificar si la tabla existe
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auditoria')
    THEN '✓ La tabla auditoria EXISTE'
    ELSE '✗ La tabla auditoria NO EXISTE'
  END as estado_tabla;

-- 2. Ver todas las columnas actuales
SELECT 
  column_name as "Columna",
  data_type as "Tipo",
  character_maximum_length as "Longitud",
  CASE WHEN is_nullable = 'NO' THEN 'SI' ELSE 'NO' END as "Requerida",
  column_default as "Valor Default"
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;

-- 3. Ver índices existentes
SELECT 
  indexname as "Índice",
  indexdef as "Definición"
FROM pg_indexes
WHERE tablename = 'auditoria'
ORDER BY indexname;

-- 4. Ver políticas RLS
SELECT 
  policyname as "Política",
  cmd as "Comando",
  permissive as "Tipo"
FROM pg_policies
WHERE tablename = 'auditoria';

-- 5. Verificar si RLS está habilitado
SELECT 
  tablename as "Tabla",
  CASE 
    WHEN rowsecurity THEN '✓ RLS HABILITADO' 
    ELSE '✗ RLS DESHABILITADO' 
  END as "Estado RLS"
FROM pg_tables
WHERE tablename = 'auditoria';

-- 6. Contar registros existentes
SELECT 
  COUNT(*) as "Total de Registros",
  MIN(created_at) as "Primer Registro",
  MAX(created_at) as "Último Registro"
FROM auditoria;

-- 7. Ver columnas que DEBERÍAN existir pero NO existen
SELECT 
  columna_requerida as "Columna Faltante"
FROM (
  VALUES 
    ('empresa_id'),
    ('usuario_id'),
    ('accion'),
    ('modulo'),
    ('tabla'),
    ('registro_id'),
    ('datos_anteriores'),
    ('datos_nuevos'),
    ('ip_address'),
    ('resultado'),
    ('created_at')
) AS requeridas(columna_requerida)
WHERE NOT EXISTS (
  SELECT 1 
  FROM information_schema.columns 
  WHERE table_name = 'auditoria' 
  AND column_name = requeridas.columna_requerida
);

-- 8. Resumen general
DO $$
DECLARE
  existe_tabla BOOLEAN;
  total_columnas INTEGER;
  total_indices INTEGER;
  total_politicas INTEGER;
  rls_habilitado BOOLEAN;
BEGIN
  -- Verificar existencia
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'auditoria'
  ) INTO existe_tabla;
  
  IF existe_tabla THEN
    -- Contar elementos
    SELECT COUNT(*) INTO total_columnas
    FROM information_schema.columns
    WHERE table_name = 'auditoria';
    
    SELECT COUNT(*) INTO total_indices
    FROM pg_indexes
    WHERE tablename = 'auditoria';
    
    SELECT COUNT(*) INTO total_politicas
    FROM pg_policies
    WHERE tablename = 'auditoria';
    
    SELECT rowsecurity INTO rls_habilitado
    FROM pg_tables
    WHERE tablename = 'auditoria';
    
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════╗';
    RAISE NOTICE '║            DIAGNÓSTICO DE AUDITORÍA               ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════╗';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Estado Actual:';
    RAISE NOTICE '   • Tabla existe: ✓ SÍ';
    RAISE NOTICE '   • Columnas: % (debería tener 12)', total_columnas;
    RAISE NOTICE '   • Índices: % (debería tener 6)', total_indices;
    RAISE NOTICE '   • Políticas: % (debería tener 2)', total_politicas;
    RAISE NOTICE '   • RLS: %', CASE WHEN rls_habilitado THEN '✓ Habilitado' ELSE '✗ Deshabilitado' END;
    RAISE NOTICE '';
    
    IF total_columnas < 12 THEN
      RAISE NOTICE '⚠️  ACCIÓN REQUERIDA:';
      RAISE NOTICE '   → Ejecutar: FIX_AUDITORIA_INCREMENTAL.sql';
      RAISE NOTICE '   (Agregará columnas faltantes sin borrar datos)';
    ELSIF total_politicas < 2 THEN
      RAISE NOTICE '⚠️  ACCIÓN REQUERIDA:';
      RAISE NOTICE '   → Ejecutar: FIX_AUDITORIA_INCREMENTAL.sql';
      RAISE NOTICE '   (Configurará políticas de seguridad)';
    ELSE
      RAISE NOTICE '✅ TODO CORRECTO - La tabla está lista';
    END IF;
    RAISE NOTICE '';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════╗';
    RAISE NOTICE '║            DIAGNÓSTICO DE AUDITORÍA               ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    RAISE NOTICE '✗ La tabla auditoria NO EXISTE';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  ACCIÓN REQUERIDA:';
    RAISE NOTICE '   → Ejecutar: EJECUTAR_AHORA.sql';
    RAISE NOTICE '   (Creará la tabla completa)';
    RAISE NOTICE '';
  END IF;
END $$;
