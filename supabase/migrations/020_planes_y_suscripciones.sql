-- ═══════════════════════════════════════════════════════════════════
--  MIGRACIÓN 020 — Planes actualizados + tabla suscripciones
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Crear tabla `planes` si no existe (puede ser pre-existente) ──
CREATE TABLE IF NOT EXISTS planes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            TEXT UNIQUE NOT NULL,
  nombre            TEXT NOT NULL,
  descripcion       TEXT,
  precio            DECIMAL(10,2) NOT NULL DEFAULT 0,
  modulos_incluidos JSONB NOT NULL DEFAULT '{}',
  limites           JSONB NOT NULL DEFAULT '{}',
  caracteristicas   JSONB NOT NULL DEFAULT '[]',
  soporte           TEXT DEFAULT 'email',
  activo            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Insertar / actualizar los 4 planes ───────────────────────────
INSERT INTO planes (codigo, nombre, descripcion, precio, modulos_incluidos, limites, caracteristicas, soporte, activo)
VALUES
  (
    'basico',
    'Plan Básico',
    'Para food trucks y pequeños locales',
    20.00,
    '{"pos":true,"inventario":true,"cocina":true,"contabilidad":false,"rrhh":false,"auditoria":false,"bi":false}',
    '{"usuarios_max":3,"productos_max":300,"facturas_mes":150,"mesas_max":15,"sucursales_max":1,"almacenamiento_gb":5}',
    '["Punto de Venta (POS)","Cocina / KDS / Comandas","Mesas (hasta 15)","Facturación electrónica SRI","Inventario básico","Hasta 3 usuarios","Soporte por email"]',
    'email',
    true
  ),
  (
    'restaurante',
    'Plan Restaurante',
    'Para restaurantes con operación completa',
    45.00,
    '{"pos":true,"inventario":true,"cocina":true,"contabilidad":false,"rrhh":false,"auditoria":false,"bi":false}',
    '{"usuarios_max":10,"productos_max":1500,"facturas_mes":800,"mesas_max":50,"sucursales_max":1,"almacenamiento_gb":20}',
    '["Todo lo del Plan Básico","Mesas hasta 50","Ingeniería de menú","Órdenes de producción","Transferencias entre bodegas","Hasta 10 usuarios","Soporte por WhatsApp"]',
    'whatsapp',
    true
  ),
  (
    'profesional',
    'Plan Profesional',
    'Control total: contabilidad, RRHH y reportes',
    100.00,
    '{"pos":true,"inventario":true,"cocina":true,"contabilidad":true,"rrhh":true,"auditoria":true,"bi":true}',
    '{"usuarios_max":25,"productos_max":5000,"facturas_mes":-1,"mesas_max":-1,"sucursales_max":3,"almacenamiento_gb":50}',
    '["Todo lo del Plan Restaurante","Contabilidad completa","RRHH y Nómina","Business Intelligence","Auditoría completa","Retenciones SRI","Hasta 3 sucursales","Hasta 25 usuarios","Soporte WhatsApp prioritario"]',
    'whatsapp_prioritario',
    true
  ),
  (
    'enterprise',
    'Plan Enterprise',
    'Para cadenas y grupos gastronómicos',
    230.00,
    '{"pos":true,"inventario":true,"cocina":true,"contabilidad":true,"rrhh":true,"auditoria":true,"bi":true}',
    '{"usuarios_max":-1,"productos_max":-1,"facturas_mes":-1,"mesas_max":-1,"sucursales_max":-1,"almacenamiento_gb":-1}',
    '["Todo lo del Plan Profesional","Sucursales ilimitadas","Usuarios ilimitados","Onboarding y capacitación incluidos","Canal WhatsApp dedicado (respuesta < 2h)","Llamada mensual de seguimiento","Acceso anticipado a nuevas funciones"]',
    'dedicado',
    true
  )
ON CONFLICT (codigo) DO UPDATE SET
  nombre            = EXCLUDED.nombre,
  descripcion       = EXCLUDED.descripcion,
  precio            = EXCLUDED.precio,
  modulos_incluidos = EXCLUDED.modulos_incluidos,
  limites           = EXCLUDED.limites,
  caracteristicas   = EXCLUDED.caracteristicas,
  soporte           = EXCLUDED.soporte,
  activo            = EXCLUDED.activo,
  updated_at        = NOW();

-- Eliminar planes obsoletos que ya no existen
UPDATE planes SET activo = false
WHERE codigo NOT IN ('basico','restaurante','profesional','enterprise');

-- ── 3. Tabla `suscripciones` — historial de pagos por empresa ───────
CREATE TABLE IF NOT EXISTS suscripciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plan_codigo     TEXT NOT NULL REFERENCES planes(codigo),
  -- período cubierto
  periodo_inicio  DATE NOT NULL,
  periodo_fin     DATE NOT NULL,
  -- cobro
  monto           DECIMAL(10,2) NOT NULL,
  moneda          TEXT DEFAULT 'USD',
  -- estado del pago
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','pagado','fallido','reembolsado')),
  -- cómo pagó
  metodo_pago     TEXT DEFAULT 'transferencia'
                  CHECK (metodo_pago IN ('transferencia','efectivo','tarjeta','payphone','otro')),
  referencia_pago TEXT,               -- número de transferencia, comprobante, etc.
  -- cuándo se registró el pago
  pagado_en       TIMESTAMPTZ,
  -- quién lo registró (admin)
  registrado_por  UUID REFERENCES usuarios(id),
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suscripciones_empresa
  ON suscripciones(empresa_id, periodo_fin DESC);

CREATE INDEX IF NOT EXISTS idx_suscripciones_estado
  ON suscripciones(estado, periodo_fin);

ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;

-- ── 4. Agregar columnas útiles a `empresas` si no existen ───────────
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dias_gracia      INTEGER DEFAULT 5;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS proxima_factura  DATE;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS aviso_vencimiento_enviado BOOLEAN DEFAULT false;

-- ── 5. Vista cómoda para el superadmin ──────────────────────────────
CREATE OR REPLACE VIEW v_empresas_suscripcion AS
SELECT
  e.id,
  e.nombre,
  e.email,
  e.plan_tipo,
  e.estado,
  e.fecha_expiracion,
  e.proxima_factura,
  p.precio AS precio_plan,
  CASE
    WHEN e.fecha_expiracion IS NULL THEN 'sin_fecha'
    WHEN e.fecha_expiracion > NOW() + INTERVAL '7 days' THEN 'activa'
    WHEN e.fecha_expiracion > NOW() THEN 'por_vencer'
    WHEN e.fecha_expiracion > NOW() - INTERVAL '5 days' THEN 'en_gracia'
    ELSE 'vencida'
  END AS estado_suscripcion,
  EXTRACT(DAY FROM e.fecha_expiracion - NOW())::INTEGER AS dias_restantes,
  (SELECT COUNT(*) FROM suscripciones s WHERE s.empresa_id = e.id AND s.estado = 'pagado') AS pagos_realizados,
  (SELECT MAX(s.pagado_en) FROM suscripciones s WHERE s.empresa_id = e.id AND s.estado = 'pagado') AS ultimo_pago
FROM empresas e
LEFT JOIN planes p ON p.codigo = e.plan_tipo
ORDER BY e.fecha_expiracion ASC NULLS FIRST;
