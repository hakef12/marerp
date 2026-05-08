-- Script de Diagnóstico para Tabla de Auditoría
-- Ejecuta este script para ver el estado actual de tu tabla

-- =====================================================
-- 1. Verificar si la tabla existe
-- =====================================================
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_name = 'auditoria'
    ) 
    THEN '✓ La tabla auditoria EXISTE'
    ELSE '✗ La tabla auditoria NO EXISTE - Ejecuta create_auditoria_table.sql'
  END AS estado_tabla;

-- =====================================================
-- 2. Ver estructura de columnas actual
-- =====================================================
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;

-- =====================================================
-- 3. Verificar columnas requeridas
-- =====================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'id') 
    THEN '✓' ELSE '✗' END AS id,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'empresa_id') 
    THEN '✓' ELSE '✗' END AS empresa_id,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'usuario_id') 
    THEN '✓' ELSE '✗' END AS usuario_id,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'accion') 
    THEN '✓' ELSE '✗' END AS accion,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'modulo') 
    THEN '✓' ELSE '✗' END AS modulo,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'tabla') 
    THEN '✓' ELSE '✗' END AS tabla,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'registro_id') 
    THEN '✓' ELSE '✗' END AS registro_id,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'datos_anteriores') 
    THEN '✓' ELSE '✗' END AS datos_anteriores,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'datos_nuevos') 
    THEN '✓' ELSE '✗' END AS datos_nuevos,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'ip_address') 
    THEN '✓' ELSE '✗' END AS ip_address,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'resultado') 
    THEN '✓' ELSE '✗ FALTA - Ejecuta alter_auditoria_add_resultado.sql' END AS resultado,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'created_at') 
    THEN '✓' ELSE '✗' END AS created_at;

-- =====================================================
-- 4. Verificar índices
-- =====================================================
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'auditoria'
ORDER BY indexname;

-- =====================================================
-- 5. Verificar RLS (Row Level Security)
-- =====================================================
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'auditoria';

-- =====================================================
-- 6. Verificar políticas RLS
-- =====================================================
SELECT
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'auditoria';

-- =====================================================
-- 7. Contar registros existentes
-- =====================================================
SELECT COUNT(*) AS total_registros_auditoria
FROM auditoria;

-- =====================================================
-- INTERPRETACIÓN DE RESULTADOS
-- =====================================================
/*

ESCENARIO 1: La tabla NO existe
- Resultado #1 muestra: "✗ La tabla auditoria NO EXISTE"
- Acción: Ejecuta create_auditoria_table.sql

ESCENARIO 2: La tabla existe pero falta columna 'modulo' o 'resultado'
- Resultado #3 muestra: "✗" en la columna correspondiente
- Si falta 'modulo': Ejecuta recreate_auditoria_table.sql (problema grave)
- Si falta 'resultado': Ejecuta alter_auditoria_add_resultado.sql (se puede arreglar)

ESCENARIO 3: La tabla está correcta
- Todos los checks en #3 muestran "✓"
- El error debe estar en otro lugar (verifica el código backend)

ESCENARIO 4: Faltan múltiples columnas
- Varios "✗" en resultado #3
- Acción: Ejecuta recreate_auditoria_table.sql

*/
