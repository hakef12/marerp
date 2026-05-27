-- ── 007: Agregar columna metadata a compras (para datos fiscales SRI) ──────────
-- Esta columna almacena número de autorización, IVA, descuentos y otros datos del XML SRI

ALTER TABLE compras ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Confirmar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'compras' AND column_name = 'metadata';
