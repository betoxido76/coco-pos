-- =============================================================================
-- Presentaciones de insumos — Fase 3: compras
-- docs/plan-presentaciones-insumos.md
--
-- 1. registrar_recepcion: la recepción en UNA transacción (encabezado, líneas,
--    entrada al inventario, avance de la OC). Antes eran 4+ escrituras sueltas
--    desde el navegador ("Recepción no transaccional" del backlog). Los
--    anticipos se siguen aplicando después con aplicar_anticipo_proveedor.
--    La cantidad que entra al inventario es la de la línea YA convertida por
--    el trigger linea_presentacion_cuadra (3 × Botella 2 L = 6.000 ml).
-- 2. registrar_factura_recepcion: acepta precio por presentación y guarda el
--    precio por unidad base con 10 decimales (antes 6: un precio por ml perdía
--    precisión). Para líneas sin presentación el resultado es el de siempre.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_recepcion(p_compra jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_empresa  uuid := get_empresa_id();
    v_compra   compras%ROWTYPE;
    v_oc       ordenes_compra%ROWTYPE;
    v_numero   text;
    v_almacen  uuid := NULLIF(p_compra->>'almacen_id', '')::uuid;
    v_prov     uuid := NULLIF(p_compra->>'proveedor_id', '')::uuid;
    v_oc_id    uuid := NULLIF(p_compra->>'orden_compra_id', '')::uuid;
    x          jsonb;
    v_ci       compra_items%ROWTYPE;
    v_tipo     text;
    v_stock    jsonb := '[]'::jsonb;
    v_oci      uuid;
    v_sol      numeric;
    v_rec      numeric;
BEGIN
    IF v_empresa IS NULL THEN
        RAISE EXCEPTION 'Sesión sin empresa';
    END IF;
    IF NOT _usuario_tiene_modulo(v_empresa, 'compras') THEN
        RAISE EXCEPTION 'Solo usuarios con el módulo Compras pueden registrar recepciones';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La recepción no tiene líneas';
    END IF;
    IF v_almacen IS NULL OR NOT EXISTS (SELECT 1 FROM almacenes WHERE id = v_almacen AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Selecciona un almacén de destino válido';
    END IF;
    IF v_prov IS NULL OR NOT EXISTS (SELECT 1 FROM proveedores WHERE id = v_prov AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Selecciona un proveedor válido';
    END IF;
    IF v_oc_id IS NOT NULL THEN
        SELECT * INTO v_oc FROM ordenes_compra WHERE id = v_oc_id AND empresa_id = v_empresa FOR UPDATE;
        IF v_oc.id IS NULL THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
        IF v_oc.estado NOT IN ('pendiente', 'aprobada', 'recibida_parcial') THEN
            RAISE EXCEPTION 'La orden % está %: no admite más recepciones', v_oc.numero_oc, v_oc.estado;
        END IF;
    END IF;

    -- Numeración sin carreras entre dos recepciones simultáneas de la empresa
    PERFORM pg_advisory_xact_lock(hashtextextended('recepcion:' || v_empresa::text, 0));
    v_numero := obtener_siguiente_recepcion_numero(v_empresa);

    INSERT INTO compras (
        empresa_id, proveedor_id, usuario_id, numero_doc, estado, fecha_compra,
        estado_factura, nro_doc_proveedor, fecha_factura, nro_nota_entrega,
        subtotal, total, base_gravada, base_exenta, iva, descuento_global,
        almacen_id, orden_compra_id,
        condicion_pago, dias_credito, fecha_vencimiento_pago, estado_cobro,
        pago_usd, pago_bs, metodo_usd, metodo_bs, fecha_pago, tasa_cambio, tipo_tasa, notas
    ) VALUES (
        v_empresa, v_prov, auth.uid(), v_numero, 'recibida', now(),
        COALESCE(NULLIF(p_compra->>'estado_factura', ''), 'registrada'),
        NULLIF(btrim(p_compra->>'nro_doc_proveedor'), ''),
        NULLIF(p_compra->>'fecha_factura', '')::date,
        NULLIF(btrim(p_compra->>'nro_nota_entrega'), ''),
        COALESCE((p_compra->>'subtotal')::numeric, 0), COALESCE((p_compra->>'total')::numeric, 0),
        (p_compra->>'base_gravada')::numeric, (p_compra->>'base_exenta')::numeric, (p_compra->>'iva')::numeric,
        COALESCE((p_compra->>'descuento_global')::numeric, 0),
        v_almacen, v_oc_id,
        COALESCE(NULLIF(p_compra->>'condicion_pago', ''), 'contado'),
        COALESCE((p_compra->>'dias_credito')::int, 0),
        NULLIF(p_compra->>'fecha_vencimiento_pago', '')::date,
        COALESCE(NULLIF(p_compra->>'estado_cobro', ''), 'pendiente'),
        COALESCE((p_compra->>'pago_usd')::numeric, 0), COALESCE((p_compra->>'pago_bs')::numeric, 0),
        NULLIF(p_compra->>'metodo_usd', ''), NULLIF(p_compra->>'metodo_bs', ''),
        NULLIF(p_compra->>'fecha_pago', '')::date,
        (p_compra->>'tasa_cambio')::numeric, NULLIF(p_compra->>'tipo_tasa', ''),
        NULLIF(btrim(p_compra->>'notas'), '')
    ) RETURNING * INTO v_compra;

    FOR x IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO compra_items (
            compra_id, empresa_id, tipo_insumo, insumo_id, cantidad, precio_unitario, descuento_item,
            aplica_iva, precio_incluye_iva, iva_pct, base_linea,
            presentacion_id, cantidad_presentacion, precio_presentacion, factor
        ) VALUES (
            v_compra.id, v_empresa, x->>'tipo_insumo', (x->>'insumo_id')::uuid,
            COALESCE((x->>'cantidad')::numeric, 0), COALESCE((x->>'precio_unitario')::numeric, 0),
            COALESCE((x->>'descuento_item')::numeric, 0),
            COALESCE((x->>'aplica_iva')::boolean, true), COALESCE((x->>'precio_incluye_iva')::boolean, false),
            COALESCE((x->>'iva_pct')::numeric, CASE WHEN COALESCE((x->>'aplica_iva')::boolean, true) THEN 16 ELSE 0 END),
            (x->>'base_linea')::numeric,
            NULLIF(x->>'presentacion_id', '')::uuid, (x->>'cantidad_presentacion')::numeric,
            (x->>'precio_presentacion')::numeric, (x->>'factor')::numeric
        ) RETURNING * INTO v_ci;

        IF v_ci.cantidad IS NULL OR v_ci.cantidad <= 0 THEN
            RAISE EXCEPTION 'Hay una línea con cantidad cero o negativa';
        END IF;

        v_tipo := CASE v_ci.tipo_insumo
            WHEN 'materia_prima' THEN 'materia_prima'
            WHEN 'empaque' THEN 'material_empaque'
            WHEN 'material_empaque' THEN 'material_empaque'
            WHEN 'consumible' THEN 'consumible'
            WHEN 'producto_terminado' THEN 'producto_terminado' END;
        IF NOT COALESCE(CASE v_tipo
            WHEN 'materia_prima'      THEN EXISTS (SELECT 1 FROM materias_primas      WHERE id = v_ci.insumo_id AND empresa_id = v_empresa)
            WHEN 'material_empaque'   THEN EXISTS (SELECT 1 FROM materiales_empaque   WHERE id = v_ci.insumo_id AND empresa_id = v_empresa)
            WHEN 'consumible'         THEN EXISTS (SELECT 1 FROM consumibles          WHERE id = v_ci.insumo_id AND empresa_id = v_empresa)
            WHEN 'producto_terminado' THEN EXISTS (SELECT 1 FROM productos_terminados WHERE id = v_ci.insumo_id AND empresa_id = v_empresa)
            END, false) THEN
            RAISE EXCEPTION 'Hay una línea con un insumo que no existe en la empresa';
        END IF;
        v_stock := v_stock || jsonb_build_object('tipo_item', v_tipo, 'item_id', v_ci.insumo_id, 'cantidad', v_ci.cantidad);

        -- Avance de la OC, en unidad base (aunque se haya recibido en otra presentación)
        v_oci := NULLIF(x->>'orden_item_id', '')::uuid;
        IF v_oci IS NOT NULL THEN
            IF v_oc_id IS NULL THEN RAISE EXCEPTION 'Línea de OC en una recepción sin OC'; END IF;
            UPDATE orden_compra_items SET cantidad_recibida = COALESCE(cantidad_recibida, 0) + v_ci.cantidad
             WHERE id = v_oci AND orden_id = v_oc_id AND insumo_id = v_ci.insumo_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'Una línea no corresponde a la orden de compra (otra orden u otro insumo)'; END IF;
        END IF;
    END LOOP;

    -- Entrada al inventario por el motor (los 4 pasos por ítem)
    PERFORM mover_stock_lote(v_stock, 'entrada', 'recepcion_compra', v_almacen, false,
                             'Recepción ' || v_numero, auth.uid(), now());

    IF v_oc_id IS NOT NULL THEN
        SELECT COALESCE(SUM(cantidad_solicitada), 0), COALESCE(SUM(cantidad_recibida), 0)
          INTO v_sol, v_rec FROM orden_compra_items WHERE orden_id = v_oc_id;
        UPDATE ordenes_compra SET estado = CASE WHEN v_rec >= v_sol THEN 'recibida_total' ELSE 'recibida_parcial' END
         WHERE id = v_oc_id;
    END IF;

    RETURN to_jsonb(v_compra);
END $function$;

REVOKE ALL ON FUNCTION public.registrar_recepcion(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recepcion(jsonb, jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- registrar_factura_recepcion: copia de la versión en producción (2026-11-21)
-- con dos cambios marcados [PRES]: precio por presentación y 10 decimales.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_factura_recepcion(p_compra_id uuid, p_nro text, p_fecha date, p_items jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_c compras%ROWTYPE;
    v_it record;
    v_ref numeric;
    v_nuevo numeric;
    v_pp numeric;
    v_fuera int := 0;
    v_f numeric;
    v_g numeric;
    v_e numeric;
    v_bg numeric;
    v_be numeric;
    v_iva numeric;
BEGIN
    SELECT * INTO v_c FROM compras WHERE id = p_compra_id FOR UPDATE;
    IF v_c.id IS NULL OR (v_c.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Recepción no encontrada';
    END IF;
    IF NOT _puede_cxp(v_c.empresa_id) THEN
        RAISE EXCEPTION 'Solo usuarios con el módulo Cuentas por Pagar pueden registrar o corregir la factura';
    END IF;
    IF v_c.estado_cobro = 'anulado' OR v_c.estado = 'anulada' THEN
        RAISE EXCEPTION 'La recepción % está anulada', v_c.numero_doc;
    END IF;
    IF p_nro IS NULL OR btrim(p_nro) = '' THEN RAISE EXCEPTION 'El N° de factura es obligatorio'; END IF;
    IF p_fecha IS NULL THEN RAISE EXCEPTION 'La fecha de la factura es obligatoria'; END IF;

    IF EXISTS (SELECT 1 FROM pagos_proveedor WHERE compra_id = p_compra_id AND NOT anulado)
       OR COALESCE(v_c.pago_usd, 0) > 0 OR COALESCE(v_c.pago_bs, 0) > 0 THEN
        RAISE EXCEPTION 'La recepción % ya tiene abonos (pagos, retenciones, anticipos o notas de crédito): corrige con una nota de crédito del proveedor', v_c.numero_doc;
    END IF;
    IF EXISTS (SELECT 1 FROM devoluciones_proveedor WHERE compra_id = p_compra_id
                AND origen = 'devolucion' AND estado_nd <> 'anulada') THEN
        RAISE EXCEPTION 'La recepción % tiene una devolución al proveedor: anúlala antes de corregir los precios', v_c.numero_doc;
    END IF;

    FOR v_it IN
        SELECT ci.*, (x->>'precio_unitario')::numeric AS precio_nuevo,
               (x->>'precio_presentacion')::numeric AS precio_pres_nuevo   -- [PRES]
          FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) x
          LEFT JOIN compra_items ci ON ci.id = (x->>'id')::uuid AND ci.compra_id = p_compra_id
    LOOP
        IF v_it.id IS NULL THEN RAISE EXCEPTION 'Una línea no pertenece a la recepción'; END IF;
        -- [PRES] Línea con presentación: manda el precio por presentación
        v_pp := NULL;
        IF v_it.factor IS NOT NULL AND v_it.factor > 0 AND v_it.precio_pres_nuevo IS NOT NULL THEN
            v_pp := round(v_it.precio_pres_nuevo, 6);
            v_nuevo := round(v_pp / v_it.factor, 10);
        ELSE
            v_nuevo := round(v_it.precio_nuevo, 10);
        END IF;
        IF v_nuevo IS NULL OR v_nuevo < 0 THEN RAISE EXCEPTION 'Precio inválido en una línea'; END IF;

        v_ref := COALESCE(v_it.precio_recepcion,
            CASE WHEN v_it.precio_incluye_iva AND COALESCE(v_it.aplica_iva, true)
                 THEN round(v_it.precio_unitario / 1.16, 6) ELSE v_it.precio_unitario END);
        IF (v_ref > 0 AND abs(v_nuevo - v_ref) / v_ref > 0.05) OR (v_ref = 0 AND v_nuevo > 0) THEN
            v_fuera := v_fuera + 1;
        END IF;

        UPDATE compra_items SET
            precio_recepcion = v_ref,
            precio_unitario = v_nuevo,
            precio_presentacion = COALESCE(v_pp, precio_presentacion),   -- [PRES]
            precio_incluye_iva = false,
            iva_pct = CASE WHEN COALESCE(aplica_iva, true) THEN 16 ELSE 0 END,
            base_linea = round(cantidad * v_nuevo * (1 - COALESCE(descuento_item, 0) / 100), 4)
         WHERE id = v_it.id;
    END LOOP;

    IF v_fuera > 0 AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
        RAISE EXCEPTION '% línea(s) difieren más del 5%% del precio recibido: el motivo es obligatorio', v_fuera;
    END IF;

    v_f := 1 - COALESCE(v_c.descuento_global, 0) / 100;
    SELECT COALESCE(SUM(b) FILTER (WHERE grav), 0) * v_f, COALESCE(SUM(b) FILTER (WHERE NOT grav), 0) * v_f
      INTO v_g, v_e
      FROM (SELECT COALESCE(aplica_iva, true) AS grav,
                   cantidad * (CASE WHEN precio_incluye_iva AND COALESCE(aplica_iva, true)
                                    THEN precio_unitario / 1.16 ELSE precio_unitario END)
                            * (1 - COALESCE(descuento_item, 0) / 100) AS b
              FROM compra_items WHERE compra_id = p_compra_id) l;
    v_bg := round(v_g, 2);
    v_be := round(v_e, 2);
    v_iva := round(v_bg * 0.16, 2);

    UPDATE compras SET
        base_gravada = v_bg, base_exenta = v_be, iva = v_iva,
        subtotal = v_bg + v_be, total = v_bg + v_be + v_iva,
        nro_doc_proveedor = btrim(p_nro), fecha_factura = p_fecha,
        fecha_vencimiento_pago = p_fecha + COALESCE(dias_credito, 0),
        estado_factura = 'registrada',
        factura_registrada_por = auth.uid(), factura_registrada_at = now(),
        motivo_diferencia_factura = COALESCE(NULLIF(btrim(p_motivo), ''), motivo_diferencia_factura)
     WHERE id = p_compra_id;

    RETURN jsonb_build_object(
        'total_anterior', v_c.total, 'total', v_bg + v_be + v_iva,
        'lineas_fuera_tolerancia', v_fuera);
END $function$;

COMMIT;
