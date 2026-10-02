-- ============================================================================
-- Un pedido, una nota de entrega vigente.
--
-- Origen (2026-10-02): 7 pedidos de Meraki facturados dos veces (doble clic,
-- dos pestañas o dos usuarios a la vez; el último, el 01-10). La app ya
-- deshabilita el botón al procesar, así que la barrera tiene que estar aquí.
--
-- Trigger y no índice único: el índice no se puede crear mientras existan los
-- duplicados históricos (pendientes de validar con el cliente). El trigger solo
-- mira la fila nueva, así que protege desde hoy. Cuando se limpien los 7 casos
-- se agrega además el índice único parcial (ver el final del archivo).
--
-- Vigente = sin motivo_anulacion y estado_cobro distinto de 'anulado'. Anular
-- la nota (anular_nota_no_despachada) libera el pedido para refacturarlo.
-- ============================================================================

CREATE OR REPLACE FUNCTION _ventas_un_pedido_una_nota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_otra text;
BEGIN
    IF NEW.pedido_id IS NULL
       OR NEW.motivo_anulacion IS NOT NULL
       OR NEW.estado_cobro IS NOT DISTINCT FROM 'anulado' THEN
        RETURN NEW;
    END IF;

    -- En UPDATE solo importa si la nota se vuelve vigente o cambia de pedido.
    -- Registrar un cobro (cambia estado_cobro) en una nota que ya era vigente no
    -- se toca: si no, los duplicados históricos quedarían bloqueados hasta limpiarlos.
    IF TG_OP = 'UPDATE'
       AND OLD.pedido_id IS NOT DISTINCT FROM NEW.pedido_id
       AND OLD.motivo_anulacion IS NULL
       AND OLD.estado_cobro IS DISTINCT FROM 'anulado' THEN
        RETURN NEW;
    END IF;

    -- Serializa por pedido: dos facturaciones simultáneas no pasan juntas el
    -- control (con READ COMMITTED ninguna vería la fila sin confirmar de la otra).
    PERFORM pg_advisory_xact_lock(hashtext('venta_pedido_' || NEW.pedido_id::text));

    SELECT numero_factura INTO v_otra
      FROM ventas
     WHERE pedido_id = NEW.pedido_id
       AND id <> NEW.id
       AND motivo_anulacion IS NULL
       AND estado_cobro IS DISTINCT FROM 'anulado'
     ORDER BY created_at
     LIMIT 1;

    IF v_otra IS NOT NULL THEN
        RAISE EXCEPTION 'Este pedido ya fue facturado: %', v_otra
            USING HINT = 'Recarga la pantalla: el pedido ya tiene su nota de entrega.';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ventas_un_pedido_una_nota ON ventas;
-- También en UPDATE: reactivar una nota anulada o cambiarle el pedido no puede
-- dejar dos vigentes.
CREATE TRIGGER ventas_un_pedido_una_nota
    BEFORE INSERT OR UPDATE OF pedido_id, estado_cobro, motivo_anulacion ON ventas
    FOR EACH ROW EXECUTE FUNCTION _ventas_un_pedido_una_nota();

-- ── Pendiente: tras limpiar los duplicados históricos ──────────────────────
-- CREATE UNIQUE INDEX ventas_pedido_vigente_unico ON ventas (pedido_id)
--  WHERE pedido_id IS NOT NULL AND motivo_anulacion IS NULL
--    AND estado_cobro IS DISTINCT FROM 'anulado';
