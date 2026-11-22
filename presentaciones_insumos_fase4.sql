-- =============================================================================
-- Presentaciones de insumos — Fase 4: costo promedio y último costo
-- docs/plan-presentaciones-insumos.md (sección Costeo)
--
-- Solo MP, empaques y consumibles (los PT no cambian de costo por compras).
-- Con empresas.costeo_insumos = 'ultimo_precio' (default) costo_compra_promedio
-- NO se toca: solo se llenan costo_ultima_compra / fecha_ultima_compra.
--
-- 1. Kardex valorizado: trigger que llena movimientos_inventario.costo_unitario
--    con el costo vigente del ítem (sin tocar el motor mover_stock).
-- 2. registrar_recepcion: promedio móvil antes de la entrada (stock antes ≤ 0
--    → precio de la compra); la entrada del kardex queda al precio de compra.
-- 3. registrar_factura_recepcion: ajuste (real − estimado) × cantidad ÷ stock
--    actual (si stock > 0) y recálculo del último costo.
-- 4. anular_recepcion: la anulación pasa a una transacción (antes eran pasos
--    sueltos desde el navegador) y revierte el promedio con la fórmula inversa.
--    Aproximada si ya se consumió parte de lo recibido (limitación del plan).
-- Precio neto de una línea = precio base sin IVA × (1 − desc. línea) × (1 − desc. global).
-- =============================================================================

BEGIN;

