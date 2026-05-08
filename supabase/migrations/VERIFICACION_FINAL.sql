-- =====================================================
-- SCRIPT DE VERIFICACIÓN FINAL
-- M.A.R ERP - Sistema Multi-Tenant
-- =====================================================
-- Ejecuta este script DESPUÉS de aplicar la migración
-- para verificar que todo esté correcto
-- =====================================================

-- 1. Verificar que la tabla existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auditoria') THEN
    RAISE NOTICE '✅ La tabla auditoria EXISTE';
  ELSE
    RAISE NOTICE '❌ ERROR: La tabla auditoria NO EXISTE';
  END IF;
END $$;

-- 2. Contar columnas (debe ser 12)
DO $$
DECLARE
  columnas_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO columnas_count
  FROM information_schema.columns
  WHERE table_name = 'auditoria';
  
  IF columnas_count = 12 THEN
    RAISE NOTICE '✅ Columnas correctas: % de 12', columnas_count;
  ELSE
    RAISE NOTICE '❌ ERROR: Solo hay % columnas (deberían ser 12)', columnas_count;
  END IF;
END $$;

-- 3. Verificar columnas específicas
DO $$
DECLARE
  columnas_faltantes TEXT[];
BEGIN
  columnas_faltantes := ARRAY[]::TEXT[];
  
  -- Verificar cada columna requerida
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'id') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'id');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'empresa_id') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'empresa_id');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'usuario_id') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'usuario_id');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'accion') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'accion');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'modulo') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'modulo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'tabla') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'tabla');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'registro_id') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'registro_id');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'datos_anteriores') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'datos_anteriores');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'datos_nuevos') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'datos_nuevos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'ip_address') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'ip_address');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'resultado') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'resultado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'created_at') THEN
    columnas_faltantes := array_append(columnas_faltantes, 'created_at');
  END IF;
  
  IF array_length(columnas_faltantes, 1) IS NULL THEN
    RAISE NOTICE '✅ Todas las columnas necesarias están presentes';
  ELSE
    RAISE NOTICE '❌ ERROR: Columnas faltantes: %', array_to_string(columnas_faltantes, ', ');
  END IF;
END $$;

-- 4. Verificar índices (debe ser 6)
DO $$
DECLARE
  indices_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO indices_count
  FROM pg_indexes
  WHERE tablename = 'auditoria';
  
  IF indices_count >= 6 THEN
    RAISE NOTICE '✅ Índices correctos: %', indices_count;
  ELSE
    RAISE NOTICE '⚠️  ADVERTENCIA: Solo hay % índices (se recomiendan al menos 6)', indices_count;
  END IF;
END $$;

-- 5. Verificar que RLS está habilitado
DO $$
DECLARE
  rls_habilitado BOOLEAN;
BEGIN
  SELECT rowsecurity INTO rls_habilitado
  FROM pg_tables
  WHERE tablename = 'auditoria';
  
  IF rls_habilitado THEN
    RAISE NOTICE '✅ RLS está HABILITADO';
  ELSE
    RAISE NOTICE '❌ ERROR: RLS está DESHABILITADO';
  END IF;
END $$;

-- 6. Verificar políticas (debe ser 2)
DO $$
DECLARE
  politicas_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO politicas_count
  FROM pg_policies
  WHERE tablename = 'auditoria';
  
  IF politicas_count = 2 THEN
    RAISE NOTICE '✅ Políticas correctas: 2';
  ELSE
    RAISE NOTICE '⚠️  ADVERTENCIA: Hay % políticas (deberían ser 2)', politicas_count;
  END IF;
END $$;

-- 7. Verificar que las políticas usan 'rol' (no 'role')
DO $$
DECLARE
  politica_lectura TEXT;
BEGIN
  SELECT qual::text INTO politica_lectura
  FROM pg_policies
  WHERE tablename = 'auditoria' AND cmd = 'SELECT'
  LIMIT 1;
  
  IF politica_lectura LIKE '%u.rol%' THEN
    RAISE NOTICE '✅ Política usa u.rol (correcto)';
  ELSIF politica_lectura LIKE '%u.role%' THEN
    RAISE NOTICE '❌ ERROR: Política usa u.role (incorrecto, debería ser u.rol)';
  ELSE
    RAISE NOTICE '⚠️  No se pudo verificar el nombre de columna en la política';
  END IF;
END $$;

