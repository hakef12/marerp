-- ── 013: Columna metadata en comandas ────────────────────────────────────────
-- La tabla comandas se creó en 003 con CREATE TABLE IF NOT EXISTS.
-- Si existía antes de esa migración, nunca recibió la columna metadata.
-- Este script la agrega de forma segura.
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE comandas ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS numero_orden TEXT;

-- Inicializar metadata vacío en filas existentes donde sea NULL
UPDATE comandas SET metadata = '{}' WHERE metadata IS NULL;
