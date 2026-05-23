-- =====================================================================
-- MIGRACIÓN 003 — Tablas SQL propias (reemplaza KV store)
-- Ejecutar UNA SOLA VEZ en Supabase Dashboard → SQL Editor
-- =====================================================================
-- Las tablas existentes (empresas, usuarios, planes, auditoria, bodegas,
-- inventario_lotes) NO se tocan. Solo se crean las nuevas.
-- =====================================================================

-- ── CATEGORÍAS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  color       TEXT DEFAULT '#6366f1',
  icono       TEXT,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias(empresa_id);
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

-- ── PRODUCTOS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  precio          DECIMAL(12,4) DEFAULT 0,
  precio_costo    DECIMAL(12,4) DEFAULT 0,
  stock_actual    DECIMAL(12,4) DEFAULT 0,
  stock           DECIMAL(12,4) DEFAULT 0,
  stock_minimo    DECIMAL(12,4) DEFAULT 0,
  unidad          TEXT DEFAULT 'unidad',
  categoria_id    UUID REFERENCES categorias(id),
  categoria       TEXT,
  codigo          TEXT,
  imagen_url      TEXT,
  activo          BOOLEAN DEFAULT true,
  tiene_iva       BOOLEAN DEFAULT true,
  es_compuesto    BOOLEAN DEFAULT false,
  tipo            TEXT DEFAULT 'producto',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_productos_empresa   ON productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(empresa_id, categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_activo    ON productos(empresa_id, activo);
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

-- ── CLIENTES ──────────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- ── PROVEEDORES ───────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa ON proveedores(empresa_id);
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

-- ── EMPLEADOS ─────────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_empleados_empresa ON empleados(empresa_id);
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;

-- ── MESAS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mesas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero      INTEGER NOT NULL,
  nombre      TEXT,
  capacidad   INTEGER DEFAULT 4,
  estado      TEXT DEFAULT 'disponible',
  zona        TEXT,
  activo      BOOLEAN DEFAULT true,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mesas_empresa ON mesas(empresa_id);
ALTER TABLE mesas ENABLE ROW LEVEL SECURITY;

-- ── COMANDAS ─────────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_comandas_empresa ON comandas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_comandas_estado  ON comandas(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_comandas_fecha   ON comandas(empresa_id, created_at DESC);
ALTER TABLE comandas ENABLE ROW LEVEL SECURITY;

-- ── VENTAS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  comanda_id      UUID REFERENCES comandas(id),
  cliente_id      UUID REFERENCES clientes(id),
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
CREATE INDEX IF NOT EXISTS idx_ventas_empresa ON ventas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha   ON ventas(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_dia     ON ventas(empresa_id, (created_at::date));
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

-- ── RECETAS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recetas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  producto_id  UUID REFERENCES productos(id),
  rendimiento  DECIMAL(12,4) DEFAULT 1,
  unidad       TEXT DEFAULT 'unidad',
  costo_total  DECIMAL(12,4) DEFAULT 0,
  activo       BOOLEAN DEFAULT true,
  ingredientes JSONB DEFAULT '[]',
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recetas_empresa ON recetas(empresa_id);
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;

-- ── ÓRDENES DE PRODUCCIÓN ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordenes_produccion (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero         TEXT,
  receta_id      UUID REFERENCES recetas(id),
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
CREATE INDEX IF NOT EXISTS idx_op_empresa ON ordenes_produccion(empresa_id);
CREATE INDEX IF NOT EXISTS idx_op_fecha   ON ordenes_produccion(empresa_id, created_at DESC);
ALTER TABLE ordenes_produccion ENABLE ROW LEVEL SECURITY;

-- ── COMPRAS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compras (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero           TEXT,
  proveedor_id     UUID REFERENCES proveedores(id),
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
CREATE INDEX IF NOT EXISTS idx_compras_empresa ON compras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha   ON compras(empresa_id, created_at DESC);
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;

-- ── CUENTAS POR PAGAR ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  compra_id        UUID REFERENCES compras(id),
  proveedor_id     UUID REFERENCES proveedores(id),
  proveedor_nombre TEXT,
  monto            DECIMAL(12,2) NOT NULL,
  monto_pagado     DECIMAL(12,2) DEFAULT 0,
  saldo_pendiente  DECIMAL(12,2) NOT NULL,
  estado           TEXT DEFAULT 'pendiente',
  fecha_vencimiento DATE,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cxp_empresa ON cuentas_por_pagar(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cxp_estado  ON cuentas_por_pagar(empresa_id, estado);
ALTER TABLE cuentas_por_pagar ENABLE ROW LEVEL SECURITY;

-- ── CUENTAS CONTABLES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_contables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  tipo        TEXT,
  es_grupo    BOOLEAN DEFAULT false,
  padre_id    UUID REFERENCES cuentas_contables(id),
  activo      BOOLEAN DEFAULT true,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_cc_empresa ON cuentas_contables(empresa_id);
ALTER TABLE cuentas_contables ENABLE ROW LEVEL SECURITY;

-- ── ASIENTOS CONTABLES ────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_asi_empresa ON asientos_contables(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asi_fecha   ON asientos_contables(empresa_id, fecha DESC);
ALTER TABLE asientos_contables ENABLE ROW LEVEL SECURITY;

-- ── MOVIMIENTOS DE INVENTARIO ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES productos(id),
  producto_nombre TEXT,
  bodega_id       UUID REFERENCES bodegas(id),
  tipo            TEXT NOT NULL,
  cantidad        DECIMAL(12,4) NOT NULL,
  precio_unitario DECIMAL(12,4) DEFAULT 0,
  motivo          TEXT,
  referencia      TEXT,
  usuario_id      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mov_empresa  ON movimientos_inventario(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mov_producto ON movimientos_inventario(empresa_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_fecha    ON movimientos_inventario(empresa_id, created_at DESC);
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- ── STOCK POR BODEGA ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_bodegas_sql (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  bodega_id       UUID NOT NULL REFERENCES bodegas(id) ON DELETE CASCADE,
  producto_nombre TEXT NOT NULL,
  cantidad        DECIMAL(12,4) DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bodega_id, producto_nombre)
);
CREATE INDEX IF NOT EXISTS idx_sb_empresa ON stock_bodegas_sql(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sb_bodega  ON stock_bodegas_sql(bodega_id);
ALTER TABLE stock_bodegas_sql ENABLE ROW LEVEL SECURITY;

-- ── MERMAS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mermas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES productos(id),
  producto_nombre TEXT,
  cantidad        DECIMAL(12,4) NOT NULL,
  motivo          TEXT,
  bodega_id       UUID REFERENCES bodegas(id),
  usuario_id      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mermas_empresa ON mermas(empresa_id);
ALTER TABLE mermas ENABLE ROW LEVEL SECURITY;

-- ── PRESUPUESTOS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presupuestos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  anio        INTEGER NOT NULL,
  items       JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, anio)
);
CREATE INDEX IF NOT EXISTS idx_pres_empresa ON presupuestos(empresa_id);
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;

-- ── TURNOS DE CAJA ────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_caja_empresa ON turnos_caja(empresa_id);
CREATE INDEX IF NOT EXISTS idx_caja_estado  ON turnos_caja(empresa_id, estado);
ALTER TABLE turnos_caja ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- FIN DEL SCRIPT — verificar en Supabase que todas las tablas existen
-- =====================================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'categorias','productos','clientes','proveedores','empleados',
    'mesas','comandas','ventas','recetas','ordenes_produccion',
    'compras','cuentas_por_pagar','cuentas_contables','asientos_contables',
    'movimientos_inventario','stock_bodegas_sql','mermas','presupuestos','turnos_caja'
  )
ORDER BY table_name;
