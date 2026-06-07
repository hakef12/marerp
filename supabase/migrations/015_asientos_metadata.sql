-- ── 015: Columnas opcionales faltantes en asientos_contables ────────────────
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS metadata    JSONB        DEFAULT '{}';
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ  DEFAULT NOW();

-- Recargar schema cache de PostgREST para que reconozca las columnas nuevas
NOTIFY pgrst, 'reload schema';