-- 8. Mostrar resumen final
DO $$
DECLARE
  tabla_existe BOOLEAN;
  columnas_count INTEGER;
  indices_count INTEGER;
  politicas_count INTEGER;
  rls_habilitado BOOLEAN;
  todo_ok BOOLEAN := true;
BEGIN
  -- Recopilar información
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auditoria') INTO tabla_existe;
  SELECT COUNT(*) INTO columnas_count FROM information_schema.columns WHERE table_name = 'auditoria';
  SELECT COUNT(*) INTO indices_count FROM pg_indexes WHERE tablename = 'auditoria';
  SELECT COUNT(*) INTO politicas_count FROM pg_policies WHERE tablename = 'auditoria';
  SELECT rowsecurity INTO rls_habilitado FROM pg_tables WHERE tablename = 'auditoria';
  
  -- Evaluar si todo está OK
  IF NOT tabla_existe THEN todo_ok := false; END IF;
  IF columnas_count != 12 THEN todo_ok := false; END IF;
  IF indices_count < 6 THEN todo_ok := false; END IF;
  IF politicas_count != 2 THEN todo_ok := false; END IF;
  IF NOT rls_habilitado THEN todo_ok := false; END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════════╗';
  IF todo_ok THEN
    RAISE NOTICE '║        ✅ VERIFICACIÓN EXITOSA                    ║';
  ELSE
    RAISE NOTICE '║        ⚠️  VERIFICACIÓN CON ADVERTENCIAS         ║';
  END IF;
  RAISE NOTICE '╚════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Resumen:';
  RAISE NOTICE '   • Tabla existe: %', CASE WHEN tabla_existe THEN '✓' ELSE '✗' END;
  RAISE NOTICE '   • Columnas: % de 12 %', columnas_count, CASE WHEN columnas_count = 12 THEN '✓' ELSE '✗' END;
  RAISE NOTICE '   • Índices: % de 6 %', indices_count, CASE WHEN indices_count >= 6 THEN '✓' ELSE '✗' END;
  RAISE NOTICE '   • Políticas: % de 2 %', politicas_count, CASE WHEN politicas_count = 2 THEN '✓' ELSE '✗' END;
  RAISE NOTICE '   • RLS: %', CASE WHEN rls_habilitado THEN '✓ Habilitado' ELSE '✗ Deshabilitado' END;
  RAISE NOTICE '';
  
  IF todo_ok THEN
    RAISE NOTICE '🎉 ¡PERFECTO! El sistema de auditoría está completamente funcional.';
    RAISE NOTICE '';
    RAISE NOTICE 'Próximos pasos:';
    RAISE NOTICE '  1. Recarga tu aplicación M.A.R ERP';
    RAISE NOTICE '  2. Ve al módulo de Auditoría';
    RAISE NOTICE '  3. Verifica que no hay errores';
    RAISE NOTICE '  4. ¡Disfruta del sistema de auditoría completo!';
  ELSE
    RAISE NOTICE '⚠️  Hay algunos problemas. Recomendaciones:';
    RAISE NOTICE '';
    IF columnas_count != 12 THEN
      RAISE NOTICE '  → Ejecutar: FIX_AUDITORIA_INCREMENTAL.sql';
    END IF;
    IF politicas_count != 2 OR NOT rls_habilitado THEN
      RAISE NOTICE '  → Ejecutar: FIX_AUDITORIA_INCREMENTAL.sql (configurará RLS)';
    END IF;
  END IF;
  RAISE NOTICE '';
END $$;

-- 9. Mostrar detalles de columnas
SELECT 
  '📋 COLUMNAS' as categoria,
  column_name as nombre,
  data_type as tipo,
  CASE WHEN is_nullable = 'NO' THEN '✓ Requerida' ELSE '○ Opcional' END as obligatoria,
  column_default as "valor_default"
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;

-- 10. Mostrar índices creados
SELECT 
  '📈 ÍNDICES' as categoria,
  indexname as nombre,
  indexdef as definicion
FROM pg_indexes
WHERE tablename = 'auditoria'
ORDER BY indexname;

-- 11. Mostrar políticas RLS
SELECT 
  '🔒 POLÍTICAS RLS' as categoria,
  policyname as nombre,
  cmd as comando,
  CASE WHEN permissive = 'PERMISSIVE' THEN 'Permisiva' ELSE 'Restrictiva' END as tipo
FROM pg_policies
WHERE tablename = 'auditoria'
ORDER BY policyname;
