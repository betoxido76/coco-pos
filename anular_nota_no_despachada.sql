-- ============================================================================
-- Anulación de Nota de Entrega facturada pero NO despachada.
-- Ejecutado por Finanzas/Administración desde CxC → tab "Anular NE".
--
-- Revierte exactamente lo que hizo el "Registrar" (facturar) del pedido:
--   1) Reintegra inventario al almacén elegido (usando cantidad_alistada,
--      unidades primarias = lo realmente descontado). Salta servicios.
--   2) Revierte cobros (contado / abonos parciales) → limpia CxC y Bancos.
--   3) Anula la venta (estado_cobro='anulado') → sale de CxC y del Dashboard.
--   4) Anula el pedido (estado='anulado') → sale de "Por despachar".
-- Todo en una transacción: si algo falla, no queda nada a medias.
--
-- Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================================

-- Columna de auditoría en la venta
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS motivo_anulacion text;

-- Asegurar que estado_cobro admite 'anulado' (relaja el CHECK sea cual sea su nombre)
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.ventas'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%estado_cobro%'
  LOOP
    EXECUTE format('ALTER TABLE ventas DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE ventas ADD CONSTRAINT ventas_estado_cobro_check
    CHECK (estado_cobro IN ('pendiente','parcial','pagado','anulado'));
END $$;

-- Función de anulación
CREATE OR REPLACE FUNCTION anular_nota_no_despachada(
  p_venta_id uuid,
  p_almacen_destino_id uuid,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_pedido_id uuid;
  v_estado_pedido text;
  v_stock_anterior numeric;
  v_nuevo_stock numeric;
  r RECORD;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de anulación es obligatorio';
  END IF;

  -- Cargar venta y validar pertenencia a la empresa del usuario
  SELECT empresa_id, pedido_id INTO v_empresa, v_pedido_id
  FROM ventas WHERE id = p_venta_id;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'Nota de entrega no encontrada'; END IF;
  IF v_empresa <> get_empresa_id() AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v_pedido_id IS NULL THEN
    RAISE EXCEPTION 'La nota no proviene de un pedido; no aplica esta anulación';
  END IF;

  SELECT estado INTO v_estado_pedido FROM pedidos WHERE id = v_pedido_id;
  IF v_estado_pedido IS DISTINCT FROM 'facturado' THEN
    RAISE EXCEPTION 'Solo se anula una nota facturada y no despachada (estado del pedido: %)', v_estado_pedido;
  END IF;

  IF EXISTS (SELECT 1 FROM devoluciones WHERE venta_id = p_venta_id) THEN
    RAISE EXCEPTION 'La nota tiene devoluciones asociadas; use el flujo de devolución';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM almacenes WHERE id = p_almacen_destino_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Almacén destino inválido';
  END IF;

  -- 1) Reintegrar inventario (cantidad_alistada = unidades primarias descontadas)
  FOR r IN
    SELECT pi.producto_id,
           COALESCE(pi.cantidad_alistada, pi.cantidad) AS cant,
           pt.nombre, pt.sku
    FROM pedido_items pi
    JOIN productos_terminados pt ON pt.id = pi.producto_id
    WHERE pi.pedido_id = v_pedido_id
      AND COALESCE(pi.cantidad_alistada, pi.cantidad) > 0
      AND COALESCE(pt.tipo_producto, '') <> 'servicio'
  LOOP
    SELECT stock_actual INTO v_stock_anterior FROM productos_terminados WHERE id = r.producto_id;
    v_nuevo_stock := COALESCE(v_stock_anterior, 0) + r.cant;

    UPDATE productos_terminados SET stock_actual = v_nuevo_stock WHERE id = r.producto_id;

    UPDATE stock_ubicacion SET cantidad = cantidad + r.cant
      WHERE tipo_item = 'producto_terminado' AND item_id = r.producto_id
        AND almacen_id = p_almacen_destino_id AND almacen_ubicacion_id IS NULL
        AND empresa_id = v_empresa;
    IF NOT FOUND THEN
      INSERT INTO stock_ubicacion (tipo_item, item_id, almacen_id, cantidad, empresa_id)
      VALUES ('producto_terminado', r.producto_id, p_almacen_destino_id, r.cant, v_empresa);
    END IF;

    INSERT INTO movimientos_inventario (
      empresa_id, tipo_item, item_id, item_nombre, item_codigo,
      tipo_movimiento, cantidad, stock_anterior, stock_actual, almacen_id, origen, fecha
    ) VALUES (
      v_empresa, 'producto_terminado', r.producto_id, r.nombre, r.sku,
      'entrada', r.cant, v_stock_anterior, v_nuevo_stock, p_almacen_destino_id, 'anulacion_nota', now()
    );
  END LOOP;

  -- 2) Revertir cobros (contado / abonos parciales)
  DELETE FROM cobros WHERE venta_id = p_venta_id;

  -- 3) Anular la venta
  UPDATE ventas SET estado_cobro = 'anulado', motivo_anulacion = p_motivo WHERE id = p_venta_id;

  -- 4) Anular el pedido
  UPDATE pedidos SET estado = 'anulado', motivo_anulacion = p_motivo WHERE id = v_pedido_id;
END;
$$;

GRANT EXECUTE ON FUNCTION anular_nota_no_despachada(uuid, uuid, text) TO authenticated;
