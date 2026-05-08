# 🚀 EJECUTAR ESTO AHORA

## ⚡ Solución Rápida en 3 Pasos (2 minutos)

Tu tabla `auditoria` existe pero le faltan columnas. Aquí está la solución:

---

### 🔴 PASO 1: Abre Supabase

1. Ve a https://app.supabase.com
2. Selecciona tu proyecto
3. Haz clic en **"SQL Editor"** en el menú izquierdo

---

### 🟡 PASO 2: Copia este SQL

Abre el archivo **`FIX_AUDITORIA_INCREMENTAL.sql`** que está en esta misma carpeta y copia TODO su contenido.

O si prefieres, copia este código directamente:

```sql
-- MIGRACIÓN INCREMENTAL - AGREGA COLUMNAS FALTANTES
-- Este script NO borra datos, solo agrega lo que falta

-- 1. Agregar columnas faltantes
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS modulo VARCHAR(100);
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS resultado VARCHAR(20) DEFAULT 'exitoso';
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS tabla VARCHAR(100);
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS registro_id VARCHAR(100);
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS datos_anteriores JSONB;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS datos_nuevos JSONB;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);

-- 2. Actualizar registros NULL
UPDATE auditoria SET modulo = 'sistema' WHERE modulo IS NULL;

-- 3. Hacer modulo obligatorio
ALTER TABLE auditoria ALTER COLUMN modulo SET NOT NULL;

-- 4. Crear índices
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria(accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_resultado ON auditoria(resultado);

-- 5. Habilitar RLS
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- 6. Recrear políticas
DROP POLICY IF EXISTS "Usuarios admin pueden ver auditoría de su empresa" ON auditoria;
DROP POLICY IF EXISTS "Sistema puede crear logs de auditoría" ON auditoria;

CREATE POLICY "Usuarios admin pueden ver auditoría de su empresa"
  ON auditoria FOR SELECT
  USING (empresa_id IN (
    SELECT u.empresa_id FROM usuarios u 
    WHERE u.id = auth.uid() AND u.rol IN ('admin', 'super_admin')
  ));

CREATE POLICY "Sistema puede crear logs de auditoría"
  ON auditoria FOR INSERT
  WITH CHECK (true);
```

---

### 🟢 PASO 3: Ejecuta

1. Pega el código en el editor SQL de Supabase
2. Haz clic en el botón **"Run"** (o presiona `Ctrl+Enter`)
3. Espera a que termine (unos segundos)

---

## ✅ Verificación

Si ves este mensaje, ¡todo funcionó!:

```
╔════════════════════════════════════════════════════╗
║   ✓ TABLA DE AUDITORÍA ACTUALIZADA               ║
╚════════════════════════════════════════════════════╝

Detalles:
  • 12 columnas totales
  • 6 índices creados
  • 2 políticas de seguridad
  • RLS habilitado

El sistema de auditoría está listo para usar.
```

---

## 🎯 ¿Qué hace este script?

✅ **AGREGA** columnas faltantes (`modulo`, `resultado`, etc.)  
✅ **CORRIGE** políticas RLS (usa `rol` en vez de `role`)  
✅ **CREA** índices para mejor rendimiento  
✅ **PRESERVA** todos tus datos existentes  

❌ **NO elimina nada**  
❌ **NO borra registros**  

---

## 🆘 Si algo sale mal

### Error: "column already exists"
✅ **Ignóralo** - Significa que esa columna ya existía. El script continúa con las demás.

### Error: "permission denied"
⚠️ Asegúrate de estar usando tu cuenta de administrador en Supabase.

### Error: "relation usuarios does not exist"
⚠️ Tu tabla de usuarios tiene un nombre diferente. Contacta soporte.

---

## 📞 ¿Necesitas Ayuda?

Si el script falla o necesitas ayuda:

1. 📸 Toma una captura del error completo
2. 📋 Ejecuta el script de diagnóstico: `DIAGNOSTICO.sql`
3. 📧 Envía ambos resultados a soporte

---

## 🎉 Después de Ejecutar

1. Recarga tu aplicación M.A.R ERP
2. Ve al módulo de **Auditoría**
3. Deberías ver: **"Sistema de auditoría operativo" ✓**

**¡Listo! Tu sistema de auditoría ahora funciona perfectamente.** 🚀

---

## 💡 Tip

Si quieres verificar que todo está bien, ejecuta esto en SQL Editor:

```sql
-- Debe mostrar 12 columnas
SELECT COUNT(*) as total_columnas 
FROM information_schema.columns 
WHERE table_name = 'auditoria';

-- Debe mostrar 2 políticas
SELECT COUNT(*) as total_politicas 
FROM pg_policies 
WHERE tablename = 'auditoria';
```

Si ambos números son correctos, ¡perfecto! ✅
