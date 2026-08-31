-- ============================================================================
-- Notas de Crédito — FASE 4 (gobernanza)
--
-- Dos capas sobre el ciclo de vida de la NC, en extremos opuestos:
--
--   Aprobación por umbral  — control preventivo, antes de que la NC sea crédito.
--   Anulación con reverso  — control correctivo, después de que ya lo es.
--
-- Van juntas porque rechazar una NC en revisión es, mecánicamente, anularla:
-- el rechazo llama al mismo motor de reverso.
--
-- El umbral nace VACÍO en todas las empresas: sin configurarlo, el flujo es
-- idéntico al de hoy y nadie nota el cambio. Se activa cuando el cliente lo
-- decide, cargando el valor en CxC → Notas de crédito → Motivos y aprobación.
--
-- Correr una sola vez en el SQL Editor de Supabase. Es idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Columnas de gobernanza + el almacén al que repuso la NC.
--
-- `almacen_id` es el hueco que impedía revertir: la NC reponía mercancía a un
-- almacén elegido en el formulario, pero no lo guardaba en ninguna parte. Sin
-- ese dato no se puede sacar de vuelta lo que entró. Las NC anteriores a esta
-- fase lo tienen en NULL y la app pide el almacén al anularlas.
-- ----------------------------------------------------------------------------
ALTER TABLE devoluciones
    ADD COLUMN IF NOT EXISTS almacen_id       uuid REFERENCES almacenes(id),
    ADD COLUMN IF NOT EXISTS motivo_anulacion text,
    ADD COLUMN IF NOT EXISTS anulada_por      uuid,
    ADD COLUMN IF NOT EXISTS fecha_anulacion  timestamptz;

-- Las NC nacidas del flujo SDR sí lo tienen: la recepción física registró el
-- almacén en la solicitud.
UPDATE devoluciones d
SET almacen_id = s.almacen_id
FROM solicitudes_devolucion s
WHERE d.solicitud_id = s.id AND d.almacen_id IS NULL;


-- ----------------------------------------------------------------------------
-- PASO 2 — `estado_nc` admite 'en_revision'.
--
-- Una NC en revisión tiene número y detalle, pero NO es crédito: las consultas
-- que ofrecen crédito filtran por estado IN ('pendiente','parcial'), así que
-- queda fuera del modal de cobro y del saldo a favor sin tocar esas queries.
-- ----------------------------------------------------------------------------
DO $$
DECLARE c text;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.devoluciones'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%estado_nc%'
    LOOP
        EXECUTE format('ALTER TABLE devoluciones DROP CONSTRAINT %I', c);
    END LOOP;

    ALTER TABLE devoluciones ADD CONSTRAINT devoluciones_estado_nc_check
        CHECK (estado_nc IN ('en_revision', 'pendiente', 'parcial', 'aplicada',
                             'reembolsada', 'anulada'));
END $$;


