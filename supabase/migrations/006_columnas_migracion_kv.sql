-- =====================================================================
-- MIGRACIÓN 006 — Columnas extra que el KV tenía y las tablas SQL no
-- Ejecutar ANTES de re-correr el endpoint /admin/migrar-datos
-- =====================================================================

-- ── recetas ──────────────────────────────────────────────────────────
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS precio_venta    DECIMAL(12,4) DEFAULT 0;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS precio_sugerido DECIMAL(12,4) DEFAULT 0;

-- ── productos ─────────────────────────────────────────────────────────
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barras    TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor_id     UUID;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor_nombre TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_venta     DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_unitario   DECIMAL(12,4) DEFAULT 0;

-- Copiar precio_venta desde precio si precio_venta está en 0
UPDATE productos SET precio_venta = precio WHERE precio_venta = 0 AND precio > 0;
-- Copiar precio desde precio_venta si precio está en 0
UPDATE productos SET precio = precio_venta WHERE precio = 0 AND precio_venta > 0;

-- ── proveedores ───────────────────────────────────────────────────────
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS dias_credito  INTEGER DEFAULT 0;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS email         TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS telefono      TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS direccion     TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ciudad        TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS pais          TEXT DEFAULT 'Ecuador';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS banco         TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cuenta_bancaria TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tipo_cuenta   TEXT;

-- ── recetas ───────────────────────────────────────────────────────────
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS categoria         TEXT;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS tiempo_preparacion INTEGER DEFAULT 0;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS porciones         INTEGER DEFAULT 1;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS notas             TEXT;

-- ── ordenes_produccion ────────────────────────────────────────────────
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS bodega_origen_id      TEXT;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS bodega_origen_nombre  TEXT;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS bodega_destino_id     TEXT;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS bodega_destino_nombre TEXT;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS producto_nombre       TEXT;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS cantidad_real         DECIMAL(12,4);
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS merma                 DECIMAL(12,4) DEFAULT 0;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS merma_porcentaje      TEXT;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS responsable           TEXT;

-- ── comandas ─────────────────────────────────────────────────────────
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS fecha_completado TIMESTAMPTZ;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS tiempo_preparacion INTEGER DEFAULT 0;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS prioridad        TEXT DEFAULT 'normal';
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS bodega_id        TEXT;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS cliente_id       UUID;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS cliente_nombre   TEXT;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS subtotal         DECIMAL(12,2) DEFAULT 0;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS descuento        DECIMAL(12,2) DEFAULT 0;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS iva              DECIMAL(12,2) DEFAULT 0;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS total            DECIMAL(12,2) DEFAULT 0;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS forma_pago       TEXT DEFAULT 'efectivo';

-- ── ventas ────────────────────────────────────────────────────────────
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS bodega_id          TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS mesero_id          TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS mesa               TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipo_servicio      TEXT DEFAULT 'mostrador';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS numero_orden       TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anulada            BOOLEAN DEFAULT false;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS motivo_anulacion   TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

-- ── compras ───────────────────────────────────────────────────────────
ALTER TABLE compras ADD COLUMN IF NOT EXISTS estado_pago       TEXT DEFAULT 'pagado';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS forma_pago        TEXT DEFAULT 'efectivo';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS bodega_id         TEXT;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS notas             TEXT;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- ── movimientos_inventario ────────────────────────────────────────────
-- (referencia ya existe en 003, pero por si el cache no la tiene)
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS referencia        TEXT;
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS bodega_destino_id TEXT;
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS costo_total       DECIMAL(12,4) DEFAULT 0;

-- ── cuentas_contables ─────────────────────────────────────────────────
-- (es_grupo ya existe en 003, pero por si el cache no la tiene)
ALTER TABLE cuentas_contables ADD COLUMN IF NOT EXISTS es_grupo               BOOLEAN DEFAULT false;
ALTER TABLE cuentas_contables ADD COLUMN IF NOT EXISTS nivel                  INTEGER DEFAULT 1;

-- ── asientos_contables ────────────────────────────────────────────────
-- (estado ya existe en 003, pero por si el cache no la tiene)
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS estado                TEXT DEFAULT 'activo';
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS total_debito          DECIMAL(14,2) DEFAULT 0;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS total_credito         DECIMAL(14,2) DEFAULT 0;

-- ── Verificación ──────────────────────────────────────────────────────
SELECT 'Migración 006 completada' AS resultado;
