-- Script de Prueba para Tabla de Auditoría
-- Ejecuta este script DESPUÉS de crear la tabla para verificar que todo funciona

-- =====================================================
-- 1. Insertar un registro de prueba
-- =====================================================
DO $$
DECLARE
  test_empresa_id UUID := gen_random_uuid();
  test_usuario_id UUID := gen_random_uuid();
BEGIN
  -- Insertar registro de prueba
  INSERT INTO auditoria (
    empresa_id,
    usuario_id,
    accion,
    modulo,
    tabla,
    registro_id,
    datos_anteriores,
    datos_nuevos,
    ip_address,
    resultado
  ) VALUES (
    test_empresa_id,
    test_usuario_id,
    'crear',
    'sistema',
    'auditoria',
    'test-001',
    '{"test": "anterior"}'::jsonb,
    '{"test": "nuevo"}'::jsonb,
    '127.0.0.1',
    'exitoso'
  );
  
  RAISE NOTICE '✓ Registro de prueba insertado correctamente';
  
  -- Verificar que se insertó
  IF EXISTS (SELECT 1 FROM auditoria WHERE registro_id = 'test-001') THEN
    RAISE NOTICE '✓ Verificación de inserción: OK';
  ELSE
    RAISE EXCEPTION '✗ Error: No se pudo verificar la inserción';
  END IF;
  
  -- Limpiar registro de prueba
  DELETE FROM auditoria WHERE registro_id = 'test-001';
  RAISE NOTICE '✓ Registro de prueba eliminado (limpieza)';
  
END $$;

-- =====================================================
-- 2. Verificar todas las columnas
-- =====================================================
SELECT 
  '✓ Estructura de tabla verificada - ' || COUNT(*) || ' columnas' AS resultado
FROM information_schema.columns
WHERE table_name = 'auditoria'
HAVING COUNT(*) = 12;  -- Debe tener exactamente 12 columnas

-- =====================================================
-- 3. Verificar índices
-- =====================================================
SELECT 
  '✓ Índices verificados - ' || COUNT(*) || ' índices creados' AS resultado
FROM pg_indexes
WHERE tablename = 'auditoria'
HAVING COUNT(*) >= 6;  -- Debe tener al menos 6 índices

-- =====================================================
-- 4. Verificar RLS está habilitado
-- =====================================================
SELECT 
  CASE 
    WHEN rowsecurity THEN '✓ RLS (Row Level Security) está HABILITADO'
    ELSE '✗ ADVERTENCIA: RLS no está habilitado'
  END AS resultado
FROM pg_tables
WHERE tablename = 'auditoria';

-- =====================================================
-- 5. Verificar políticas RLS
-- =====================================================
SELECT 
  '✓ Políticas RLS verificadas - ' || COUNT(*) || ' políticas creadas' AS resultado
FROM pg_policies
WHERE tablename = 'auditoria'
HAVING COUNT(*) = 2;  -- Debe tener 2 políticas

-- =====================================================
-- 6. Resumen de verificación
-- =====================================================
SELECT 
  '🎉 TABLA DE AUDITORÍA LISTA PARA USAR' AS estado,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'auditoria') AS columnas,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'auditoria') AS indices,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'auditoria') AS politicas,
  (SELECT rowsecurity FROM pg_tables WHERE tablename = 'auditoria') AS rls_habilitado;

-- =====================================================
-- RESULTADO ESPERADO
-- =====================================================
/*

Si todo está correcto, deberías ver:

NOTICE:  ✓ Registro de prueba insertado correctamente
NOTICE:  ✓ Verificación de inserción: OK
NOTICE:  ✓ Registro de prueba eliminado (limpieza)

Y las siguientes filas de resultados:
- ✓ Estructura de tabla verificada - 12 columnas
- ✓ Índices verificados - 6 índices creados (o más)
- ✓ RLS (Row Level Security) está HABILITADO
- ✓ Políticas RLS verificadas - 2 políticas creadas
- 🎉 TABLA DE AUDITORÍA LISTA PARA USAR

Si ves algún error o advertencia:
1. Revisa que ejecutaste el script de migración completo
2. Verifica que tienes permisos suficientes en Supabase
3. Ejecuta el script diagnostico_auditoria.sql para más detalles

*/
