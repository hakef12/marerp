-- ============================================================
-- MIGRACIÓN: Agregar columnas faltantes a tabla usuarios
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Agregar columna puesto (cargo/rol del empleado en texto libre)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puesto TEXT;

-- 2. Verificar resultado final
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'usuarios'
ORDER BY ordinal_position;
