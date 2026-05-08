# ✅ CHECKLIST - Instalación Tabla Auditoría

## 📋 Checklist de Instalación

Marca cada paso a medida que lo completes:

### FASE 1: Preparación
- [ ] 1.1 - Tengo acceso a Supabase Dashboard
- [ ] 1.2 - Conozco las credenciales de mi proyecto Supabase
- [ ] 1.3 - Tengo permisos de administrador en Supabase
- [ ] 1.4 - He leído START.txt o INSTRUCCIONES.md

### FASE 2: Diagnóstico (Opcional pero recomendado)
- [ ] 2.1 - Ejecuté `diagnostico_auditoria.sql` en SQL Editor
- [ ] 2.2 - Revisé los resultados del diagnóstico
- [ ] 2.3 - Identifiqué qué columnas faltan
- [ ] 2.4 - Decidí qué script ejecutar

### FASE 3: Ejecución del Script
- [ ] 3.1 - Abrí Supabase Dashboard
- [ ] 3.2 - Navegué a SQL Editor
- [ ] 3.3 - Creé una nueva query
- [ ] 3.4 - Copié el contenido completo de `EJECUTAR_AHORA.sql`
- [ ] 3.5 - Pegué el contenido en SQL Editor
- [ ] 3.6 - Hice clic en "Run" (Ejecutar)
- [ ] 3.7 - Vi el mensaje de éxito ✓

### FASE 4: Verificación
- [ ] 4.1 - Ejecuté `test_auditoria.sql`
- [ ] 4.2 - Todos los tests pasaron (✓)
- [ ] 4.3 - La tabla tiene 12 columnas
- [ ] 4.4 - Hay 6 índices creados
- [ ] 4.5 - RLS está habilitado
- [ ] 4.6 - Hay 2 políticas de seguridad

### FASE 5: Prueba en la Aplicación
- [ ] 5.1 - Reinicié/recargué la aplicación M.A.R
- [ ] 5.2 - Puedo acceder al módulo de Configuración
- [ ] 5.3 - No veo errores en la consola
- [ ] 5.4 - Probé crear un usuario (u otra acción)
- [ ] 5.5 - La acción se registró en auditoría
- [ ] 5.6 - Puedo ver los logs desde el módulo de Configuración

### FASE 6: Validación Final
- [ ] 6.1 - El sistema no muestra errores de "column does not exist"
- [ ] 6.2 - Los logs de auditoría se guardan correctamente
- [ ] 6.3 - Solo usuarios admin pueden ver los logs
- [ ] 6.4 - Los logs están aislados por empresa (multi-tenant)
- [ ] 6.5 - El módulo de Configuración está completamente funcional

---

## 🔍 Verificaciones SQL Detalladas

### ✅ Verificación 1: Estructura de Columnas
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;
```

**Resultado esperado:** 12 filas mostrando todas las columnas

- [ ] id (uuid)
- [ ] empresa_id (uuid)
- [ ] usuario_id (uuid)
- [ ] accion (character varying)
- [ ] modulo (character varying)
- [ ] tabla (character varying)
- [ ] registro_id (character varying)
- [ ] datos_anteriores (jsonb)
- [ ] datos_nuevos (jsonb)
- [ ] ip_address (character varying)
- [ ] resultado (character varying)
- [ ] created_at (timestamp with time zone)

---

### ✅ Verificación 2: Índices
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'auditoria'
ORDER BY indexname;
```

**Resultado esperado:** Al menos 6 índices

- [ ] idx_auditoria_accion
- [ ] idx_auditoria_created_at
- [ ] idx_auditoria_empresa
- [ ] idx_auditoria_modulo
- [ ] idx_auditoria_resultado
- [ ] idx_auditoria_usuario

---