-- ----------------------------------------------------------------------------
-- PASO 3 — Anulación con reverso, transaccional.
--
-- Deshace TODO lo que la NC provocó, en este orden:
--   1) Elimina las aplicaciones (filas de `cobros` con su devolucion_id).
--   2) Recalcula el estado_cobro de cada factura afectada. Una factura dada por
--      'pagado' vuelve a 'parcial' o 'pendiente' según lo que quede cubierto.
--   3) Si la NC repuso mercancía, la saca del almacén con los 4 pasos de la
--      invariante de stock (CLAUDE.md §15).
--   4) Marca la NC 'anulada' con motivo, usuario y fecha.
--
-- Se niega a dejar stock negativo: si la mercancía ya se volvió a vender, avisa
-- con el producto y la existencia real en vez de inventar inventario. En ese
-- caso hay que ajustar el inventario primero y reintentar.
--
-- p_almacen_id solo se usa cuando la NC no tiene almacen_id propio (las
-- anteriores a esta fase).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION anular_nota_credito(
    p_nc_id       uuid,
    p_motivo      text,
    p_almacen_id  uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresa   uuid;
    v_estado    text;
    v_afecta    boolean;
    v_almacen   uuid;
    v_usuario   uuid := auth.uid();
    v_cobrado   numeric;
    v_total     numeric;
    v_stock     numeric;
    v_nuevo     numeric;
    v_facturas  uuid[];
    v_venta     uuid;
    r           RECORD;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo de la anulación es obligatorio';
    END IF;

    SELECT empresa_id, estado_nc, afecta_inventario, COALESCE(almacen_id, p_almacen_id)
      INTO v_empresa, v_estado, v_afecta, v_almacen
    FROM devoluciones WHERE id = p_nc_id;

    IF v_empresa IS NULL THEN RAISE EXCEPTION 'Nota de crédito no encontrada'; END IF;
    IF v_empresa <> get_empresa_id() AND NOT is_superadmin() THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;
    IF v_estado = 'anulada' THEN RAISE EXCEPTION 'Esta nota ya está anulada'; END IF;

    IF v_afecta AND v_almacen IS NULL THEN
        RAISE EXCEPTION 'Esta nota repuso mercancía pero no registró el almacén; indica a cuál revertirla';
    END IF;

    -- ── 1) Quitar las aplicaciones y recordar qué facturas tocaba ──────────
    SELECT COALESCE(array_agg(DISTINCT venta_id), '{}')
      INTO v_facturas
    FROM cobros WHERE devolucion_id = p_nc_id AND venta_id IS NOT NULL;

    DELETE FROM cobros WHERE devolucion_id = p_nc_id;

    -- ── 2) Recalcular el estado de cobro de cada factura ───────────────────
    FOREACH v_venta IN ARRAY v_facturas LOOP
        SELECT total INTO v_total FROM ventas WHERE id = v_venta;

        -- Cobros registrados + el pago asentado en la propia venta (ventas de
        -- contado y migradas del POS anterior no tienen filas en `cobros`).
        SELECT COALESCE(SUM(c.monto_usd + COALESCE(c.monto_bs / NULLIF(c.tasa_cambio, 0), 0)), 0)
          INTO v_cobrado
        FROM cobros c WHERE c.venta_id = v_venta;

        SELECT v_cobrado + COALESCE(v.pago_usd, 0)
             + COALESCE(v.pago_bs / NULLIF(v.tasa_cambio, 0), 0)
          INTO v_cobrado
        FROM ventas v WHERE v.id = v_venta;

        -- Una venta anulada no vuelve a la vida por revertir una NC.
        UPDATE ventas SET estado_cobro = CASE
                WHEN v_cobrado >= total - 0.01 THEN 'pagado'
                WHEN v_cobrado > 0.01          THEN 'parcial'
                ELSE 'pendiente' END
        WHERE id = v_venta AND estado_cobro <> 'anulado';
    END LOOP;

    -- ── 3) Sacar del almacén lo que la NC había reingresado ────────────────
    IF v_afecta THEN
        FOR r IN
            SELECT di.producto_id, di.cantidad_devuelta, pt.nombre, pt.sku, pt.stock_actual
            FROM devolucion_items di
            JOIN productos_terminados pt ON pt.id = di.producto_id
            WHERE di.devolucion_id = p_nc_id
              AND di.tipo_linea = 'producto' AND di.producto_id IS NOT NULL
              -- Los servicios no llevan inventario (mismo criterio que
              -- anular_nota_no_despachada): no se repusieron, no se revierten.
              AND COALESCE(pt.tipo_producto, '') <> 'servicio'
        LOOP
            IF r.stock_actual < r.cantidad_devuelta THEN
                RAISE EXCEPTION
                    'No se puede revertir: % (%) tiene % en existencia y la nota repuso %. Ajusta el inventario y reintenta.',
                    r.nombre, r.sku, r.stock_actual, r.cantidad_devuelta;
            END IF;

            v_stock := r.stock_actual;
            v_nuevo := v_stock - r.cantidad_devuelta;

            UPDATE productos_terminados SET stock_actual = v_nuevo WHERE id = r.producto_id;

            UPDATE stock_ubicacion SET cantidad = cantidad - r.cantidad_devuelta
            WHERE tipo_item = 'producto_terminado' AND item_id = r.producto_id
              AND almacen_id = v_almacen AND almacen_ubicacion_id IS NULL;

            INSERT INTO movimientos_inventario (
                empresa_id, tipo_item, item_id, item_nombre, item_codigo,
                tipo_movimiento, cantidad, stock_anterior, stock_actual,
                almacen_id, origen, fecha, notas)
            VALUES (
                v_empresa, 'producto_terminado', r.producto_id, r.nombre, COALESCE(r.sku, ''),
                'salida', r.cantidad_devuelta, v_stock, v_nuevo,
                v_almacen, 'anulacion_nc', now(), 'Anulación de NC: ' || p_motivo);
        END LOOP;
    END IF;

    -- ── 4) Marcar la nota ──────────────────────────────────────────────────
    UPDATE devoluciones SET
        estado_nc        = 'anulada',
        motivo_anulacion = p_motivo,
        anulada_por      = v_usuario,
        fecha_anulacion  = now()
    WHERE id = p_nc_id;
END $$;

GRANT EXECUTE ON FUNCTION anular_nota_credito(uuid, text, uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- PASO 4 — Verificación.
-- ----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'devoluciones'
  AND column_name IN ('almacen_id', 'motivo_anulacion', 'anulada_por', 'fecha_anulacion')
ORDER BY column_name;

SELECT pg_get_constraintdef(oid) AS estados_admitidos
FROM pg_constraint
WHERE conrelid = 'public.devoluciones'::regclass AND conname = 'devoluciones_estado_nc_check';

SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'anular_nota_credito';
