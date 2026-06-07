-- ── 017: Snapshots mensuales de inventario ───────────────────────────────────
-- Ejecutar en: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS inventario_snapshots (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  anio             INTEGER     NOT NULL,
  mes              INTEGER     NOT NULL,    -- 1-12
  fecha_cierre     DATE        NOT NULL,
  items            JSONB       DEFAULT '[]',  -- [{producto_id, nombre, stock, costo, valor}]
  total_valor      DECIMAL(14,2) DEFAULT 0,
  total_productos  INTEGER     DEFAULT 0,
  notas            TEXT,
  usuario_id       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_snap_empresa ON inventario_snapshots(empresa_id, anio, mes DESC);
ALTER TABLE inventario_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY snap_empresa ON inventario_snapshots USING (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