### ✅ Verificación 3: Row Level Security
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'auditoria';
```

**Resultado esperado:**
- [ ] rowsecurity = true

---

### ✅ Verificación 4: Políticas RLS
```sql
SELECT policyname, permissive, cmd
FROM pg_policies
WHERE tablename = 'auditoria'
ORDER BY policyname;
```

**Resultado esperado:** 2 políticas

- [ ] "Sistema puede crear logs de auditoría" (INSERT)
- [ ] "Usuarios admin pueden ver auditoría de su empresa" (SELECT)

---

### ✅ Verificación 5: Test de Inserción
```sql
INSERT INTO auditoria (
  empresa_id, usuario_id, accion, modulo, resultado
) VALUES (
  gen_random_uuid(), gen_random_uuid(), 'test', 'sistema', 'exitoso'
) RETURNING *;
```

**Resultado esperado:**
- [ ] Se inserta correctamente (1 fila devuelta)
- [ ] Tiene todos los valores incluyendo modulo y resultado

---

### ✅ Verificación 6: Test de Lectura
```sql
SELECT * FROM auditoria 
ORDER BY created_at DESC 
LIMIT 1;
```

**Resultado esperado:**
- [ ] Muestra el registro insertado en la verificación anterior
- [ ] Todas las columnas están presentes

---

## 🚨 Troubleshooting

### Si algún check falla:

#### ❌ Problema: "Table does not exist"
**Solución:**
- [ ] Ejecuta `EJECUTAR_AHORA.sql` de nuevo
- [ ] Verifica que estás conectado al proyecto correcto en Supabase

#### ❌ Problema: "Column modulo does not exist"
**Solución:**
- [ ] La tabla se creó incorrectamente
- [ ] Ejecuta `EJECUTAR_AHORA.sql` para recrearla

#### ❌ Problema: Faltan índices
**Solución:**
- [ ] Ejecuta la sección de índices del script:
```sql
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria(accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_resultado ON auditoria(resultado);
```

#### ❌ Problema: RLS no está habilitado
**Solución:**
- [ ] Ejecuta:
```sql
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
```

#### ❌ Problema: Faltan políticas
**Solución:**
- [ ] Ejecuta la sección de políticas del `EJECUTAR_AHORA.sql`

---

## 📊 Resumen de Estado

### Antes de empezar:
- [ ] ❌ Tabla con errores
- [ ] ❌ Sistema no funciona
- [ ] ❌ Sin auditoría

### Después de completar:
- [ ] ✅ Tabla correcta con 12 columnas
- [ ] ✅ 6 índices optimizados
- [ ] ✅ RLS habilitado
- [ ] ✅ 2 políticas configuradas
- [ ] ✅ Sistema de auditoría funcional
- [ ] ✅ Módulo de Configuración operativo

---

## 🎯 Próximos Pasos (Después de completar checklist)

1. **Configurar Retención de Datos**
   - [ ] Decidir cuánto tiempo guardar logs (30/90/365 días)
   - [ ] Configurar job de limpieza automática (opcional)

2. **Monitoreo**
   - [ ] Revisar logs diariamente
   - [ ] Configurar alertas para errores (opcional)

3. **Reportes**
   - [ ] Crear vistas para reportes comunes
   - [ ] Exportar logs para compliance (si aplica)

4. **Documentación Interna**
   - [ ] Documentar para tu equipo cómo ver logs
   - [ ] Capacitar admins en uso del módulo de Configuración

---

## ✅ Firma de Completitud

Cuando hayas completado todos los checks:

**Fecha de instalación:** _______________

**Instalado por:** _______________

**Proyecto Supabase:** _______________

**Versión del script:** 1.0.0

**Estado final:** [ ] ✅ TODO FUNCIONANDO

---

## 📞 Soporte

Si necesitas ayuda en algún paso:

1. **Revisa la documentación:**
   - [ ] INSTRUCCIONES.md
   - [ ] SOLUCION_RAPIDA.md
   - [ ] COMPARACION.md

2. **Consulta la referencia:**
   - [ ] CHEATSHEET.md (comandos SQL)
   - [ ] README.md (documentación técnica)

3. **Ejecuta diagnóstico:**
   - [ ] diagnostico_auditoria.sql

---

**💡 Tip:** Imprime o guarda este checklist para futuras instalaciones o migraciones del sistema M.A.R ERP.
