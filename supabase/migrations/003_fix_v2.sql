-- =====================================================================
-- MIGRACIÓN 003-FIX-V2 — Crear tablas faltantes + completar columnas
-- Orden correcto: primero CREATE (para tablas que no existen),
-- luego ALTER (para columnas que faltan en tablas que sí existen)
-- =====================================================================

-- ── 1. CREAR tablas que no existen aún ───────────────────────────────

CREATE TABLE IF NOT EXISTS mesas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero      INTEGER,
  nombre      TEXT,
  capacidad   INTEGER DEFAULT 4,
  estado      TEXT DEFAULT 'disponible',
  zona        TEXT,
  activo      BOOLEAN DEFAULT true,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  color       TEXT DEFAULT '#6366f1',
  icono       TEXT,
  activo      BOOLEAN DEFAULT true,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  precio        DECIMAL(12,4) DEFAULT 0,
  precio_costo  DECIMAL(12,4) DEFAULT 0,
  stock_actual  DECIMAL(12,4) DEFAULT 0,
  stock         DECIMAL(12,4) DEFAULT 0,
  stock_minimo  DECIMAL(12,4) DEFAULT 0,
  unidad        TEXT DEFAULT 'unidad',
  categoria_id  UUID,
  categoria     TEXT,
  codigo        TEXT,
  imagen_url    TEXT,
  activo        BOOLEAN DEFAULT true,
  tiene_iva     BOOLEAN DEFAULT true,
  es_compuesto  BOOLEAN DEFAULT false,
  tipo          TEXT DEFAULT 'producto',
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre               TEXT NOT NULL,
  identificacion       TEXT,
  tipo_identificacion  TEXT DEFAULT 'cedula',
  email                TEXT,
  telefono             TEXT,
  direccion            TEXT,
  activo               BOOLEAN DEFAULT true,
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proveedores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  ruc         TEXT,
  contacto    TEXT,
  telefono    TEXT,
  email       TEXT,
  direccion   TEXT,
  activo      BOOLEAN DEFAULT true,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empleados (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  cedula         TEXT,
  cargo          TEXT,
  puesto         TEXT,
  salario        DECIMAL(12,2) DEFAULT 0,
  email          TEXT,
  telefono       TEXT,
  fecha_ingreso  DATE,
  activo         BOOLEAN DEFAULT true,
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recetas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  producto_id  UUID,
  rendimiento  DECIMAL(12,4) DEFAULT 1,
  unidad       TEXT DEFAULT 'unidad',
  costo_total  DECIMAL(12,4) DEFAULT 0,
  activo       BOOLEAN DEFAULT true,
  ingredientes JSONB DEFAULT '[]',
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comandas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero_orden   TEXT,
  mesa           TEXT,
  tipo_servicio  TEXT DEFAULT 'mesa',
  estado         TEXT DEFAULT 'pendiente',
  notas          TEXT,
  mesero_id      TEXT,
  cajero_id      TEXT,
  items          JSONB DEFAULT '[]',
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ventas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  comanda_id      UUID,
  cliente_id      UUID,
  cliente_nombre  TEXT,
  subtotal        DECIMAL(12,2) DEFAULT 0,
  descuento       DECIMAL(12,2) DEFAULT 0,
  iva             DECIMAL(12,2) DEFAULT 0,
  total           DECIMAL(12,2) NOT NULL DEFAULT 0,
  forma_pago      TEXT DEFAULT 'efectivo',
  estado          TEXT DEFAULT 'completada',
  cajero_id       TEXT,
  notas           TEXT,
  items           JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ordenes_produccion (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero         TEXT,
  receta_id      UUID,
  receta_nombre  TEXT,
  cantidad       DECIMAL(12,4) NOT NULL DEFAULT 1,
  estado         TEXT DEFAULT 'pendiente',
  fecha_inicio   DATE,
  fecha_fin      DATE,
  notas          TEXT,
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compras (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero           TEXT,
  proveedor_id     UUID,
  proveedor_nombre TEXT,
  subtotal         DECIMAL(12,2) DEFAULT 0,
  iva              DECIMAL(12,2) DEFAULT 0,
  total            DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado           TEXT DEFAULT 'pagada',
  fecha            DATE DEFAULT CURRENT_DATE,
  items            JSONB DEFAULT '[]',
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  compra_id         UUID,
  proveedor_id      UUID,
  proveedor_nombre  TEXT,
  monto             DECIMAL(12,2) NOT NULL DEFAULT 0,
  monto_pagado      DECIMAL(12,2) DEFAULT 0,
  saldo_pendiente   DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado            TEXT DEFAULT 'pendiente',
  fecha_vencimiento DATE,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cuentas_contables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  tipo        TEXT,
  es_grupo    BOOLEAN DEFAULT false,
  padre_id    UUID,
  activo      BOOLEAN DEFAULT true,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Unique constraint separado para evitar error si ya existe
DO $$ BEGIN
  ALTER TABLE cuentas_contables ADD CONSTRAINT uq_cuentas_emp_cod UNIQUE (empresa_id, codigo);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS asientos_contables (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero            TEXT,
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion       TEXT,
  tipo              TEXT,
  referencia        TEXT,
  estado            TEXT DEFAULT 'activo',
  origen_automatico BOOLEAN DEFAULT false,
  total_debito      DECIMAL(14,2) DEFAULT 0,
  total_credito     DECIMAL(14,2) DEFAULT 0,
  items             JSONB DEFAULT '[]',
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id     UUID,
  producto_nombre TEXT,
  bodega_id       UUID,
  tipo            TEXT NOT NULL,
  cantidad        DECIMAL(12,4) NOT NULL,
  precio_unitario DECIMAL(12,4) DEFAULT 0,
  motivo          TEXT,
  referencia      TEXT,
  usuario_id      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_bodegas_sql (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  bodega_id       UUID NOT NULL,
  producto_nombre TEXT NOT NULL,
  cantidad        DECIMAL(12,4) DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
DO $$ BEGIN
  ALTER TABLE stock_bodegas_sql ADD CONSTRAINT uq_stock_bodega_prod UNIQUE (bodega_id, producto_nombre);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS mermas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id     UUID,
  producto_nombre TEXT,
  cantidad        DECIMAL(12,4) NOT NULL,
  motivo          TEXT,
  bodega_id       UUID,
  usuario_id      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presupuestos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  anio        INTEGER NOT NULL,
  items       JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
DO $$ BEGIN
  ALTER TABLE presupuestos ADD CONSTRAINT uq_pres_emp_anio UNIQUE (empresa_id, anio);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS turnos_caja (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cajero_id       TEXT,
  cajero_nombre   TEXT,
  estado          TEXT DEFAULT 'abierto',
  monto_inicial   DECIMAL(12,2) DEFAULT 0,
  monto_final     DECIMAL(12,2),
  ventas_efectivo DECIMAL(12,2) DEFAULT 0,
  ventas_tarjeta  DECIMAL(12,2) DEFAULT 0,
  ventas_total    DECIMAL(12,2) DEFAULT 0,
  diferencia      DECIMAL(12,2),
  notas           TEXT,
  metadata        JSONB DEFAULT '{}',
  abierto_en      TIMESTAMPTZ DEFAULT NOW(),
  cerrado_en      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. AGREGAR columnas faltantes (seguro con IF NOT EXISTS) ──────────

ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo       BOOLEAN DEFAULT true;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion  TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio       DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_costo DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_actual DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock        DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad       TEXT DEFAULT 'unidad';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria_id UUID;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria    TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo       TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen_url   TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS tiene_iva    BOOLEAN DEFAULT true;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_compuesto BOOLEAN DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo         TEXT DEFAULT 'producto';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS activo     BOOLEAN DEFAULT true;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS color      TEXT DEFAULT '#6366f1';
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS icono      TEXT;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS metadata   JSONB DEFAULT '{}';
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS activo              BOOLEAN DEFAULT true;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_identificacion TEXT DEFAULT 'cedula';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS identificacion      TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email               TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono            TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion           TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS metadata            JSONB DEFAULT '{}';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS activo     BOOLEAN DEFAULT true;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ruc        TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS contacto   TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS metadata   JSONB DEFAULT '{}';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE empleados ADD COLUMN IF NOT EXISTS activo        BOOLEAN DEFAULT true;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS puesto        TEXT;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS cedula        TEXT;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS salario       DECIMAL(12,2) DEFAULT 0;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS email         TEXT;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS telefono      TEXT;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS fecha_ingreso DATE;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS metadata      JSONB DEFAULT '{}';
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE mesas ADD COLUMN IF NOT EXISTS activo     BOOLEAN DEFAULT true;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS numero     INTEGER;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS nombre     TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS capacidad  INTEGER DEFAULT 4;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS estado     TEXT DEFAULT 'disponible';
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS zona       TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS metadata   JSONB DEFAULT '{}';
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE recetas ADD COLUMN IF NOT EXISTS activo       BOOLEAN DEFAULT true;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS producto_id  UUID;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS rendimiento  DECIMAL(12,4) DEFAULT 1;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS costo_total  DECIMAL(12,4) DEFAULT 0;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS ingredientes JSONB DEFAULT '[]';
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}';
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

-- ── 3. ÍNDICES ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_categorias_empresa  ON categorias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_empresa   ON productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(empresa_id, categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_activo    ON productos(empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa    ON clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa ON proveedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empleados_empresa   ON empleados(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mesas_empresa       ON mesas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_recetas_empresa     ON recetas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_comandas_empresa    ON comandas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_comandas_estado     ON comandas(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_comandas_fecha      ON comandas(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa      ON ventas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha        ON ventas(empresa_id, created_at DESC);
-- idx_ventas_dia omitido: TIMESTAMPTZ::date no es IMMUTABLE en PostgreSQL
CREATE INDEX IF NOT EXISTS idx_op_empresa          ON ordenes_produccion(empresa_id);
CREATE INDEX IF NOT EXISTS idx_op_fecha            ON ordenes_produccion(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compras_empresa     ON compras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha       ON compras(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cxp_empresa         ON cuentas_por_pagar(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cxp_estado          ON cuentas_por_pagar(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_cc_empresa          ON cuentas_contables(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asi_empresa         ON asientos_contables(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asi_fecha           ON asientos_contables(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_empresa         ON movimientos_inventario(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mov_fecha           ON movimientos_inventario(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sb_empresa          ON stock_bodegas_sql(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mermas_empresa      ON mermas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pres_empresa        ON presupuestos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_caja_empresa        ON turnos_caja(empresa_id);
CREATE INDEX IF NOT EXISTS idx_caja_estado         ON turnos_caja(empresa_id, estado);

-- ── 4. HABILITAR RLS en todas las tablas ─────────────────────────────
ALTER TABLE categorias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE comandas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_produccion  ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas_por_pagar   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas_contables   ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos_contables  ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_bodegas_sql   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mermas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos_caja         ENABLE ROW LEVEL SECURITY;

-- ── 5. VERIFICACIÓN ───────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'categorias','productos','clientes','proveedores','empleados',
    'mesas','comandas','ventas','recetas','ordenes_produccion',
    'compras','cuentas_por_pagar','cuentas_contables','asientos_contables',
    'movimientos_inventario','stock_bodegas_sql','mermas','presupuestos','turnos_caja'
  )
ORDER BY table_name;
