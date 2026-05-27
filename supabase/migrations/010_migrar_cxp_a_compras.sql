-- ── 010: Migrar registros huérfanos de cuentas_por_pagar → compras ──
--
-- Problema: compras antiguas se guardaron SOLO en cuentas_por_pagar (sin registro en compras).
-- Esta migración las mueve a la tabla compras y actualiza el compra_id en cxp.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Es idempotente: solo procesa CxP sin compra_id asociado.

DO $$
DECLARE
  cxp_rec RECORD;
  nueva_compra_id UUID;
  num_factura TEXT;
  fecha_emision TEXT;
  total_sin_imp NUMERIC;
  total_iva_val NUMERIC;
  proveedor_ruc TEXT;
  info_sri JSONB;
  migrados INTEGER := 0;
  omitidos INTEGER := 0;
BEGIN

  FOR cxp_rec IN
    SELECT *
    FROM cuentas_por_pagar
    WHERE compra_id IS NULL
    ORDER BY created_at ASC
  LOOP

    -- Extraer campos desde metadata
    num_factura    := COALESCE(
                        cxp_rec.metadata->>'numero_factura',
                        cxp_rec.metadata->>'numero',
                        NULL
                      );
    fecha_emision  := COALESCE(
                        cxp_rec.metadata->>'fecha_emision',
                        cxp_rec.metadata->>'fecha',
                        (cxp_rec.created_at AT TIME ZONE 'UTC')::DATE::TEXT
                      );
    total_sin_imp  := COALESCE(
                        (cxp_rec.metadata->>'total_sin_impuestos')::NUMERIC,
                        (cxp_rec.metadata->>'subtotal')::NUMERIC,
                        cxp_rec.monto,
                        0
                      );
    total_iva_val  := COALESCE(
                        (cxp_rec.metadata->>'total_iva')::NUMERIC,
                        (cxp_rec.metadata->>'iva')::NUMERIC,
                        0
                      );
    info_sri       := cxp_rec.metadata->'info_sri';
    proveedor_ruc  := COALESCE(
                        cxp_rec.metadata->>'proveedor_ruc',
                        info_sri->>'rucEmisor',
                        NULL
                      );

    -- Verificar si ya existe una compra con este número de factura para esta empresa
    -- (para evitar duplicados si se ejecuta dos veces)
    IF num_factura IS NOT NULL THEN
      SELECT id INTO nueva_compra_id
      FROM compras
      WHERE empresa_id = cxp_rec.empresa_id
        AND numero = num_factura
      LIMIT 1;

      IF nueva_compra_id IS NOT NULL THEN
        -- Ya existe — solo vincular el CxP
        UPDATE cuentas_por_pagar
           SET compra_id  = nueva_compra_id,
               updated_at = NOW()
         WHERE id = cxp_rec.id;
        omitidos := omitidos + 1;
        CONTINUE;
      END IF;
    END IF;

    -- Insertar en compras
    INSERT INTO compras (
      empresa_id,
      proveedor_id,
      proveedor_nombre,
      numero,
      fecha,
      subtotal,
      iva,
      total,
      estado,
      estado_pago,
      forma_pago,
      items,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      cxp_rec.empresa_id,
      cxp_rec.proveedor_id,
      cxp_rec.proveedor_nombre,
      num_factura,
      fecha_emision::DATE,
      total_sin_imp,
      total_iva_val,
      COALESCE(cxp_rec.monto, total_sin_imp + total_iva_val),
      cxp_rec.estado,
      cxp_rec.estado,      -- estado_pago = mismo estado de CxP
      'credito',           -- si estaba en CxP era crédito
      '[]'::JSONB,         -- sin ítems detallados
      COALESCE(cxp_rec.metadata, '{}'::JSONB),
      cxp_rec.created_at,
      NOW()
    )
    RETURNING id INTO nueva_compra_id;

    -- Vincular el CxP con la compra recién creada
    UPDATE cuentas_por_pagar
       SET compra_id  = nueva_compra_id,
           updated_at = NOW()
     WHERE id = cxp_rec.id;

    migrados := migrados + 1;

  END LOOP;

  RAISE NOTICE 'Migración completada: % compras creadas, % CxP ya tenían compra vinculada (omitidos).', migrados, omitidos;

END $$;

-- Verificación final
SELECT
  'CxP sin compra_id (pendientes)' AS estado,
  COUNT(*)                          AS cantidad
FROM cuentas_por_pagar
WHERE compra_id IS NULL

UNION ALL

SELECT
  'CxP con compra_id (migrados)',
  COUNT(*)
FROM cuentas_por_pagar
WHERE compra_id IS NOT NULL

UNION ALL

SELECT
  'Total compras en tabla',
  COUNT(*)
FROM compras;
