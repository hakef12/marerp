-- =====================================================================
-- MIGRACIÓN 008 — Columnas faltantes en ventas, recetas y productos
-- Ejecutar en Supabase Dashboard → SQL Editor
-- =====================================================================

-- ── recetas: campos del formulario RecetaModal ────────────────────────
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS descripcion       TEXT;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS dificultad        TEXT DEFAULT 'media';
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS instrucciones     TEXT;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS costo_por_porcion DECIMAL(12,4) DEFAULT 0;
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS margen_bruto      DECIMAL(6,2)  DEFAULT 0;

-- ── ventas: campos enviados por el POS que no mapeaban al esquema ─────
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS numero_ticket  TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS fecha          TIMESTAMPTZ;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS impuestos      DECIMAL(12,2) DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS costo_envio    DECIMAL(12,2) DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS metodo_pago    TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS usuario_id     TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cajero_nombre  TEXT;

-- Copiar datos de alias a columnas canónicas (retrocompatibilidad)
UPDATE ventas SET numero_ticket = numero WHERE numero_ticket IS NULL AND numero IS NOT NULL;
UPDATE ventas SET metodo_pago   = forma_pago WHERE metodo_pago IS NULL AND forma_pago IS NOT NULL;
UPDATE ventas SET impuestos     = iva        WHERE impuestos    IS NULL AND iva IS NOT NULL;

-- ── productos: campos del formulario ProductoModal ────────────────────
ALTER TABLE productos ADD COLUMN IF NOT EXISTS disponible              BOOLEAN      DEFAULT true;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS gestiona_inventario     BOOLEAN      DEFAULT true;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_receta               BOOLEAN      DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS impuesto_incluido       BOOLEAN      DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS porcentaje_iva          DECIMAL(5,2) DEFAULT 15;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_maximo            DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS punto_pedido            DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS consumo_promedio_diario DECIMAL(12,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS lead_time_dias          INTEGER      DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_compra           DECIMAL(12,4) DEFAULT 0;

-- Copiar precio_compra desde precio_costo si está vacío
UPDATE productos SET precio_compra = precio_costo WHERE precio_compra = 0 AND precio_costo > 0;
-- Sincronizar disponible desde activo
UPDATE productos SET disponible = activo WHERE disponible IS NULL;

-- ── Verificación ──────────────────────────────────────────────────────
SELECT 'Migración 008 completada' AS resultado;
