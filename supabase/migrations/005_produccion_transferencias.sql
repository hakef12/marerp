-- =====================================================================
-- MIGRACIÓN 005 — Órdenes de producción por bodega + Transferencias
-- Ejecutar DESPUÉS de 004_extended_tables.sql
-- =====================================================================

-- ── ÓRDENES DE PRODUCCIÓN (flujos entre bodegas) ──────────────────────
CREATE TABLE IF NOT EXISTS produccion_ordenes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero_orden          TEXT NOT NULL,
  bodega_origen_id      TEXT,
  bodega_origen_nombre  TEXT,
  bodega_destino_id     TEXT,
  bodega_destino_nombre TEXT,
  producto_nombre       TEXT NOT NULL,
  cantidad              DECIMAL(12,4) NOT NULL,
  cantidad_real         DECIMAL(12,4),
  notas                 TEXT,
  estado                TEXT DEFAULT 'pendiente',
  fecha_esperada        DATE,
  fecha_completada      TIMESTAMPTZ,
  merma                 DECIMAL(12,4) DEFAULT 0,
  merma_porcentaje      TEXT,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prod_ord_empresa ON produccion_ordenes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_prod_ord_estado  ON produccion_ordenes(empresa_id, estado);
ALTER TABLE produccion_ordenes ENABLE ROW LEVEL SECURITY;

-- ── LOTES DE PRODUCCIÓN ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produccion_lotes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero_lote           TEXT NOT NULL,
  orden_id              UUID REFERENCES produccion_ordenes(id) ON DELETE SET NULL,
  producto_nombre       TEXT NOT NULL,
  cantidad_planificada  DECIMAL(12,4),
  cantidad_real         DECIMAL(12,4),
  cantidad              DECIMAL(12,4),
  merma                 DECIMAL(12,4) DEFAULT 0,
  merma_porcentaje      TEXT,
  merma_motivo          TEXT,
  bodega_origen_id      TEXT,
  bodega_origen_nombre  TEXT,
  bodega_id             TEXT,
  bodega_nombre         TEXT,
  fecha_produccion      TIMESTAMPTZ DEFAULT NOW(),
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prod_lotes_empresa ON produccion_lotes(empresa_id);
ALTER TABLE produccion_lotes ENABLE ROW LEVEL SECURITY;

-- ── TRANSFERENCIAS ENTRE BODEGAS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS transferencias_bodegas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero_transferencia    TEXT NOT NULL,
  bodega_origen_id        TEXT NOT NULL,
  bodega_origen_nombre    TEXT,
  bodega_destino_id       TEXT NOT NULL,
  bodega_destino_nombre   TEXT,
  producto_nombre         TEXT NOT NULL,
  cantidad                DECIMAL(12,4) NOT NULL,
  notas                   TEXT,
  estado                  TEXT DEFAULT 'pendiente',
  solicitado_por          TEXT,
  stock_disponible_origen DECIMAL(12,4),
  fecha_completada        TIMESTAMPTZ,
  metadata                JSONB DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trans_empresa ON transferencias_bodegas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_trans_estado  ON transferencias_bodegas(empresa_id, estado);
ALTER TABLE transferencias_bodegas ENABLE ROW LEVEL SECURITY;

-- =====================================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('produccion_ordenes','produccion_lotes','transferencias_bodegas')
ORDER BY table_name;
