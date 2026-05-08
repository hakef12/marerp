# 📋 Cheat Sheet - Tabla Auditoría M.A.R ERP

## ⚡ Comando Rápido (Copy & Paste)

### Crear/Recrear Tabla Completa
```sql
DROP TABLE IF EXISTS auditoria CASCADE;
CREATE TABLE auditoria (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id UUID NOT NULL, usuario_id UUID NOT NULL, accion VARCHAR(50) NOT NULL, modulo VARCHAR(100) NOT NULL, tabla VARCHAR(100), registro_id VARCHAR(100), datos_anteriores JSONB, datos_nuevos JSONB, ip_address VARCHAR(50), resultado VARCHAR(20) DEFAULT 'exitoso', created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());
CREATE INDEX idx_auditoria_empresa ON auditoria(empresa_id);
CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX idx_auditoria_created_at ON auditoria(created_at DESC);
CREATE INDEX idx_auditoria_accion ON auditoria(accion);
CREATE INDEX idx_auditoria_resultado ON auditoria(resultado);
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios admin pueden ver auditoría de su empresa" ON auditoria FOR SELECT USING (empresa_id IN (SELECT u.empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.rol IN ('admin', 'super_admin')));
CREATE POLICY "Sistema puede crear logs de auditoría" ON auditoria FOR INSERT WITH CHECK (true);
```

---

## 🔍 Comandos de Diagnóstico

### Ver todas las columnas
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'auditoria' ORDER BY ordinal_position;
```

### Verificar si existe columna específica
```sql
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditoria' AND column_name = 'modulo');
```

### Ver políticas RLS
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'auditoria';
```

### Ver índices
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'auditoria';
```

### Contar registros
```sql
SELECT COUNT(*) FROM auditoria;
```

---

## 🔧 Comandos de Reparación

### Agregar solo columna 'resultado'
```sql
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS resultado VARCHAR(20) DEFAULT 'exitoso';
```

### Agregar solo columna 'modulo'
```sql
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS modulo VARCHAR(100);
```

### Habilitar RLS
```sql
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
```

### Recrear índice específico
```sql
DROP INDEX IF EXISTS idx_auditoria_modulo;
CREATE INDEX idx_auditoria_modulo ON auditoria(modulo);
```

---

## 📊 Consultas Útiles

### Ver últimos 10 registros de auditoría
```sql
SELECT * FROM auditoria ORDER BY created_at DESC LIMIT 10;
```

### Contar registros por módulo
```sql
SELECT modulo, COUNT(*) as total FROM auditoria GROUP BY modulo ORDER BY total DESC;
```

### Ver acciones de un usuario específico
```sql
SELECT * FROM auditoria WHERE usuario_id = 'uuid-aqui' ORDER BY created_at DESC;
```

### Ver todas las acciones de eliminación
```sql
SELECT * FROM auditoria WHERE accion = 'eliminar' ORDER BY created_at DESC;
```

### Ver errores en auditoría
```sql
SELECT * FROM auditoria WHERE resultado = 'error' ORDER BY created_at DESC;
```

### Actividad por empresa (últimas 24 horas)
```sql
SELECT empresa_id, COUNT(*) as acciones 
FROM auditoria 
WHERE created_at > NOW() - INTERVAL '24 hours' 
GROUP BY empresa_id 
ORDER BY acciones DESC;
```

---

## 🗑️ Comandos de Limpieza

### Eliminar registros antiguos (más de 1 año)
```sql
DELETE FROM auditoria WHERE created_at < NOW() - INTERVAL '1 year';
```

### Backup antes de limpiar
```sql
CREATE TABLE auditoria_backup AS SELECT * FROM auditoria;
```

### Restaurar desde backup
```sql
INSERT INTO auditoria SELECT * FROM auditoria_backup;
```

### Eliminar tabla completamente
```sql
DROP TABLE IF EXISTS auditoria CASCADE;
```

---

## ✅ Comandos de Verificación

### Test de inserción rápida
```sql
INSERT INTO auditoria (empresa_id, usuario_id, accion, modulo, resultado) 
VALUES (gen_random_uuid(), gen_random_uuid(), 'test', 'sistema', 'exitoso') 
RETURNING *;
```

### Verificar estructura completa
```sql
\d+ auditoria  -- Solo funciona en psql client
```

### Ver permisos de la tabla
```sql
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'auditoria';
```

---

## 🚨 Solución de Problemas Comunes

### Error: "column modulo does not exist"
```sql
-- Opción 1: Agregar columna
ALTER TABLE auditoria ADD COLUMN modulo VARCHAR(100);

-- Opción 2: Recrear tabla (si hay más problemas)
-- Ejecuta: EJECUTAR_AHORA.sql
```

### Error: "column resultado does not exist"
```sql
ALTER TABLE auditoria ADD COLUMN resultado VARCHAR(20) DEFAULT 'exitoso';
```

### Error: "permission denied for table auditoria"
```sql
-- Verificar RLS
SELECT rowsecurity FROM pg_tables WHERE tablename = 'auditoria';

-- Si es false, habilitar:
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
```

### Error: "relation auditoria does not exist"
```sql
-- La tabla no existe, crear:
-- Ejecuta: EJECUTAR_AHORA.sql o create_auditoria_table.sql
```

---

## 📈 Estadísticas y Monitoreo

### Tamaño de la tabla
```sql
SELECT pg_size_pretty(pg_total_relation_size('auditoria')) as table_size;
```

### Actividad diaria (últimos 7 días)
```sql
SELECT 
  DATE(created_at) as fecha,
  COUNT(*) as acciones
FROM auditoria 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY fecha DESC;
```

### Top 5 usuarios más activos
```sql
SELECT 
  usuario_id,
  COUNT(*) as acciones
FROM auditoria
GROUP BY usuario_id
ORDER BY acciones DESC
LIMIT 5;
```

### Distribución por tipo de acción
```sql
SELECT 
  accion,
  COUNT(*) as total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as porcentaje
FROM auditoria
GROUP BY accion
ORDER BY total DESC;
```

---

## 🔐 Seguridad y Permisos

### Ver políticas actuales
```sql
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'auditoria';
```

### Verificar que RLS está activo
```sql
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'auditoria';
```

### Test de acceso desde usuario normal
```sql
-- Esto debería fallar si RLS funciona correctamente
-- (ejecutar como usuario no-admin)
SELECT * FROM auditoria WHERE empresa_id != (SELECT empresa_id FROM usuarios WHERE id = auth.uid());
```

---

## 📝 Notas Importantes

- ⚠️ Usa `service_role_key` para insertar desde backend (bypasea RLS)
- ⚠️ Los usuarios normales NO pueden insertar directamente
- ⚠️ Solo admin/super_admin pueden leer logs
- ⚠️ Todos los registros están aislados por `empresa_id`
- ⚠️ La columna `modulo` es obligatoria (NOT NULL)
- ⚠️ La columna `resultado` tiene valor default 'exitoso'

---

## 🎯 Workflow de Desarrollo

### Local Development
1. Crear tabla en Supabase local/staging
2. Probar inserciones desde backend
3. Verificar políticas RLS
4. Migrar a producción

### Producción
1. Hacer backup: `CREATE TABLE auditoria_backup AS SELECT * FROM auditoria;`
2. Ejecutar migración
3. Verificar funcionamiento
4. Eliminar backup si todo ok

---

**💡 Tip:** Guarda este archivo como referencia rápida