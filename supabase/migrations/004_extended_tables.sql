-- =====================================================================
-- MIGRACIÓN 004 — Tablas extendidas (mesas, caja, RRHH, facturación)
-- Ejecutar DESPUÉS de 003_create_app_tables.sql
-- =====================================================================

-- ── MESAS (redefinición con id TEXT para compatibilidad) ──────────────
-- Si la tabla mesas ya existe de 003, la dejamos y agregamos columnas
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS codigo         TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_id      TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_nombre  TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS hora_ocupacion TIMESTAMPTZ;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS consumo_acumulado DECIMAL(12,2) DEFAULT 0;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS numero_comanda TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS personas       INTEGER DEFAULT 0;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS nota           TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS posicion       JSONB DEFAULT '{"x":0,"y":0}';
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_mesas_codigo ON mesas(empresa_id, codigo);

-- ── SESIONES DE CAJA (reemplaza turnos_caja con estructura completa) ──
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS bodega_id        TEXT;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS bodega_nombre    TEXT;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS monto_apertura   DECIMAL(12,2) DEFAULT 0;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS monto_cierre_declarado DECIMAL(12,2);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS monto_cierre_real      DECIMAL(12,2);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS observaciones_cierre   TEXT;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS movimientos      JSONB DEFAULT '[]';
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS fecha_apertura   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS fecha_cierre     TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_caja_bodega ON turnos_caja(empresa_id, bodega_id, estado);

-- ── RRHH: VACANTES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vacantes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  departamento TEXT,
  descripcion TEXT,
  requisitos  TEXT,
  salario_min DECIMAL(12,2),
  salario_max DECIMAL(12,2),
  estado      TEXT DEFAULT 'abierta',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacantes_empresa ON vacantes(empresa_id);
ALTER TABLE vacantes ENABLE ROW LEVEL SECURITY;

-- ── RRHH: EVALUACIONES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evaluaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  empleado_id  UUID REFERENCES empleados(id),
  evaluador_id TEXT,
  periodo      TEXT,
  calificacion DECIMAL(4,2),
  comentarios  TEXT,
  estado       TEXT DEFAULT 'pendiente',
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eval_empresa ON evaluaciones(empresa_id);
ALTER TABLE evaluaciones ENABLE ROW LEVEL SECURITY;

-- ── RRHH: CAPACITACIONES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capacitaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  instructor   TEXT,
  fecha_inicio DATE,
  fecha_fin    DATE,
  duracion_horas DECIMAL(6,2),
  estado       TEXT DEFAULT 'planificada',
  participantes JSONB DEFAULT '[]',
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cap_empresa ON capacitaciones(empresa_id);
ALTER TABLE capacitaciones ENABLE ROW LEVEL SECURITY;

-- ── RRHH: NÓMINAS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nominas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  periodo     TEXT NOT NULL,
  fecha       DATE DEFAULT CURRENT_DATE,
  estado      TEXT DEFAULT 'borrador',
  total       DECIMAL(14,2) DEFAULT 0,
  items       JSONB DEFAULT '[]',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nom_empresa ON nominas(empresa_id);
ALTER TABLE nominas ENABLE ROW LEVEL SECURITY;

-- ── FACTURACIÓN: CONFIGURACIÓN ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion_facturacion (
  empresa_id              UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  ruc                     TEXT,
  razon_social            TEXT,
  nombre_comercial        TEXT,
  direccion_matriz        TEXT,
  direccion_establecimiento TEXT,
  telefono                TEXT,
  email                   TEXT,
  obligado_contabilidad   BOOLEAN DEFAULT false,
  regimen_rimpe           BOOLEAN DEFAULT false,
  contribuyente_especial  TEXT,
  agente_retencion        TEXT,
  ambiente                TEXT DEFAULT 'pruebas',
  secuencial_actual       INTEGER DEFAULT 0,
  codigo_establecimiento  TEXT DEFAULT '001',
  codigo_punto_emision    TEXT DEFAULT '001',
  tiene_certificado       BOOLEAN DEFAULT false,
  metadata                JSONB DEFAULT '{}',
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── FACTURACIÓN: CERTIFICADOS (datos cifrados del .p12) ───────────────
CREATE TABLE IF NOT EXISTS certificados_facturacion (
  empresa_id    UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  nombre        TEXT,
  p12_base64    TEXT,
  password      TEXT,
  valido_desde  TEXT,
  valido_hasta  TEXT,
  titular       TEXT,
  metadata      JSONB DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── FACTURACIÓN: FACTURAS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Identificación
  numero_factura        TEXT NOT NULL,
  clave_acceso          TEXT UNIQUE,
  ambiente              TEXT DEFAULT 'pruebas',
  -- Estado SRI
  estado                TEXT DEFAULT 'PENDIENTE',
  estado_autorizacion   TEXT DEFAULT 'PENDIENTE',
  fecha_autorizacion    TEXT,
  numero_autorizacion   TEXT,
  mensajes_sri          JSONB DEFAULT '[]',
  -- Emisor (snapshot al momento de emitir)
  razon_social          TEXT,
  ruc                   TEXT,
  -- Cliente
  cliente_identificacion      TEXT,
  cliente_tipo_identificacion TEXT,
  cliente_razon_social        TEXT,
  cliente_email               TEXT,
  -- Totales
  subtotal_iva          DECIMAL(12,4) DEFAULT 0,
  subtotal_0            DECIMAL(12,4) DEFAULT 0,
  subtotal_no_objeto    DECIMAL(12,4) DEFAULT 0,
  total_descuento       DECIMAL(12,4) DEFAULT 0,
  iva                   DECIMAL(12,4) DEFAULT 0,
  total                 DECIMAL(12,4) DEFAULT 0,
  -- Items y pagos (JSONB para no romper la lógica existente)
  items                 JSONB DEFAULT '[]',
  formas_pago           JSONB DEFAULT '[]',
  -- Datos completos (para retrocompatibilidad total)
  datos_completos       JSONB DEFAULT '{}',
  -- Fechas
  fecha_emision         TEXT,
  hora_emision          TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_facturas_empresa  ON facturas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado   ON facturas(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha    ON facturas(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_clave    ON facturas(clave_acceso);
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

-- ── USUARIOS: BODEGA POR DEFECTO ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuario_bodegas (
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  bodega_id    UUID REFERENCES bodegas(id) ON DELETE SET NULL,
  bodega_nombre TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (empresa_id, usuario_id)
);

-- ── FACTURAS: clave interna FAC-xxx para lookup ────────────────────────
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS factura_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_key ON facturas(empresa_id, factura_key);

-- =====================================================================
-- Verificación final
-- =====================================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'vacantes','evaluaciones','capacitaciones','nominas',
    'configuracion_facturacion','certificados_facturacion',
    'facturas','usuario_bodegas','turnos_caja','mesas'
  )
ORDER BY table_name;
