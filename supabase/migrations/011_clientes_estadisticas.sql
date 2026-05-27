-- ── 011: Columnas de estadísticas en tabla clientes ──
-- Permite rastrear total facturado y fecha de última compra por cliente.
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS total_compras  DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_compra  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telefono       TEXT,
  ADD COLUMN IF NOT EXISTS direccion      TEXT;

-- Índice para búsqueda rápida por identificación (autocomplete)
CREATE INDEX IF NOT EXISTS idx_clientes_identificacion ON clientes(empresa_id, identificacion);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(empresa_id, nombre);

-- Poblar total_compras y ultima_compra desde ventas existentes
-- (para clientes que ya existían antes de esta migración)
UPDATE clientes c
SET
  total_compras = COALESCE((
    SELECT SUM(v.total)
    FROM ventas v
    WHERE v.empresa_id = c.empresa_id
      AND v.cliente_identificacion = c.identificacion
  ), 0),
  ultima_compra = (
    SELECT MAX(v.created_at)
    FROM ventas v
    WHERE v.empresa_id = c.empresa_id
      AND v.cliente_identificacion = c.identificacion
  )
WHERE c.identificacion IS NOT NULL;

-- También crear registros en clientes para facturas ya emitidas que tengan
-- cliente con RUC/cédula (no Consumidor Final)
INSERT INTO clientes (empresa_id, identificacion, tipo_identificacion, nombre, email, total_compras, ultima_compra, created_at, updated_at)
SELECT DISTINCT ON (v.empresa_id, v.cliente_identificacion)
  v.empresa_id,
  v.cliente_identificacion AS identificacion,
  COALESCE(v.cliente_tipo_identificacion, '04') AS tipo_identificacion,
  v.cliente_razon_social AS nombre,
  NULLIF(v.cliente_email, '') AS email,
  SUM(v.total) OVER (PARTITION BY v.empresa_id, v.cliente_identificacion) AS total_compras,
  MAX(v.created_at) OVER (PARTITION BY v.empresa_id, v.cliente_identificacion) AS ultima_compra,
  MIN(v.created_at) OVER (PARTITION BY v.empresa_id, v.cliente_identificacion) AS created_at,
  NOW() AS updated_at
FROM ventas v
WHERE v.cliente_identificacion IS NOT NULL
  AND v.cliente_identificacion != '9999999999999'
  AND v.cliente_identificacion != '0000000000000'
  AND v.cliente_razon_social IS NOT NULL
ON CONFLICT DO NOTHING;

-- Verificación
SELECT
  COUNT(*) AS total_clientes,
  COUNT(ultima_compra) AS con_historial,
  ROUND(SUM(total_compras)::NUMERIC, 2) AS total_facturado
FROM clientes;
