-- ============================================================================
-- Anulación de pagos a proveedor (CxP → Ver recepción → Pagos registrados).
--
-- Un pago registrado por error (monto equivocado, recepción equivocada) antes
-- solo se podía corregir por SQL. Ahora Finanzas/Administración lo anula desde
-- la app. La anulación es LÓGICA: la fila queda con anulado=true, quién, cuándo
-- y por qué — nunca se borra, para conservar el rastro.
--
-- La función, en una sola transacción:
--   1) Marca el pago como anulado (motivo obligatorio).
--   2) Si el pago era la aplicación de una Nota de Débito, la ND vuelve a
--      'pendiente' para poder aplicarse de nuevo.
--   3) Recalcula compras.estado_cobro con los pagos vigentes:
--      pagado / parcial / pendiente.
--
-- TODO lector de pagos_proveedor debe filtrar anulado = false.
-- ============================================================================

ALTER TABLE pagos_proveedor
  ADD COLUMN IF NOT EXISTS anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulado_por uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS fecha_anulacion timestamptz;

CREATE OR REPLACE FUNCTION anular_pago_proveedor(
  p_pago_id uuid,
  p_motivo text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago pagos_proveedor%ROWTYPE;
  v_compra compras%ROWTYPE;
  v_rol text;
  v_pagado numeric;
  v_debido numeric;
  v_estado text;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de anulación es obligatorio';
  END IF;

  SELECT rol INTO v_rol FROM usuarios WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'finanzas', 'superadmin') THEN
    RAISE EXCEPTION 'Solo Finanzas o Administración pueden anular pagos';
  END IF;

  SELECT * INTO v_pago FROM pagos_proveedor WHERE id = p_pago_id;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_pago.empresa_id <> get_empresa_id() AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;
  IF v_pago.anulado THEN RAISE EXCEPTION 'Este pago ya está anulado'; END IF;

  -- Bloquea la recepción: dos anulaciones/pagos simultáneos no pisan el estado
  SELECT * INTO v_compra FROM compras WHERE id = v_pago.compra_id FOR UPDATE;
  IF v_compra.estado = 'anulada' THEN
    RAISE EXCEPTION 'La recepción está anulada';
  END IF;

  UPDATE pagos_proveedor
     SET anulado = true,
         motivo_anulacion = btrim(p_motivo),
         anulado_por = auth.uid(),
         fecha_anulacion = now()
   WHERE id = p_pago_id;

  IF v_pago.devolucion_proveedor_id IS NOT NULL THEN
    UPDATE devoluciones_proveedor SET estado_nd = 'pendiente'
     WHERE id = v_pago.devolucion_proveedor_id AND estado_nd = 'aplicada';
  END IF;

  SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
    FROM pagos_proveedor WHERE compra_id = v_compra.id AND NOT anulado;
  v_debido := COALESCE(v_compra.total, 0) - COALESCE(v_compra.descuento_pago, 0);
  v_estado := CASE
    WHEN v_pagado >= v_debido - 0.01 THEN 'pagado'
    WHEN v_pagado > 0.01 THEN 'parcial'
    ELSE 'pendiente'
  END;

  UPDATE compras SET estado_cobro = v_estado WHERE id = v_compra.id;
  RETURN v_estado;
END $$;

REVOKE ALL ON FUNCTION anular_pago_proveedor(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION anular_pago_proveedor(uuid, text) TO authenticated;
