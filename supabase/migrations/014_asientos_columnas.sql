-- ── 014: Columnas faltantes en asientos_contables ────────────────────────────
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS usuario_id        TEXT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS origen            TEXT;