-- ── Ayudantes ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._tabla_insumo_costo(p_tipo text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_tipo
        WHEN 'materia_prima' THEN 'materias_primas'  WHEN 'materias_primas' THEN 'materias_primas'
        WHEN 'material_empaque' THEN 'materiales_empaque' WHEN 'empaque' THEN 'materiales_empaque'
        WHEN 'materiales_empaque' THEN 'materiales_empaque'
        WHEN 'consumible' THEN 'consumibles' WHEN 'consumibles' THEN 'consumibles' END
$$;

CREATE OR REPLACE FUNCTION public._precio_neto_compra(p_precio numeric, p_incluye_iva boolean, p_aplica_iva boolean,
                                                      p_desc_item numeric, p_desc_global numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT (CASE WHEN p_incluye_iva AND COALESCE(p_aplica_iva, true) THEN p_precio / 1.16 ELSE p_precio END)
         * (1 - COALESCE(p_desc_item, 0) / 100) * (1 - COALESCE(p_desc_global, 0) / 100)
$$;

CREATE OR REPLACE FUNCTION public._costeo_promedio(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT costeo_insumos = 'promedio_ponderado' FROM empresas WHERE id = p_empresa), false)
$$;

-- Entrada por compra: promedio móvil (si la empresa lo usa) + último costo
CREATE OR REPLACE FUNCTION public._costo_entrada(p_empresa uuid, p_tipo text, p_item uuid,
                                                 p_cant numeric, p_valor numeric, p_fecha date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_tabla text := _tabla_insumo_costo(p_tipo);
    v_s numeric; v_c numeric; v_f date; v_unit numeric; v_nuevo numeric;
BEGIN
    IF v_tabla IS NULL OR p_cant IS NULL OR p_cant <= 0 THEN RETURN; END IF;
    EXECUTE format('SELECT stock_actual, costo_compra_promedio, fecha_ultima_compra FROM %I WHERE id = $1 AND empresa_id = $2 FOR UPDATE', v_tabla)
        INTO v_s, v_c, v_f USING p_item, p_empresa;
    v_unit := round(p_valor / p_cant, 8);
    v_nuevo := v_c;
    IF _costeo_promedio(p_empresa) THEN
        v_nuevo := CASE WHEN COALESCE(v_s, 0) <= 0 OR v_c IS NULL THEN v_unit
                        ELSE round((v_s * v_c + p_valor) / (v_s + p_cant), 8) END;
    END IF;
    EXECUTE format('UPDATE %I SET costo_compra_promedio = $1,
                        costo_ultima_compra = CASE WHEN fecha_ultima_compra IS NULL OR fecha_ultima_compra <= $2 THEN $3 ELSE costo_ultima_compra END,
                        fecha_ultima_compra = GREATEST(COALESCE(fecha_ultima_compra, $2), $2)
                     WHERE id = $4 AND empresa_id = $5', v_tabla)
        USING v_nuevo, p_fecha, v_unit, p_item, p_empresa;
END $$;

-- Factura con otro precio: el valor de más (o de menos) se reparte en el stock actual
CREATE OR REPLACE FUNCTION public._costo_ajuste_factura(p_empresa uuid, p_tipo text, p_item uuid, p_delta numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_tabla text := _tabla_insumo_costo(p_tipo);
    v_s numeric; v_c numeric;
BEGIN
    IF v_tabla IS NULL OR COALESCE(p_delta, 0) = 0 OR NOT _costeo_promedio(p_empresa) THEN RETURN; END IF;
    EXECUTE format('SELECT stock_actual, costo_compra_promedio FROM %I WHERE id = $1 AND empresa_id = $2 FOR UPDATE', v_tabla)
        INTO v_s, v_c USING p_item, p_empresa;
    IF COALESCE(v_s, 0) <= 0 OR v_c IS NULL THEN RETURN; END IF;
    EXECUTE format('UPDATE %I SET costo_compra_promedio = $1 WHERE id = $2 AND empresa_id = $3', v_tabla)
        USING GREATEST(0, round(v_c + p_delta / v_s, 8)), p_item, p_empresa;
END $$;

-- Anulación: fórmula inversa con el stock ANTES de la salida
CREATE OR REPLACE FUNCTION public._costo_reversa(p_empresa uuid, p_tipo text, p_item uuid, p_cant numeric, p_valor numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_tabla text := _tabla_insumo_costo(p_tipo);
    v_s numeric; v_c numeric;
BEGIN
    IF v_tabla IS NULL OR p_cant IS NULL OR p_cant <= 0 OR NOT _costeo_promedio(p_empresa) THEN RETURN; END IF;
    EXECUTE format('SELECT stock_actual, costo_compra_promedio FROM %I WHERE id = $1 AND empresa_id = $2 FOR UPDATE', v_tabla)
        INTO v_s, v_c USING p_item, p_empresa;
    IF v_c IS NULL OR COALESCE(v_s, 0) - p_cant <= 0 THEN RETURN; END IF;
    EXECUTE format('UPDATE %I SET costo_compra_promedio = $1 WHERE id = $2 AND empresa_id = $3', v_tabla)
        USING GREATEST(0, round((v_s * v_c - p_valor) / (v_s - p_cant), 8)), p_item, p_empresa;
END $$;

-- Último costo = precio neto de la compra vigente más reciente con ese insumo
CREATE OR REPLACE FUNCTION public._ultima_compra_recalcular(p_empresa uuid, p_tipo text, p_item uuid, p_excluir uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_tabla text := _tabla_insumo_costo(p_tipo);
    v_costo numeric; v_fecha date;
BEGIN
    IF v_tabla IS NULL THEN RETURN; END IF;
    WITH ult AS (
        SELECT c.id, c.fecha_compra, c.descuento_global FROM compras c
          JOIN compra_items ci ON ci.compra_id = c.id
         WHERE c.empresa_id = p_empresa AND ci.insumo_id = p_item AND ci.cantidad > 0
           AND c.id IS DISTINCT FROM p_excluir AND COALESCE(c.estado, '') <> 'anulada'
         ORDER BY c.fecha_compra DESC LIMIT 1)
    SELECT round(sum(ci.cantidad * _precio_neto_compra(ci.precio_unitario, ci.precio_incluye_iva, ci.aplica_iva,
                                                       ci.descuento_item, ult.descuento_global)) / sum(ci.cantidad), 8),
           (ult.fecha_compra AT TIME ZONE 'America/Caracas')::date
      INTO v_costo, v_fecha
      FROM ult JOIN compra_items ci ON ci.compra_id = ult.id AND ci.insumo_id = p_item AND ci.cantidad > 0
     GROUP BY ult.fecha_compra;
    EXECUTE format('UPDATE %I SET costo_ultima_compra = $1, fecha_ultima_compra = $2 WHERE id = $3 AND empresa_id = $4', v_tabla)
        USING v_costo, v_fecha, p_item, p_empresa;
END $$;

REVOKE ALL ON FUNCTION public._costo_entrada(uuid, text, uuid, numeric, numeric, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._costo_ajuste_factura(uuid, text, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._costo_reversa(uuid, text, uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ultima_compra_recalcular(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 1. Kardex valorizado ─────────────────────────────────────────────────────
-- SECURITY DEFINER: Inventario.jsx todavía inserta movimientos directo como
-- authenticated, que no puede ejecutar _item_inventario
CREATE OR REPLACE FUNCTION public._movimiento_costo_unitario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    IF NEW.costo_unitario IS NULL THEN
        NEW.costo_unitario := (SELECT costo FROM _item_inventario(NEW.empresa_id,
            CASE NEW.tipo_item
                WHEN 'materias_primas' THEN 'materia_prima' WHEN 'materiales_empaque' THEN 'material_empaque'
                WHEN 'consumibles' THEN 'consumible' WHEN 'productos_terminados' THEN 'producto_terminado'
                ELSE NEW.tipo_item END,
            NEW.item_id) LIMIT 1);
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS movimientos_costo_unitario ON public.movimientos_inventario;
CREATE TRIGGER movimientos_costo_unitario BEFORE INSERT ON public.movimientos_inventario
    FOR EACH ROW EXECUTE FUNCTION public._movimiento_costo_unitario();

-- ── 2. registrar_recepcion (fase 3 + cambios [COSTO]) ────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_recepcion(p_compra jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    v_costos   jsonb := '[]'::jsonb;                                    -- [COSTO]
    v_hoy      date := (now() AT TIME ZONE 'America/Caracas')::date;    -- [COSTO]
    r          record;                                                  -- [COSTO]
    v_oci      uuid;
    v_sol      numeric;
    v_rec      numeric;
BEGIN
    IF v_empresa IS NULL THEN RAISE EXCEPTION 'Sesión sin empresa'; END IF;
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
        -- [COSTO] valor neto de la línea (sin IVA, con descuentos)
        v_costos := v_costos || jsonb_build_object('tipo', v_tipo, 'id', v_ci.insumo_id, 'cant', v_ci.cantidad,
            'valor', v_ci.cantidad * _precio_neto_compra(v_ci.precio_unitario, v_ci.precio_incluye_iva, v_ci.aplica_iva,
                                                         v_ci.descuento_item, v_compra.descuento_global));

        -- Avance de la OC, en unidad base (aunque se haya recibido en otra presentación)
        v_oci := NULLIF(x->>'orden_item_id', '')::uuid;
        IF v_oci IS NOT NULL THEN
            IF v_oc_id IS NULL THEN RAISE EXCEPTION 'Línea de OC en una recepción sin OC'; END IF;
            UPDATE orden_compra_items SET cantidad_recibida = COALESCE(cantidad_recibida, 0) + v_ci.cantidad
             WHERE id = v_oci AND orden_id = v_oc_id AND insumo_id = v_ci.insumo_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'Una línea no corresponde a la orden de compra (otra orden u otro insumo)'; END IF;
        END IF;
    END LOOP;

    -- [COSTO] Promedio con el stock ANTES de la entrada, un cálculo por insumo
    FOR r IN SELECT t.tipo, t.id, sum(t.cant) AS cant, sum(t.valor) AS valor
               FROM jsonb_to_recordset(v_costos) AS t(tipo text, id uuid, cant numeric, valor numeric)
              GROUP BY t.tipo, t.id LOOP
        PERFORM _costo_entrada(v_empresa, r.tipo, r.id, r.cant, r.valor, v_hoy);
    END LOOP;

    -- Entrada al inventario por el motor (los 4 pasos por ítem)
    PERFORM mover_stock_lote(v_stock, 'entrada', 'recepcion_compra', v_almacen, false,
                             'Recepción ' || v_numero, auth.uid(), now());

    -- [COSTO] Kardex: la entrada vale lo que costó (no el promedio resultante)
    FOR r IN SELECT t.id, sum(t.cant) AS cant, sum(t.valor) AS valor
               FROM jsonb_to_recordset(v_costos) AS t(tipo text, id uuid, cant numeric, valor numeric)
              GROUP BY t.id LOOP
        UPDATE movimientos_inventario SET costo_unitario = round(r.valor / r.cant, 8)
         WHERE empresa_id = v_empresa AND origen = 'recepcion_compra'
           AND notas = 'Recepción ' || v_numero AND item_id = r.id;
    END LOOP;

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

-- ── 3. registrar_factura_recepcion (fase 3 + cambios [COSTO]) ────────────────
CREATE OR REPLACE FUNCTION public.registrar_factura_recepcion(p_compra_id uuid, p_nro text, p_fecha date, p_items jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    v_aj jsonb := '[]'::jsonb;   -- [COSTO]
    r record;                    -- [COSTO]
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
               (x->>'precio_presentacion')::numeric AS precio_pres_nuevo
          FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) x
          LEFT JOIN compra_items ci ON ci.id = (x->>'id')::uuid AND ci.compra_id = p_compra_id
    LOOP
        IF v_it.id IS NULL THEN RAISE EXCEPTION 'Una línea no pertenece a la recepción'; END IF;
        -- Línea con presentación: manda el precio por presentación
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

        -- [COSTO] diferencia de valor neto entre lo que entró y lo facturado
        v_aj := v_aj || jsonb_build_object('tipo', v_it.tipo_insumo, 'id', v_it.insumo_id, 'delta',
            v_it.cantidad * (_precio_neto_compra(v_nuevo, false, v_it.aplica_iva, v_it.descuento_item, v_c.descuento_global)
                           - _precio_neto_compra(v_it.precio_unitario, v_it.precio_incluye_iva, v_it.aplica_iva,
                                                 v_it.descuento_item, v_c.descuento_global)));

        UPDATE compra_items SET
            precio_recepcion = v_ref,
            precio_unitario = v_nuevo,
            precio_presentacion = COALESCE(v_pp, precio_presentacion),
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

    -- [COSTO] ajuste del promedio y del último costo, un cálculo por insumo
    FOR r IN SELECT t.tipo, t.id, sum(t.delta) AS delta
               FROM jsonb_to_recordset(v_aj) AS t(tipo text, id uuid, delta numeric)
              GROUP BY t.tipo, t.id LOOP
        PERFORM _costo_ajuste_factura(v_c.empresa_id, r.tipo, r.id, r.delta);
        PERFORM _ultima_compra_recalcular(v_c.empresa_id, r.tipo, r.id, NULL);
    END LOOP;

    RETURN jsonb_build_object(
        'total_anterior', v_c.total, 'total', v_bg + v_be + v_iva,
        'lineas_fuera_tolerancia', v_fuera);
END $function$;

-- ── 4. anular_recepcion ──────────────────────────────────────────────────────
-- Mismas reglas que tenía la pantalla (Compras → Ver recepción → Anular):
-- admin/finanzas, con almacén, sin pagos; revierte stock, OC y costo.
CREATE OR REPLACE FUNCTION public.anular_recepcion(p_compra_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_c      compras%ROWTYPE;
    v_rol    text;
    v_items  jsonb := '[]'::jsonb;
    v_costos jsonb := '[]'::jsonb;
    v_tipo   text;
    v_notas  text;
    ci       record;
    r        record;
    v_oci    uuid;
    v_sol    numeric;
    v_rec    numeric;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Ingresa el motivo de la anulación'; END IF;
    SELECT * INTO v_c FROM compras WHERE id = p_compra_id FOR UPDATE;
    IF v_c.id IS NULL OR (v_c.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Recepción no encontrada';
    END IF;
    SELECT rol INTO v_rol FROM usuarios WHERE id = auth.uid();
    IF NOT (is_superadmin() OR v_rol IN ('admin', 'finanzas')) THEN
        RAISE EXCEPTION 'No tienes permisos para anular recepciones';
    END IF;
    IF v_c.estado = 'anulada' OR v_c.estado_cobro = 'anulado' THEN
        RAISE EXCEPTION 'Esta recepción ya está anulada';
    END IF;
    IF v_c.almacen_id IS NULL THEN
        RAISE EXCEPTION 'Recepción anterior a esta función (sin almacén registrado). Corrígela con una Nota de Débito al proveedor.';
    END IF;
    IF COALESCE(v_c.estado_cobro, 'pendiente') <> 'pendiente'
       OR EXISTS (SELECT 1 FROM pagos_proveedor WHERE compra_id = p_compra_id AND NOT anulado) THEN
        RAISE EXCEPTION 'No se puede anular: la recepción tiene pagos registrados. Usa una Nota de Débito al proveedor.';
    END IF;

    FOR ci IN SELECT * FROM compra_items WHERE compra_id = p_compra_id LOOP
        v_tipo := CASE ci.tipo_insumo
            WHEN 'materia_prima' THEN 'materia_prima' WHEN 'empaque' THEN 'material_empaque'
            WHEN 'material_empaque' THEN 'material_empaque' WHEN 'consumible' THEN 'consumible'
            WHEN 'producto_terminado' THEN 'producto_terminado' END;
        IF v_tipo IS NULL THEN RAISE EXCEPTION 'Hay ítems con un tipo de insumo desconocido en esta recepción.'; END IF;
        CONTINUE WHEN COALESCE(ci.cantidad, 0) <= 0;
        v_items := v_items || jsonb_build_object('tipo_item', v_tipo, 'item_id', ci.insumo_id, 'cantidad', ci.cantidad);
        v_costos := v_costos || jsonb_build_object('tipo', v_tipo, 'id', ci.insumo_id, 'cant', ci.cantidad,
            'valor', ci.cantidad * _precio_neto_compra(ci.precio_unitario, ci.precio_incluye_iva, ci.aplica_iva,
                                                       ci.descuento_item, v_c.descuento_global));
    END LOOP;
    IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'No se encontraron items de la recepción'; END IF;

    -- Costo: fórmula inversa con el stock antes de la salida
    FOR r IN SELECT t.tipo, t.id, sum(t.cant) AS cant, sum(t.valor) AS valor
               FROM jsonb_to_recordset(v_costos) AS t(tipo text, id uuid, cant numeric, valor numeric)
              GROUP BY t.tipo, t.id LOOP
        PERFORM _costo_reversa(v_c.empresa_id, r.tipo, r.id, r.cant, r.valor);
    END LOOP;

    -- Salida del almacén donde entró: si a un insumo no le alcanza, no se revierte nada
    v_notas := 'Anulación ' || v_c.numero_doc || ' · ' || btrim(p_motivo);
    PERFORM mover_stock_lote(v_items, 'salida', 'anulacion_recepcion', v_c.almacen_id, false,
                             v_notas, auth.uid(), now());
    FOR r IN SELECT t.id, sum(t.cant) AS cant, sum(t.valor) AS valor
               FROM jsonb_to_recordset(v_costos) AS t(tipo text, id uuid, cant numeric, valor numeric)
              GROUP BY t.id LOOP
        UPDATE movimientos_inventario SET costo_unitario = round(r.valor / r.cant, 8)
         WHERE empresa_id = v_c.empresa_id AND origen = 'anulacion_recepcion' AND notas = v_notas AND item_id = r.id;
    END LOOP;

    -- OC vinculada: devolver lo recibido (match por insumo + tipo, como la pantalla)
    IF v_c.orden_compra_id IS NOT NULL THEN
        FOR ci IN SELECT insumo_id, tipo_insumo, sum(cantidad) AS cantidad FROM compra_items
                   WHERE compra_id = p_compra_id GROUP BY insumo_id, tipo_insumo LOOP
            SELECT id INTO v_oci FROM orden_compra_items
             WHERE orden_id = v_c.orden_compra_id AND insumo_id = ci.insumo_id AND tipo_insumo = ci.tipo_insumo
             ORDER BY id LIMIT 1;
            IF v_oci IS NOT NULL THEN
                UPDATE orden_compra_items SET cantidad_recibida = GREATEST(0, COALESCE(cantidad_recibida, 0) - ci.cantidad)
                 WHERE id = v_oci;
            END IF;
        END LOOP;
        SELECT COALESCE(SUM(cantidad_solicitada), 0), COALESCE(SUM(cantidad_recibida), 0)
          INTO v_sol, v_rec FROM orden_compra_items WHERE orden_id = v_c.orden_compra_id;
        UPDATE ordenes_compra SET estado = CASE WHEN v_rec <= 0 THEN 'aprobada'
                                                WHEN v_rec >= v_sol THEN 'recibida_total' ELSE 'recibida_parcial' END
         WHERE id = v_c.orden_compra_id;
    END IF;

    UPDATE compras SET estado = 'anulada', estado_cobro = 'anulado',
        motivo_anulacion = btrim(p_motivo), anulada_por = auth.uid(), fecha_anulacion = now()
     WHERE id = p_compra_id;

    -- Último costo: la compra vigente anterior (ya sin esta)
    FOR r IN SELECT DISTINCT t.tipo, t.id FROM jsonb_to_recordset(v_costos) AS t(tipo text, id uuid) LOOP
        PERFORM _ultima_compra_recalcular(v_c.empresa_id, r.tipo, r.id, p_compra_id);
    END LOOP;

    RETURN jsonb_build_object('numero_doc', v_c.numero_doc, 'fecha_anulacion', now());
END $function$;

REVOKE ALL ON FUNCTION public.anular_recepcion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_recepcion(uuid, text) TO authenticated, service_role;

COMMIT;
