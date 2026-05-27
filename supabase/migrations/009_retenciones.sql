-- ── 009: Tabla de Retenciones Electrónicas (Comprobante de Retención SRI Ecuador) ──

-- Secuencial de retenciones en configuración de facturación
ALTER TABLE configuracion_facturacion
  ADD COLUMN IF NOT EXISTS secuencial_retenciones INTEGER DEFAULT 1;

-- Tabla principal de retenciones
CREATE TABLE IF NOT EXISTS retenciones (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Identificación del comprobante
  numero_retencion            TEXT NOT NULL,              -- 001-001-000000001
  clave_acceso                TEXT UNIQUE,
  ambiente                    TEXT DEFAULT 'pruebas',     -- pruebas / produccion
  secuencial                  INTEGER,

  -- Estado SRI
  estado                      TEXT DEFAULT 'PENDIENTE',   -- PENDIENTE / AUTORIZADO / NO_AUTORIZADO
  fecha_autorizacion          TEXT,
  numero_autorizacion         TEXT,
  mensajes_sri                JSONB DEFAULT '[]',

  -- Sujeto retenido (proveedor)
  proveedor_identificacion    TEXT NOT NULL,
  proveedor_tipo_id           TEXT DEFAULT '04',          -- 04=RUC, 05=Cédula, 06=Pasaporte
  proveedor_razon_social      TEXT NOT NULL,
  proveedor_email             TEXT,

  -- Documento sustento (factura del proveedor)
  doc_sustento_tipo           TEXT DEFAULT '01',          -- 01=Factura
  doc_sustento_numero         TEXT,
  doc_sustento_fecha          TEXT,

  -- Período fiscal MM/YYYY
  periodo_fiscal              TEXT,

  -- Impuestos retenidos (array de objetos)
  -- Cada objeto: { codigo, codigo_retencion, descripcion, base_imponible, porcentaje, valor_retenido, cod_doc_sustento, num_doc_sustento, fecha_emision_doc_sustento }
  impuestos                   JSONB DEFAULT '[]',
  total_retenido              DECIMAL(12,4) DEFAULT 0,

  -- XML firmado
  xml_firmado                 TEXT,

  -- Relación con compra (opcional)
  compra_id                   UUID REFERENCES compras(id) ON DELETE SET NULL,

  -- Timestamps
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retenciones_empresa  ON retenciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_retenciones_estado   ON retenciones(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_retenciones_fecha    ON retenciones(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retenciones_compra   ON retenciones(compra_id);

ALTER TABLE retenciones ENABLE ROW LEVEL SECURITY;

-- RLS: usuarios solo ven retenciones de su empresa
CREATE POLICY IF NOT EXISTS retenciones_empresa_policy ON retenciones
  USING (empresa_id IN (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));
