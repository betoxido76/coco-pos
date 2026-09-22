-- ═══════════════════════════════════════════════════════════════════════════
-- MOTOR ÚNICO DE MOVIMIENTOS DE INVENTARIO — Fase 2a
--
-- Por qué en Postgres y no en JavaScript: el invariante de 4 pasos
-- (CLAUDE.md §15) son hoy 4 llamadas HTTP sueltas desde el navegador. Si la
-- conexión se corta entre la segunda y la tercera, el stock queda a medias y
-- nadie se entera — que es exactamente el modo de falla que produjo el
-- descuadre de 12.845 unidades en Grupo Meraki.
--
-- Aquí los 4 pasos son UNA transacción: o pasan todos o no pasa ninguno.
-- Además toma un lock sobre la fila del producto (FOR UPDATE), así dos
-- facturaciones simultáneas del mismo SKU dejan de pisarse.
--
-- Esta migración es ADITIVA: crea la función y no la usa nadie todavía.
-- Aplicarla no cambia el comportamiento del sistema. Las pantallas se migran
-- en la fase 2b.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mover_stock(
    p_tipo_item          text,      -- producto_terminado | materia_prima | material_empaque | consumible
    p_item_id            uuid,
    p_cantidad           numeric,   -- SIEMPRE positiva; el sentido lo da p_tipo_movimiento
    p_tipo_movimiento    text,      -- entrada | salida
    p_origen             text,      -- recepcion_compra, pedido_facturado, merma, ...
    p_almacen_id         uuid    DEFAULT NULL,
    p_permitir_faltante  boolean DEFAULT false,
    p_notas              text    DEFAULT NULL,
    p_usuario_id         uuid    DEFAULT NULL,
    p_fecha              timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tabla       text;
    v_col_codigo  text;
    v_empresa     uuid;
    v_nombre      text;
    v_codigo      text;
    v_tipo_prod   text;
    v_stock_ant   numeric;
    v_corriente   numeric;
    v_restante    numeric;
    v_desc        numeric;
    v_su_id       uuid;
    v_su_cant     numeric;
    v_movs        int := 0;
    r             RECORD;
BEGIN
    -- ── Validación de argumentos ───────────────────────────────────────────
    IF p_tipo_item NOT IN ('producto_terminado','materia_prima','material_empaque','consumible') THEN
        RAISE EXCEPTION 'tipo_item invalido: %', p_tipo_item;
    END IF;
    IF p_tipo_movimiento NOT IN ('entrada','salida') THEN
        RAISE EXCEPTION 'tipo_movimiento invalido: %', p_tipo_movimiento;
    END IF;
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser positiva (recibido: %)', p_cantidad;
    END IF;
    IF p_origen IS NULL OR btrim(p_origen) = '' THEN
        RAISE EXCEPTION 'El origen del movimiento es obligatorio';
    END IF;

    v_tabla := CASE p_tipo_item
        WHEN 'producto_terminado' THEN 'productos_terminados'
        WHEN 'materia_prima'      THEN 'materias_primas'
        WHEN 'material_empaque'   THEN 'materiales_empaque'
        WHEN 'consumible'         THEN 'consumibles' END;
    v_col_codigo := CASE WHEN p_tipo_item = 'producto_terminado' THEN 'sku' ELSE 'codigo' END;

    -- ── Leer el ítem Y BLOQUEAR la fila (paso 1 del invariante) ────────────
    -- El FOR UPDATE serializa dos movimientos simultáneos del mismo ítem.
    EXECUTE format(
        'SELECT empresa_id, nombre, %I, stock_actual, %s FROM %I WHERE id = $1 FOR UPDATE',
        v_col_codigo,
        CASE WHEN p_tipo_item = 'producto_terminado' THEN 'tipo_producto' ELSE 'NULL::text' END,
        v_tabla)
    INTO v_empresa, v_nombre, v_codigo, v_stock_ant, v_tipo_prod
    USING p_item_id;

    IF v_empresa IS NULL THEN
        RAISE EXCEPTION 'Item % no encontrado en %', p_item_id, v_tabla;
    END IF;
    IF v_empresa <> get_empresa_id() AND NOT is_superadmin() THEN
        RAISE EXCEPTION 'No autorizado sobre este item';
    END IF;

    -- Un servicio no lleva inventario: reponerle o descontarle stock genera
    -- existencias fantasma. Mismo criterio que anular_nota_no_despachada.
    IF COALESCE(v_tipo_prod, '') = 'servicio' THEN
        RETURN jsonb_build_object('omitido', true, 'motivo', 'servicio');
    END IF;

    v_stock_ant := COALESCE(v_stock_ant, 0);

    -- ═══════════════════════════════════════════════════════════════════════
    -- ENTRADA — suma al almacén indicado (obligatorio)
    -- ═══════════════════════════════════════════════════════════════════════
    IF p_tipo_movimiento = 'entrada' THEN
        IF p_almacen_id IS NULL THEN
            RAISE EXCEPTION 'Una entrada necesita almacen de destino';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM almacenes WHERE id = p_almacen_id AND empresa_id = v_empresa) THEN
            RAISE EXCEPTION 'Almacen destino invalido para esta empresa';
        END IF;

        -- Paso 2: stock del catálogo
        EXECUTE format('UPDATE %I SET stock_actual = $1 WHERE id = $2', v_tabla)
        USING v_stock_ant + p_cantidad, p_item_id;

        -- Paso 3: stock_ubicacion — SELECT + UPDATE, o INSERT si no existe.
        -- Nunca UPSERT con ON CONFLICT: no dispara con almacen_ubicacion_id NULL.
        SELECT id, cantidad INTO v_su_id, v_su_cant
        FROM stock_ubicacion
        WHERE empresa_id = v_empresa AND almacen_id = p_almacen_id
          AND tipo_item = p_tipo_item AND item_id = p_item_id
          AND almacen_ubicacion_id IS NULL
        FOR UPDATE;

        IF v_su_id IS NOT NULL THEN
            UPDATE stock_ubicacion
               SET cantidad = v_su_cant + p_cantidad, updated_at = now()
             WHERE id = v_su_id;
        ELSE
            INSERT INTO stock_ubicacion (empresa_id, almacen_id, almacen_ubicacion_id,
                                         tipo_item, item_id, cantidad, updated_at)
            VALUES (v_empresa, p_almacen_id, NULL, p_tipo_item, p_item_id, p_cantidad, now());
        END IF;

        -- Paso 4: el movimiento
        INSERT INTO movimientos_inventario (
            empresa_id, tipo_item, item_id, item_nombre, item_codigo,
            tipo_movimiento, cantidad, stock_anterior, stock_actual,
            almacen_id, origen, notas, usuario_id, fecha)
        VALUES (
            v_empresa, p_tipo_item, p_item_id, v_nombre, COALESCE(v_codigo, ''),
            'entrada', p_cantidad, v_stock_ant, v_stock_ant + p_cantidad,
            p_almacen_id, p_origen, p_notas, p_usuario_id, p_fecha);

        RETURN jsonb_build_object(
            'stock_anterior', v_stock_ant, 'stock_actual', v_stock_ant + p_cantidad,
            'movimientos', 1, 'faltante', 0);
    END IF;

    -- ═══════════════════════════════════════════════════════════════════════
    -- SALIDA — descuenta del almacén indicado; sin almacén, del que más tenga
    -- ═══════════════════════════════════════════════════════════════════════
    -- Paso 2: stock del catálogo. Sin clamp a 0: un stock negativo es la única
    -- señal visible de que se despachó más de lo que había.
    EXECUTE format('UPDATE %I SET stock_actual = $1 WHERE id = $2', v_tabla)
    USING v_stock_ant - p_cantidad, p_item_id;

    v_restante  := p_cantidad;
    v_corriente := v_stock_ant;

    -- Paso 3 + 4: repartir el descuento entre las filas disponibles y emitir un
    -- movimiento POR ALMACÉN TOCADO. Con un solo movimiento para varios
    -- almacenes, el almacen_id mentiría.
    FOR r IN
        SELECT id, cantidad, almacen_id, almacen_ubicacion_id
        FROM stock_ubicacion
        WHERE empresa_id = v_empresa
          AND tipo_item = p_tipo_item AND item_id = p_item_id
          AND cantidad > 0
          AND (p_almacen_id IS NULL OR almacen_id = p_almacen_id)
        ORDER BY (almacen_id = p_almacen_id) DESC NULLS LAST,  -- el pedido primero
                 almacen_ubicacion_id ASC NULLS FIRST,          -- suelto antes que ubicado
                 cantidad DESC
        FOR UPDATE
    LOOP
        EXIT WHEN v_restante <= 0;
        v_desc := LEAST(v_restante, r.cantidad);

        UPDATE stock_ubicacion
           SET cantidad = r.cantidad - v_desc, updated_at = now()
         WHERE id = r.id;

        INSERT INTO movimientos_inventario (
            empresa_id, tipo_item, item_id, item_nombre, item_codigo,
            tipo_movimiento, cantidad, stock_anterior, stock_actual,
            almacen_id, almacen_ubicacion_id, origen, notas, usuario_id, fecha)
        VALUES (
            v_empresa, p_tipo_item, p_item_id, v_nombre, COALESCE(v_codigo, ''),
            'salida', v_desc, v_corriente, v_corriente - v_desc,
            r.almacen_id, r.almacen_ubicacion_id, p_origen, p_notas, p_usuario_id, p_fecha);

        v_restante  := v_restante - v_desc;
        v_corriente := v_corriente - v_desc;
        v_movs      := v_movs + 1;
    END LOOP;

    -- ── Los almacenes no cubrían la cantidad ───────────────────────────────
    IF v_restante > 0.001 THEN
        IF NOT p_permitir_faltante THEN
            -- Aborta TODO: el UPDATE del catálogo y los movimientos ya hechos
            -- se deshacen solos, porque esto es una sola transacción.
            RAISE EXCEPTION
                'Stock insuficiente de % (%): faltan % unidades en %',
                v_nombre, COALESCE(v_codigo, 's/c'), v_restante,
                COALESCE((SELECT nombre FROM almacenes WHERE id = p_almacen_id), 'los almacenes');
        END IF;

        -- Autorizado por quien opera: se registra el faltante sin almacén, para
        -- que la suma de movimientos cuadre con lo despachado y el hueco quede
        -- visible en vez de desaparecer.
        INSERT INTO movimientos_inventario (
            empresa_id, tipo_item, item_id, item_nombre, item_codigo,
            tipo_movimiento, cantidad, stock_anterior, stock_actual,
            almacen_id, origen, notas, usuario_id, fecha)
        VALUES (
            v_empresa, p_tipo_item, p_item_id, v_nombre, COALESCE(v_codigo, ''),
            'salida', v_restante, v_corriente, v_corriente - v_restante,
            NULL, p_origen,
            COALESCE(p_notas || ' · ', '') ||
            'Sin existencias suficientes en almacenes: salida no atribuida a ninguna ubicacion',
            p_usuario_id, p_fecha);
        v_movs := v_movs + 1;
    END IF;

    RETURN jsonb_build_object(
        'stock_anterior', v_stock_ant,
        'stock_actual',   v_stock_ant - p_cantidad,
        'movimientos',    v_movs,
        'faltante',       GREATEST(v_restante, 0));
END $$;

GRANT EXECUTE ON FUNCTION mover_stock(text, uuid, numeric, text, text, uuid, boolean, text, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION mover_stock IS
'Motor unico de movimientos de inventario. Ejecuta el invariante de 4 pasos
(CLAUDE.md §15) en una sola transaccion, con lock sobre la fila del item.
Devuelve jsonb con stock_anterior, stock_actual, movimientos emitidos y faltante.
Lanza excepcion si el stock no alcanza, salvo p_permitir_faltante := true.';
