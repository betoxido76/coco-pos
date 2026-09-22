-- ═══════════════════════════════════════════════════════════════════════════
-- MOTOR DE INVENTARIO — Fase 2b: lote y verificación previa
--
-- `mover_stock` (fase 2a) hace atómico el movimiento de UN ítem. Pero una
-- factura mueve varios, y hoy cada uno va en su propia llamada: si el tercero
-- de cinco falla, los dos primeros ya salieron del inventario y no hay vuelta
-- atrás. Estas dos funciones cierran ese hueco.
--
--   verificar_stock()   lectura pura — dice qué falta ANTES de mover nada,
--                       para que la pantalla pueda preguntarle al usuario.
--   mover_stock_lote()  mueve todos los items en UNA transaccion: o salen
--                       todos o no sale ninguno.
--
-- Aditiva: nada las invoca todavia.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- verificar_stock — ¿alcanza el stock para estos items?
--
-- p_items: [{"tipo_item":"producto_terminado","item_id":"uuid","cantidad":10}, ...]
-- Devuelve SOLO los items que no alcanzan, con cuanto falta. [] = todo bien.
-- No escribe nada.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verificar_stock(
    p_items      jsonb,
    p_almacen_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresa    uuid;
    v_faltantes  jsonb := '[]'::jsonb;
    v_disponible numeric;
    v_nombre     text;
    v_codigo     text;
    v_es_serv    boolean;
    r            RECORD;
BEGIN
    FOR r IN
        SELECT (e->>'tipo_item')          AS tipo_item,
               (e->>'item_id')::uuid      AS item_id,
               (e->>'cantidad')::numeric  AS cantidad
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
    LOOP
        CONTINUE WHEN r.cantidad IS NULL OR r.cantidad <= 0;

        -- La empresa se deriva del propio item, igual que en mover_stock. Con
        -- get_empresa_id() un llamador sin contexto de sesion veia disponible = 0
        -- en todo, y el superadmin no podia verificar stock de otras empresas.
        v_empresa := NULL;
        v_es_serv := false;
        IF r.tipo_item = 'producto_terminado' THEN
            SELECT empresa_id, COALESCE(tipo_producto,'') = 'servicio', nombre, sku
              INTO v_empresa, v_es_serv, v_nombre, v_codigo
            FROM productos_terminados WHERE id = r.item_id;
        ELSIF r.tipo_item = 'materia_prima' THEN
            SELECT empresa_id, nombre, codigo INTO v_empresa, v_nombre, v_codigo
            FROM materias_primas WHERE id = r.item_id;
        ELSIF r.tipo_item = 'material_empaque' THEN
            SELECT empresa_id, nombre, codigo INTO v_empresa, v_nombre, v_codigo
            FROM materiales_empaque WHERE id = r.item_id;
        ELSIF r.tipo_item = 'consumible' THEN
            SELECT empresa_id, nombre, codigo INTO v_empresa, v_nombre, v_codigo
            FROM consumibles WHERE id = r.item_id;
        ELSE
            CONTINUE;
        END IF;

        CONTINUE WHEN v_empresa IS NULL;
        IF v_empresa <> get_empresa_id() AND NOT is_superadmin() THEN
            RAISE EXCEPTION 'No autorizado sobre este item';
        END IF;
        -- Los servicios no llevan inventario: nunca faltan
        CONTINUE WHEN COALESCE(v_es_serv, false);

        -- Disponible = lo que hay EN ALMACENES, que es de donde descuenta
        -- mover_stock. No se usa stock_actual: puede estar desviado, y es
        -- justamente el numero que no queremos creerle.
        SELECT COALESCE(sum(cantidad), 0) INTO v_disponible
        FROM stock_ubicacion
        WHERE empresa_id = v_empresa
          AND tipo_item = r.tipo_item AND item_id = r.item_id
          AND cantidad > 0
          AND (p_almacen_id IS NULL OR almacen_id = p_almacen_id);

        IF v_disponible < r.cantidad - 0.001 THEN
            v_faltantes := v_faltantes || jsonb_build_object(
                'tipo_item',  r.tipo_item,
                'item_id',    r.item_id,
                'nombre',     COALESCE(v_nombre, '(sin nombre)'),
                'codigo',     COALESCE(v_codigo, ''),
                'requerido',  r.cantidad,
                'disponible', v_disponible,
                'faltante',   r.cantidad - v_disponible);
        END IF;
    END LOOP;

    RETURN v_faltantes;
END $$;

GRANT EXECUTE ON FUNCTION verificar_stock(jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION verificar_stock IS
'Lectura pura: devuelve los items cuyo stock EN ALMACENES no cubre la cantidad
pedida, con cuanto falta. [] significa que alcanza para todos. Se usa antes de
mover_stock_lote para poder avisarle al usuario.';


-- ───────────────────────────────────────────────────────────────────────────
-- mover_stock_lote — todos los items en UNA transaccion
--
-- Una funcion plpgsql corre dentro de una sola transaccion: si el item 3 de 5
-- lanza excepcion, los 2 primeros se deshacen solos. Eso es lo que hoy no
-- pasa, porque cada item va en su propia llamada HTTP.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mover_stock_lote(
    p_items             jsonb,
    p_tipo_movimiento   text,
    p_origen            text,
    p_almacen_id        uuid    DEFAULT NULL,
    p_permitir_faltante boolean DEFAULT false,
    p_notas             text    DEFAULT NULL,
    p_usuario_id        uuid    DEFAULT NULL,
    p_fecha             timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_res        jsonb;
    v_resultados jsonb := '[]'::jsonb;
    v_movs       int := 0;
    v_faltante   numeric := 0;
    r            RECORD;
BEGIN
    FOR r IN
        SELECT (e->>'tipo_item')          AS tipo_item,
               (e->>'item_id')::uuid      AS item_id,
               (e->>'cantidad')::numeric  AS cantidad,
               (e->>'almacen_id')         AS almacen_id  -- opcional por item
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
    LOOP
        CONTINUE WHEN r.cantidad IS NULL OR r.cantidad <= 0;

        v_res := mover_stock(
            r.tipo_item, r.item_id, r.cantidad, p_tipo_movimiento, p_origen,
            COALESCE(NULLIF(r.almacen_id, '')::uuid, p_almacen_id),
            p_permitir_faltante, p_notas, p_usuario_id, p_fecha);

        v_resultados := v_resultados || jsonb_build_object('item_id', r.item_id, 'resultado', v_res);
        v_movs     := v_movs + COALESCE((v_res->>'movimientos')::int, 0);
        v_faltante := v_faltante + COALESCE((v_res->>'faltante')::numeric, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'items',       jsonb_array_length(v_resultados),
        'movimientos', v_movs,
        'faltante',    v_faltante,
        'detalle',     v_resultados);
END $$;

GRANT EXECUTE ON FUNCTION mover_stock_lote(jsonb, text, text, uuid, boolean, text, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION mover_stock_lote IS
'Mueve varios items llamando a mover_stock, todo en una sola transaccion: si
uno falla, ninguno queda movido. p_items acepta almacen_id por item para
sobreescribir el general.';
