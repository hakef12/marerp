-- ── 016: Eliminar asientos contables duplicados de tipo 'factura' ────────────
-- Los asientos tipo 'factura' duplican los de tipo 'venta_pos'.
-- El POS ya registra: Banco/Caja Dr → Ventas Cr + IVA Cr
-- La factura NO debe crear otro asiento de ingreso.
-- Ejecutar en: Supabase Dashboard → SQL Editor

-- Ver cuántos se van a eliminar antes de borrar:
-- SELECT count(*), tipo FROM asientos_contables GROUP BY tipo;

-- Eliminar todos los asientos de tipo 'factura' (son duplicados del asiento de venta POS)
DELETE FROM asientos_contables
WHERE tipo = 'factura';

-- También eliminar reversiones de esos asientos si hubiera
DELETE FROM asientos_contables
WHERE tipo = 'anulacion'
  AND referencia IN (
    SELECT numero FROM asientos_contables WHERE tipo = 'factura'
  );

SELECT 'Asientos duplicados de tipo factura eliminados' AS resultado,
       (SELECT count(*) FROM asientos_contables WHERE tipo IN ('venta_pos','venta','diario','manual')) AS asientos_restantes;
