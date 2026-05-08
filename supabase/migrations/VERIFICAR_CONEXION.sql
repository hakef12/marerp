-- ==============================================================================
-- 🟢 SCRIPT DE DIAGNÓSTICO DE CONEXIÓN Y ESTADO DEL SISTEMA M.A.R ERP
-- ==============================================================================
-- PROYECTO: ayaczqzezswnimabmvqx (Organización: ocho)
-- USO: Ejecuta este script en el SQL Editor de Supabase
-- ==============================================================================

-- 1. CONSULTA PRINCIPAL DE ESTADO
WITH db_info AS (
    SELECT 
        current_database() as db_name,
        current_user as current_role,
        now() as fecha_hora_servidor
),
table_stats AS (
    SELECT count(*) as total_tablas_publicas
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
),
rls_stats AS (
    SELECT count(*) as tablas_con_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
)
SELECT 
    '✅ CONECTADO A SUPABASE' AS estado_conexion,
    db_info.db_name AS nombre_proyecto,
    db_info.current_role AS rol_actual,
    db_info.fecha_hora_servidor,
    table_stats.total_tablas_publicas,
    rls_stats.tablas_con_rls AS tablas_protegidas_rls,
    CASE 
        WHEN table_stats.total_tablas_publicas = 0 THEN '🔴 Base de datos vacía. Debes ejecutar SETUP_COMPLETO.sql'
        WHEN table_stats.total_tablas_publicas > 0 AND rls_stats.tablas_con_rls = 0 THEN '⚠️ Peligro: Tienes tablas pero el RLS está desactivado (Crítico para SaaS)'
        ELSE '🟢 Entorno Multi-tenant inicializado y protegido'
    END AS diagnostico_sistema
FROM db_info, table_stats, rls_stats;

-- ==============================================================================
-- 2. DETALLE DE TABLAS DEL ERP (Verifica si existen bodegas y movimientos)
-- ==============================================================================
SELECT 
    c.relname AS nombre_tabla,
    CASE 
        WHEN c.relrowsecurity = true THEN '✅ ACTIVADO'
        ELSE '❌ DESACTIVADO'
    END AS seguridad_rls_activada
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relkind = 'r' -- Solo tablas regulares
ORDER BY c.relname;
