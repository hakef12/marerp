-- ── 011: Columnas de estadísticas en tabla clientes ──
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS total_compras  DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_compra  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telefono       TEXT,
  ADD COLUMN IF NOT EXISTS direccion      TEXT;

CREATE INDEX IF NOT EXISTS idx_clientes_identificacion ON clientes(empresa_id, identificacion);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre         ON clientes(empresa_id, nombre);

-- Poblar clientes desde facturas ya emitidas (tabla facturas, no ventas)
INSERT INTO clientes (
  empresa_id, identificacion, tipo_identificacion,
  nombre, email, total_compras, ultima_compra, created_at, updated_at
)
SELECT DISTINCT ON (f.empresa_id, f.cliente_identificacion)
  f.empresa_id,
  f.cliente_identificacion,
  COALESCE(f.cliente_tipo_identificacion, '04'),
  f.cliente_razon_social,
  NULLIF(f.cliente_email, ''),
  SUM(f.total)       OVER (PARTITION BY f.empresa_id, f.cliente_identificacion),
  MAX(f.created_at)  OVER (PARTITION BY f.empresa_id, f.cliente_identificacion),
  MIN(f.created_at)  OVER (PARTITION BY f.empresa_id, f.cliente_identificacion),
  NOW()
FROM facturas f
WHERE f.cliente_identificacion IS NOT NULL
  AND f.cliente_identificacion NOT IN ('9999999999999', '0000000000000')
  AND f.cliente_razon_social IS NOT NULL
ON CONFLICT DO NOTHING;

-- Verificación
SELECT COUNT(*) AS total_clientes,
       ROUND(COALESCE(SUM(total_compras), 0)::NUMERIC, 2) AS total_facturado
FROM clientes;
