# Migraciones de Base de Datos - M.A.R ERP

## 📚 Documentación Disponible

| Archivo | Descripción | Para Quién |
|---------|-------------|------------|
| **[INSTRUCCIONES.md](./INSTRUCCIONES.md)** | 📘 Guía completa paso a paso | 👤 Todos |
| **[SOLUCION_RAPIDA.md](./SOLUCION_RAPIDA.md)** | ⚡ Solución inmediata al error actual | 🚨 Urgente |
| **[INDICE.md](./INDICE.md)** | 📑 Índice de todos los archivos | 🗺️ Navegación |
| **[CHEATSHEET.md](./CHEATSHEET.md)** | 📋 Comandos SQL de referencia rápida | 💻 Desarrolladores |
| **Este archivo (README.md)** | 📖 Documentación técnica general | 📚 Referencia |

---

## 🚨 SOLUCIÓN RÁPIDA AL ERROR ACTUAL

### Error: `column "modulo" does not exist` o `column u.role does not exist`

**¿La tabla auditoria ya existe pero tiene columnas faltantes?**

👉 **Usa la migración incremental (NO borra datos):**

1. Ve a **Supabase Dashboard → SQL Editor**
2. Copia y pega el contenido de **`FIX_AUDITORIA_INCREMENTAL.sql`**
3. Haz clic en **"Run"**

**¿No estás seguro del estado de tu tabla?**

👉 **Ejecuta primero el diagnóstico:**

1. Ve a **Supabase Dashboard → SQL Editor**
2. Copia y pega el contenido de **`DIAGNOSTICO.sql`**
3. Te dirá exactamente qué hacer

---

## 📋 Scripts Disponibles

| Script | Cuándo Usar | ¿Borra Datos? |
|--------|-------------|---------------|
| **`DIAGNOSTICO.sql`** | 🔍 **EJECUTA PRIMERO** - Diagnóstico completo | ❌ No |
| **`FIX_AUDITORIA_INCREMENTAL.sql`** | 🔧 **RECOMENDADO** - Agrega columnas faltantes | ❌ No |
| **`EJECUTAR_AHORA.sql`** | ⚡ Recrear tabla desde cero | ⚠️ Sí |
| `create_auditoria_table.sql` | 🆕 Primera instalación (tabla no existe) | ❌ No |
| `recreate_auditoria_table.sql` | 🔨 Recrear tabla completa | ⚠️ Sí |
| `test_auditoria.sql` | ✅ Verificar que todo funciona | ❌ No |

---

## 🎯 Guía de Uso Recomendada

### Paso 1: Diagnóstico (SIEMPRE EJECUTA ESTO PRIMERO)
```sql
-- Ejecuta en Supabase SQL Editor:
📄 DIAGNOSTICO.sql
```
Este script te dirá:
- ✅ Si la tabla existe
- 📊 Qué columnas tiene
- 🔍 Qué columnas faltan
- 🛡️ Si RLS está habilitado
- 🎯 Exactamente qué script ejecutar

### Paso 2: Aplicar la Solución Correcta

**Opción A: La tabla existe pero le faltan columnas** (CASO MÁS COMÚN)
```sql
-- Ejecuta en Supabase SQL Editor:
📄 FIX_AUDITORIA_INCREMENTAL.sql
```
✅ Ventajas:
- NO borra datos existentes
- Agrega solo las columnas faltantes
- Actualiza políticas RLS
- Crea índices necesarios

**Opción B: La tabla NO existe o está completamente corrupta**
```sql
-- Ejecuta en Supabase SQL Editor:
📄 EJECUTAR_AHORA.sql
```
⚠️ Advertencia: Elimina la tabla y todos sus datos

### Paso 3: Verificación
```sql
-- Ejecuta en Supabase SQL Editor:
📄 test_auditoria.sql
```

Si todos los checks pasan (✓), ¡estás listo! El sistema de auditoría funcionará correctamente.

---

## Tabla de Auditoría

