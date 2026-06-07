-- ── 012: Soporte de sub-recetas en tabla recetas ──────────────────────────────
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Una sub-receta es una preparación intermedia (salsa, fondo, masa, etc.)
-- que NO se vende directamente sino que se usa como ingrediente en otras recetas.
-- Ejemplo: "Salsa bechamel" → ingrediente de "Lasaña al horno"

-- Marcar si la receta es una sub-receta (preparación intermedia)
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS es_subreceta BOOLEAN DEFAULT false;

-- Unidad en que se mide el rendimiento de la sub-receta
-- Ejemplo: "litros", "gramos", "porciones", "kg", etc.
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS unidad_rendimiento TEXT DEFAULT 'porcion';

-- Costo calculado por unidad de rendimiento (se actualiza automáticamente)
-- Ejemplo: salsa bechamel cuesta $0.80 por cada 100ml → costo_por_unidad = 0.80
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS costo_por_unidad DECIMAL(12,6) DEFAULT 0;

-- Índice para búsquedas eficientes de sub-recetas por empresa
CREATE INDEX IF NOT EXISTS idx_recetas_es_subreceta ON recetas(empresa_id, es_subreceta);

-- Comentario informativo en la tabla
COMMENT ON COLUMN recetas.es_subreceta IS 'true = preparación intermedia (no se vende), false = plato final vendible';
COMMENT ON COLUMN recetas.unidad_rendimiento IS 'Unidad de medida del rendimiento: litros, gramos, porciones, kg, etc.';
COMMENT ON COLUMN recetas.costo_por_unidad IS 'Costo calculado automáticamente por unidad de rendimiento';
