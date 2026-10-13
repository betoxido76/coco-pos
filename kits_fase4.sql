-- Kits — Fase 4: armado rápido
-- docs/plan-kits.md. Crea la orden de producción YA CERRADA, su lote, los
-- consumos y los movimientos de inventario en UNA transacción: si un componente
-- PT no alcanza, no queda nada escrito. Deja los mismos rastros que el cierre
-- normal (origen produccion_consumo / produccion_cierre, nota "Orden OP-…").
--   p_items: [{ tipo_insumo, insumo_id, cantidad, almacen_id }]
-- MP y empaque admiten faltante (igual que el cierre normal); un PT no.
CREATE OR REPLACE FUNCTION armar_produccion(
    p_producto_id uuid, p_cantidad numeric, p_almacen_destino uuid, p_items jsonb,
    p_numero_lote text DEFAULT NULL, p_fecha_vencimiento date DEFAULT NULL, p_observaciones text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_empresa uuid := get_empresa_id();
    v_uid uuid := auth.uid();
    v_receta recetas%ROWTYPE;
    v_factor numeric;
    v_num text;
    v_orden uuid;
    v_lote uuid;
    v_lote_txt text := NULLIF(btrim(COALESCE(p_numero_lote, '')), '');
    v_items jsonb := '[]'::jsonb;
    v_tipo text;
    v_nombre text;
    v_sug numeric;
    r record;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Sesión no válida'; END IF;
    IF NOT (is_superadmin() OR EXISTS (SELECT 1 FROM usuario_modulos
            WHERE usuario_id = v_uid AND empresa_id = v_empresa AND modulo_id = 'produccion' AND activo)) THEN
        RAISE EXCEPTION 'Solo usuarios con el módulo Producción pueden armar';
    END IF;
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad a armar debe ser positiva'; END IF;
    IF NOT EXISTS (SELECT 1 FROM almacenes WHERE id = p_almacen_destino AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Elige el almacén al que entra el producto';
    END IF;
    SELECT * INTO v_receta FROM recetas
     WHERE producto_id = p_producto_id AND empresa_id = v_empresa AND activo
     ORDER BY created_at DESC LIMIT 1;
    IF v_receta.id IS NULL THEN RAISE EXCEPTION 'El producto no tiene una receta activa'; END IF;
    v_factor := p_cantidad / COALESCE(NULLIF(v_receta.rinde_unidades, 0), 1);

    v_num := obtener_siguiente_op_numero(v_empresa);

    INSERT INTO ordenes_produccion (
        numero_orden, numero_lote, producto_id, tipo_salida, receta_id,
        cantidad_planificada, cantidad_real, planificada_por, estado,
        fecha_planificada, fecha_inicio, fecha_fin, fecha_cierre, fecha_vencimiento_lote,
        observaciones, alerta_lote_vacio, usuario_id, usuario_cierre_id, empresa_id)
    VALUES (
        v_num, v_lote_txt, p_producto_id, 'producto_terminado', v_receta.id,
        p_cantidad, p_cantidad, 'salida', 'cerrada',
        (now() AT TIME ZONE 'America/Caracas')::date, now(), now(), now(), p_fecha_vencimiento,
        COALESCE(NULLIF(btrim(COALESCE(p_observaciones, '')), ''), 'Armado rápido'),
        v_lote_txt IS NULL, v_uid, v_uid, v_empresa)
    RETURNING id INTO v_orden;

    INSERT INTO lotes_produccion (orden_id, producto_id, usuario_id, numero_lote, cantidad_producida,
                                  fecha_produccion, fecha_vencimiento, observaciones, empresa_id)
    VALUES (v_orden, p_producto_id, v_uid, v_lote_txt, p_cantidad,
            (now() AT TIME ZONE 'America/Caracas')::date, p_fecha_vencimiento, p_observaciones, v_empresa)
    RETURNING id INTO v_lote;

    FOR r IN
        SELECT e->>'tipo_insumo' AS tipo, (e->>'insumo_id')::uuid AS id,
               (e->>'cantidad')::numeric AS cant, NULLIF(e->>'almacen_id', '')::uuid AS alm
          FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
    LOOP
        CONTINUE WHEN r.cant IS NULL OR r.cant <= 0 OR r.id IS NULL;
        v_tipo := CASE WHEN r.tipo = 'empaque' THEN 'material_empaque' ELSE r.tipo END;
        IF v_tipo NOT IN ('materia_prima', 'material_empaque', 'producto_terminado') THEN
            RAISE EXCEPTION 'Tipo de insumo inválido: %', r.tipo;
        END IF;
        IF v_tipo = 'producto_terminado' AND r.id = p_producto_id THEN
            RAISE EXCEPTION 'Un producto no puede consumirse a sí mismo';
        END IF;
        v_nombre := CASE v_tipo
            WHEN 'materia_prima' THEN (SELECT nombre FROM materias_primas WHERE id = r.id AND empresa_id = v_empresa)
            WHEN 'material_empaque' THEN (SELECT nombre FROM materiales_empaque WHERE id = r.id AND empresa_id = v_empresa)
            ELSE (SELECT nombre FROM productos_terminados WHERE id = r.id AND empresa_id = v_empresa) END;
        IF v_nombre IS NULL THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
        SELECT round(SUM(ri.cantidad) * v_factor, 4) INTO v_sug FROM receta_items ri
         WHERE ri.receta_id = v_receta.id AND ri.insumo_id = r.id
           AND (CASE WHEN ri.tipo_insumo = 'empaque' THEN 'material_empaque' ELSE ri.tipo_insumo END) = v_tipo;

        INSERT INTO lote_consumos (orden_id, lote_id, tipo_insumo, insumo_id, insumo_nombre,
                                   cantidad_sugerida, cantidad_consumida, empresa_id)
        VALUES (v_orden, v_lote, v_tipo, r.id, v_nombre, COALESCE(v_sug, r.cant), r.cant, v_empresa);

        v_items := v_items || jsonb_build_object('tipo_item', v_tipo, 'item_id', r.id, 'cantidad', r.cant,
            'almacen_id', r.alm, 'permitir_faltante', v_tipo <> 'producto_terminado');
    END LOOP;
    IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'Indica los insumos que se consumen'; END IF;

    PERFORM mover_stock_lote(v_items, 'salida', 'produccion_consumo', NULL, false, 'Orden ' || v_num, v_uid);
    PERFORM mover_stock('producto_terminado', p_producto_id, p_cantidad, 'entrada', 'produccion_cierre',
                        p_almacen_destino, false, 'Orden ' || v_num, v_uid);

    RETURN jsonb_build_object('orden_id', v_orden, 'numero_orden', v_num, 'lote_id', v_lote);
END $$;

REVOKE EXECUTE ON FUNCTION armar_produccion(uuid, numeric, uuid, jsonb, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION armar_produccion(uuid, numeric, uuid, jsonb, text, date, text) TO authenticated;
