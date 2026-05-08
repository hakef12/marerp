-- =====================================================
-- SCRIPT DE MIGRACIÓN COMPLETO - TABLA AUDITORÍA
-- M.A.R ERP - Sistema Multi-Tenant
-- =====================================================
-- 
-- INSTRUCCIONES:
-- 1. Abre Supabase Dashboard
-- 2. Ve a SQL Editor
-- 3. Crea una nueva query
-- 4. Copia y pega TODO este archivo
-- 5. Haz clic en "Run" (Ejecutar)
-- 
-- ADVERTENCIA: Este script elimina y recrea la tabla
-- =====================================================

-- Eliminar tabla existente si tiene problemas
DROP TABLE IF EXISTS auditoria CASCADE;

-- Crear tabla de auditoría con estructura completa
CREATE TABLE auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  usuario_id UUID NOT NULL,
  accion VARCHAR(50) NOT NULL,
  modulo VARCHAR(100) NOT NULL,
  tabla VARCHAR(100),
  registro_id VARCHAR(100),
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  ip_address VARCHAR(50),
  resultado VARCHAR(20) DEFAULT 'exitoso',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para optimizar consultas
CREATE INDEX idx_auditoria_empresa ON auditoria(empresa_id);
CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX idx_auditoria_created_at ON auditoria(created_at DESC);
CREATE INDEX idx_auditoria_accion ON auditoria(accion);
CREATE INDEX idx_auditoria_resultado ON auditoria(resultado);

-- Habilitar Row Level Security (RLS)
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- Política para lectura: solo admins de la misma empresa
CREATE POLICY "Usuarios admin pueden ver auditoría de su empresa"
  ON auditoria
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT u.empresa_id 
      FROM usuarios u 
      WHERE u.id = auth.uid() 
      AND u.rol IN ('admin', 'super_admin')
    )
  );

-- Política para inserción: el backend puede insertar con service_key
CREATE POLICY "Sistema puede crear logs de auditoría"
  ON auditoria
  FOR INSERT
  WITH CHECK (true);

-- Agregar comentarios descriptivos
COMMENT ON TABLE auditoria IS 'Registro de auditoría de todas las acciones del sistema ERP M.A.R';
COMMENT ON COLUMN auditoria.empresa_id IS 'ID de la empresa (multi-tenancy)';
COMMENT ON COLUMN auditoria.usuario_id IS 'ID del usuario que realizó la acción';
COMMENT ON COLUMN auditoria.accion IS 'Tipo de acción realizada';
COMMENT ON COLUMN auditoria.modulo IS 'Módulo del sistema donde se realizó la acción';
COMMENT ON COLUMN auditoria.tabla IS 'Tabla de la base de datos afectada';
COMMENT ON COLUMN auditoria.registro_id IS 'ID del registro afectado';
COMMENT ON COLUMN auditoria.datos_anteriores IS 'Estado anterior del registro (JSON)';
COMMENT ON COLUMN auditoria.datos_nuevos IS 'Estado nuevo del registro (JSON)';
COMMENT ON COLUMN auditoria.ip_address IS 'Dirección IP del usuario';
COMMENT ON COLUMN auditoria.resultado IS 'Resultado de la acción (exitoso o error)';

-- Mostrar mensaje de éxito
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════════╗';
  RAISE NOTICE '║   ✓ TABLA DE AUDITORÍA CREADA EXITOSAMENTE       ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Detalles:';
  RAISE NOTICE '  • 12 columnas creadas';
  RAISE NOTICE '  • 6 índices creados';
  RAISE NOTICE '  • RLS habilitado';
  RAISE NOTICE '  • 2 políticas de seguridad configuradas';
  RAISE NOTICE '';
  RAISE NOTICE 'El sistema de auditoría está listo para usar.';
  RAISE NOTICE '';
END $$;

-- Verificar la estructura final
SELECT 
  'Columna' AS tipo,
  column_name AS nombre,
  data_type AS detalle
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;