El sistema M.A.R requiere una tabla de auditoría para registrar todas las acciones importantes del sistema.

### Estructura de la tabla `auditoria`

```sql
- id: UUID (Primary Key)
- empresa_id: UUID (Multi-tenancy)
- usuario_id: UUID (Usuario que realizó la acción)
- accion: VARCHAR(50) ('crear', 'actualizar', 'eliminar', 'ver')
- modulo: VARCHAR(100) ('pos', 'inventario', 'cocina', 'contabilidad', 'rrhh', 'sistema', etc.)
- tabla: VARCHAR(100) (Tabla afectada)
- registro_id: VARCHAR(100) (ID del registro afectado)
- datos_anteriores: JSONB (Datos antes del cambio)
- datos_nuevos: JSONB (Datos después del cambio)
- ip_address: VARCHAR(50) (IP del usuario)
- resultado: VARCHAR(20) ('exitoso' o 'error')
- created_at: TIMESTAMP
```

### ¿Qué script ejecutar?

#### Opción 1: La tabla NO existe (Primera vez)
**Archivo:** `create_auditoria_table.sql`

Usa este script si estás creando la tabla por primera vez. Este es el script principal y recomendado.

```bash
# En Supabase Dashboard > SQL Editor
# Copia y pega el contenido de: create_auditoria_table.sql
```

#### Opción 2: La tabla YA existe pero le falta la columna 'resultado'
**Archivo:** `alter_auditoria_add_resultado.sql`

Usa este script si ya tienes la tabla de auditoría pero al intentar usar el sistema ves el error:
```
ERROR: 42703: column "resultado" does not exist
```

Este script agregará la columna sin borrar datos existentes.

```bash
# En Supabase Dashboard > SQL Editor
# Copia y pega el contenido de: alter_auditoria_add_resultado.sql
```

#### Opción 3: La tabla tiene problemas estructurales graves
**Archivo:** `recreate_auditoria_table.sql`

⚠️ **ADVERTENCIA:** Este script ELIMINARÁ todos los registros existentes de auditoría.

Usa este script solo si:
- La tabla tiene múltiples columnas faltantes
- Hay problemas de índices o políticas RLS
- Necesitas empezar desde cero

```bash
# En Supabase Dashboard > SQL Editor
# Copia y pega el contenido de: recreate_auditoria_table.sql
```

### Error actual: "column modulo does not exist"

Si ves el error `ERROR: 42703: column "modulo" does not exist`, significa que la tabla fue creada con una estructura incorrecta.

**Solución recomendada:**

1. **Si NO tienes datos importantes de auditoría:** Ejecuta `recreate_auditoria_table.sql`
2. **Si TIENES datos importantes de auditoría:** 
   - Primero, haz backup de la tabla actual
   - Luego ejecuta `recreate_auditoria_table.sql`

### Verificar que la tabla está correcta

Después de ejecutar cualquier migración, verifica la estructura con:

```sql
-- Ver columnas de la tabla
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;

-- Debería mostrar todas estas columnas:
-- id, empresa_id, usuario_id, accion, modulo, tabla, 
-- registro_id, datos_anteriores, datos_nuevos, ip_address, 
-- resultado, created_at
```

### Verificar políticas RLS

```sql
-- Ver políticas de seguridad
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'auditoria';

-- Deberías ver 2 políticas:
-- 1. "Usuarios admin pueden ver auditoría de su empresa" (SELECT)
-- 2. "Sistema puede crear logs de auditoría" (INSERT)
```

## Notas importantes

1. **Multi-tenancy:** Todos los registros están aislados por `empresa_id`
2. **Seguridad:** Row Level Security (RLS) está habilitado
3. **Permisos:** Solo admin y super_admin pueden leer logs de su empresa
4. **Inserción:** El backend usa service_key para insertar logs (bypasea RLS)
5. **Índices:** Hay índices en empresa_id, usuario_id, modulo, created_at y accion para búsquedas rápidas