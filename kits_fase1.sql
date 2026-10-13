-- Kits (PT armados con otros PT) — Fase 1: base de datos
-- docs/plan-kits.md (aprobado 2026-10-09, alternativa A)

-- ── 1. Un producto terminado puede ser insumo de una receta ──────────────────
ALTER TABLE receta_items DROP CONSTRAINT receta_items_tipo_insumo_check;
ALTER TABLE receta_items ADD CONSTRAINT receta_items_tipo_insumo_check
    CHECK (tipo_insumo IN ('materia_prima', 'empaque', 'material_empaque', 'consumible', 'producto_terminado'));

ALTER TABLE lote_consumos DROP CONSTRAINT lote_consumos_tipo_insumo_check;
ALTER TABLE lote_consumos ADD CONSTRAINT lote_consumos_tipo_insumo_check
    CHECK (tipo_insumo IN ('materia_prima', 'empaque', 'material_empaque', 'consumible', 'producto_terminado'));

-- ── 2. Componentes PT: solo en recetas de PT y sin ciclos ───────────────────
-- Un PT no puede estar en su propia receta, ni de forma indirecta (kit A
-- contiene B, que contiene A). Una receta de MP intermedia no lleva PT: un PT
-- que use esa MP cerraría un ciclo que esta validación no recorre.
CREATE OR REPLACE FUNCTION _receta_items_valida_pt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r recetas%ROWTYPE; v_ciclo boolean;
BEGIN
    IF NEW.tipo_insumo <> 'producto_terminado' THEN RETURN NEW; END IF;
    SELECT * INTO v_r FROM recetas WHERE id = NEW.receta_id;
    IF v_r.producto_id IS NULL THEN
        RAISE EXCEPTION 'Un producto terminado solo puede ser insumo de la receta de otro producto terminado';
    END IF;
    IF NEW.insumo_id = v_r.producto_id THEN
        RAISE EXCEPTION 'Un producto no puede ser insumo de su propia receta';
    END IF;
    -- ¿El producto de esta receta aparece en el árbol del componente?
    WITH RECURSIVE arbol(pt) AS (
        SELECT NEW.insumo_id
        UNION
        SELECT ri.insumo_id
          FROM arbol a
          JOIN recetas r ON r.producto_id = a.pt AND r.empresa_id = v_r.empresa_id
          JOIN receta_items ri ON ri.receta_id = r.id AND ri.tipo_insumo = 'producto_terminado'
    )
    SELECT EXISTS (SELECT 1 FROM arbol WHERE pt = v_r.producto_id) INTO v_ciclo;
    IF v_ciclo THEN
        RAISE EXCEPTION 'Receta circular: el componente ya contiene, directa o indirectamente, a este producto';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS receta_items_valida_pt ON receta_items;
CREATE TRIGGER receta_items_valida_pt BEFORE INSERT OR UPDATE OF tipo_insumo, insumo_id ON receta_items
    FOR EACH ROW EXECUTE FUNCTION _receta_items_valida_pt();

-- ── 3. mover_stock_lote: faltante permitido POR ÍTEM ─────────────────────────
-- Producción permite faltante de MP/ME (se registra marcado) pero NO de un
-- componente PT. Cada ítem puede traer "permitir_faltante"; si no lo trae, vale
-- el parámetro general, así que las llamadas existentes no cambian.
CREATE OR REPLACE FUNCTION public.mover_stock_lote(p_items jsonb, p_tipo_movimiento text, p_origen text, p_almacen_id uuid DEFAULT NULL::uuid, p_permitir_faltante boolean DEFAULT false, p_notas text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid, p_fecha timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
               (e->>'almacen_id')         AS almacen_id,
               (e->>'permitir_faltante')::boolean AS permitir_faltante
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
    LOOP
        CONTINUE WHEN r.cantidad IS NULL OR r.cantidad <= 0;

        v_res := mover_stock(
            r.tipo_item, r.item_id, r.cantidad, p_tipo_movimiento, p_origen,
            COALESCE(NULLIF(r.almacen_id, '')::uuid, p_almacen_id),
            COALESCE(r.permitir_faltante, p_permitir_faltante), p_notas, p_usuario_id, p_fecha);

        v_resultados := v_resultados || jsonb_build_object('item_id', r.item_id, 'resultado', v_res);
        v_movs     := v_movs + COALESCE((v_res->>'movimientos')::int, 0);
        v_faltante := v_faltante + COALESCE((v_res->>'faltante')::numeric, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'items',       jsonb_array_length(v_resultados),
        'movimientos', v_movs,
        'faltante',    v_faltante,
        'detalle',     v_resultados);
END $function$;
