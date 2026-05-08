-- Script para recrear completamente la tabla de auditoría
-- ADVERTENCIA: Este script ELIMINARÁ todos los registros existentes de auditoría
-- Úsalo solo si la tabla tiene problemas estructurales graves

-- Eliminar tabla existente (si existe)
DROP TABLE IF EXISTS auditoria CASCADE;

-- Crear tabla de auditoría con estructura completa
CREATE TABLE auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  usuario_id UUID NOT NULL,
  accion VARCHAR(50) NOT NULL, -- 'crear', 'actualizar', 'eliminar', 'ver'
  modulo VARCHAR(100) NOT NULL, -- 'pos', 'inventario', 'cocina', 'contabilidad', 'rrhh', 'sistema', etc.
  tabla VARCHAR(100), -- Tabla afectada
  registro_id VARCHAR(100), -- ID del registro afectado
  datos_anteriores JSONB, -- Datos antes del cambio
  datos_nuevos JSONB, -- Datos después del cambio
  ip_address VARCHAR(50), -- IP del usuario
  resultado VARCHAR(20) DEFAULT 'exitoso', -- 'exitoso' o 'error'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_auditoria_empresa ON auditoria(empresa_id);
CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX idx_auditoria_created_at ON auditoria(created_at DESC);
CREATE INDEX idx_auditoria_accion ON auditoria(accion);
CREATE INDEX idx_auditoria_resultado ON auditoria(resultado);

-- Políticas RLS (Row Level Security)
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- Política para lectura: usuarios admin y super_admin pueden ver auditoría de su empresa
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

-- Política para inserción: cualquier usuario autenticado puede crear logs (el backend valida)
CREATE POLICY "Sistema puede crear logs de auditoría"
  ON auditoria
  FOR INSERT
  WITH CHECK (true);

-- Comentarios
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