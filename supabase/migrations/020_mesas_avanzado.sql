-- ── 020: Mesas avanzado — lista de espera ────────────────────────────────────
CREATE TABLE IF NOT EXISTS lista_espera_mesas (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre       TEXT        NOT NULL,
  personas     INTEGER     DEFAULT 1,
  telefono     TEXT,
  nota         TEXT,
  hora_entrada TIMESTAMPTZ DEFAULT NOW(),
  estado       TEXT        DEFAULT 'esperando', -- esperando | sentado | cancelado
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lista_espera ON lista_espera_mesas(empresa_id, estado, hora_entrada);
ALTER TABLE lista_espera_mesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY lista_espera_empresa ON lista_espera_mesas USING (true);

NOTIFY pgrst, 'reload schema';
