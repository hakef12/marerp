-- ── 019: Historial de nóminas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nomina_periodos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  anio         INTEGER     NOT NULL,
  mes          INTEGER     NOT NULL,   -- 1-12
  estado       TEXT        NOT NULL DEFAULT 'borrador', -- borrador | cerrado
  total_bruto  DECIMAL(14,2) DEFAULT 0,
  total_iess_personal DECIMAL(14,2) DEFAULT 0,
  total_iess_patronal DECIMAL(14,2) DEFAULT 0,
  total_neto   DECIMAL(14,2) DEFAULT 0,
  total_costo_empresa DECIMAL(14,2) DEFAULT 0,
  detalle      JSONB       DEFAULT '[]', -- array de roles de pago individuales
  asiento_id   TEXT,        -- referencia al asiento contable generado
  notas        TEXT,
  usuario_id   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, anio, mes)
);
CREATE INDEX IF NOT EXISTS idx_nomina_empresa ON nomina_periodos(empresa_id, anio, mes DESC);
ALTER TABLE nomina_periodos ENABLE ROW LEVEL SECURITY;
CREATE POLICY nomina_empresa ON nomina_periodos USING (true);

NOTIFY pgrst, 'reload schema';
