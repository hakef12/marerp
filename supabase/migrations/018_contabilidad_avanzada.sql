-- ── 018: Contabilidad Avanzada ────────────────────────────────────────────────
-- Ejecutar en: Supabase Dashboard → SQL Editor

-- ── PERÍODOS CONTABLES (cierre de período) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS periodos_contables (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  anio         INTEGER     NOT NULL,
  mes          INTEGER     NOT NULL,   -- 0 = cierre anual completo
  estado       TEXT        NOT NULL DEFAULT 'abierto',  -- abierto | cerrado
  fecha_cierre TIMESTAMPTZ,
  usuario_cierre TEXT,
  notas        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, anio, mes)
);
CREATE INDEX IF NOT EXISTS idx_periodos_empresa ON periodos_contables(empresa_id, anio, mes);
ALTER TABLE periodos_contables ENABLE ROW LEVEL SECURITY;
CREATE POLICY periodos_empresa ON periodos_contables USING (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);

-- ── ACTIVOS FIJOS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activos_fijos (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo               TEXT,
  nombre               TEXT        NOT NULL,
  descripcion          TEXT,
  categoria            TEXT        DEFAULT 'equipo',  -- equipo | mueble | vehiculo | inmueble | software | otro
  fecha_adquisicion    DATE        NOT NULL,
  valor_adquisicion    DECIMAL(14,4) NOT NULL DEFAULT 0,
  vida_util_meses      INTEGER     NOT NULL DEFAULT 60,
  metodo_depreciacion  TEXT        NOT NULL DEFAULT 'lineal',  -- lineal | acelerada
  valor_residual       DECIMAL(14,4) DEFAULT 0,
  dep_acumulada        DECIMAL(14,4) DEFAULT 0,
  valor_en_libros      DECIMAL(14,4) GENERATED ALWAYS AS (valor_adquisicion - dep_acumulada) STORED,
  cuenta_activo_codigo TEXT        DEFAULT '1.2.02',
  cuenta_dep_codigo    TEXT        DEFAULT '1.2.03',
  cuenta_gasto_codigo  TEXT        DEFAULT '6.1.05',
  ultimo_mes_dep       DATE,        -- último mes en que se depreció
  estado               TEXT        DEFAULT 'activo',  -- activo | dado_de_baja | totalmente_depreciado
  proveedor            TEXT,
  factura_compra       TEXT,
  notas                TEXT,
  metadata             JSONB       DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_af_empresa ON activos_fijos(empresa_id, estado);
ALTER TABLE activos_fijos ENABLE ROW LEVEL SECURITY;
CREATE POLICY af_empresa ON activos_fijos USING (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);

-- ── CONCILIACIONES BANCARIAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conciliaciones_bancarias (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  banco        TEXT        NOT NULL,
  cuenta_banco TEXT,
  mes          INTEGER     NOT NULL,
  anio         INTEGER     NOT NULL,
  saldo_banco  DECIMAL(14,2) DEFAULT 0,
  saldo_libros DECIMAL(14,2) DEFAULT 0,
  diferencia   DECIMAL(14,2) DEFAULT 0,
  estado       TEXT        DEFAULT 'en_proceso',  -- en_proceso | conciliado
  movimientos  JSONB       DEFAULT '[]',  -- líneas del extracto bancario
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, anio, mes, banco)
);
ALTER TABLE conciliaciones_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY conc_empresa ON conciliaciones_bancarias USING (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
