-- ============================================================================
-- REQUISICIONES DE MATERIALES — Fase 1 (docs/plan-requisiciones.md)
--
-- Consumo interno de ítems que no están en recetas ni se venden (en Meraki,
-- el almacén "Consumibles"). Documento RQ-000001: quién pide (usuario), para
-- qué área, de qué almacén y qué ítems.
--   pendiente  → no mueve inventario
--   entregada  → almacén despacha: mover_stock_lote salida, origen 'requisicion'
--   anulada    → si estaba entregada, reverso con origen 'anulacion_requisicion'
--
-- Escritura SOLO por RPC (requisiciones e ítems sin políticas de INSERT/UPDATE):
--   crear_requisicion · entregar_requisicion · anular_requisicion
-- Permisos (plan, decisión 0.5): solicitar = módulo 'requisiciones';
-- entregar / anular una entregada = módulo 'inventario'.
-- ============================================================================

-- ── 1. Áreas de consumo (editables por empresa) ────────────────────────────
CREATE TABLE IF NOT EXISTS areas_consumo (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  uuid NOT NULL REFERENCES empresas(id),
    nombre      text NOT NULL CHECK (btrim(nombre) <> ''),
    activa      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS areas_consumo_nombre_unico ON areas_consumo (empresa_id, lower(btrim(nombre)));

ALTER TABLE areas_consumo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS areas_consumo_tenant ON areas_consumo;
CREATE POLICY areas_consumo_tenant ON areas_consumo FOR ALL
    USING (empresa_id = get_empresa_id() OR is_superadmin())
    WITH CHECK (empresa_id = get_empresa_id() OR is_superadmin());
GRANT SELECT, INSERT, UPDATE ON areas_consumo TO authenticated;

-- Áreas iniciales para todas las empresas (decisión 0.4)
INSERT INTO areas_consumo (empresa_id, nombre)
SELECT e.id, a.nombre
FROM empresas e CROSS JOIN (VALUES ('Producción'), ('Limpieza'), ('Administración'), ('Calidad')) AS a(nombre)
ON CONFLICT DO NOTHING;

-- ── 2. Requisiciones ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requisiciones (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    numero_requisicion  text NOT NULL,
    fecha               date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Caracas')::date,
    solicitante_id      uuid NOT NULL REFERENCES usuarios(id),
    area_id             uuid NOT NULL REFERENCES areas_consumo(id),
    almacen_id          uuid NOT NULL REFERENCES almacenes(id),
    estado              text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'entregada', 'anulada')),
    notas               text,
    entregado_por       uuid REFERENCES usuarios(id),
    fecha_entrega       timestamptz,
    anulado_por         uuid REFERENCES usuarios(id),
    fecha_anulacion     timestamptz,
    motivo_anulacion    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT requisiciones_numero_unico UNIQUE (empresa_id, numero_requisicion)
);
CREATE INDEX IF NOT EXISTS requisiciones_empresa_estado_idx ON requisiciones (empresa_id, estado, fecha DESC);

CREATE TABLE IF NOT EXISTS requisicion_items (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id           uuid NOT NULL REFERENCES empresas(id),
    requisicion_id       uuid NOT NULL REFERENCES requisiciones(id) ON DELETE CASCADE,
    tipo_item            text NOT NULL CHECK (tipo_item IN ('producto_terminado', 'materia_prima', 'material_empaque', 'consumible')),
    item_id              uuid NOT NULL,
    item_nombre          text,
    item_codigo          text,
    unidad               text,
    cantidad_solicitada  numeric(14,4) NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_entregada   numeric(14,4) CHECK (cantidad_entregada >= 0),
    costo_unitario       numeric(14,6),
    notas                text
);
CREATE INDEX IF NOT EXISTS requisicion_items_req_idx ON requisicion_items (requisicion_id);

ALTER TABLE requisiciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisicion_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS requisiciones_select ON requisiciones;
CREATE POLICY requisiciones_select ON requisiciones FOR SELECT USING (empresa_id = get_empresa_id() OR is_superadmin());
DROP POLICY IF EXISTS requisicion_items_select ON requisicion_items;
CREATE POLICY requisicion_items_select ON requisicion_items FOR SELECT USING (empresa_id = get_empresa_id() OR is_superadmin());
GRANT SELECT ON requisiciones, requisicion_items TO authenticated;

-- ── 3. Helpers internos ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _usuario_tiene_modulo(p_empresa uuid, p_modulo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_superadmin()
        OR EXISTS (SELECT 1 FROM usuario_modulos
                    WHERE usuario_id = auth.uid() AND empresa_id = p_empresa
                      AND modulo_id = p_modulo AND activo);
$$;

-- Foto del ítem (nombre, código, unidad, costo) validando que sea de la empresa
CREATE OR REPLACE FUNCTION _item_inventario(p_empresa uuid, p_tipo text, p_id uuid)
RETURNS TABLE (nombre text, codigo text, unidad text, costo numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_tipo = 'producto_terminado' THEN
        RETURN QUERY SELECT t.nombre, t.sku, t.unidad_medida, t.costo_promedio FROM productos_terminados t WHERE t.id = p_id AND t.empresa_id = p_empresa;
    ELSIF p_tipo = 'materia_prima' THEN
        RETURN QUERY SELECT t.nombre, t.codigo, t.unidad_medida, t.costo_compra_promedio FROM materias_primas t WHERE t.id = p_id AND t.empresa_id = p_empresa;
    ELSIF p_tipo = 'material_empaque' THEN
        RETURN QUERY SELECT t.nombre, t.codigo, t.unidad_medida, t.costo_compra_promedio FROM materiales_empaque t WHERE t.id = p_id AND t.empresa_id = p_empresa;
    ELSIF p_tipo = 'consumible' THEN
        RETURN QUERY SELECT t.nombre, t.codigo, t.unidad_medida, t.costo_compra_promedio FROM consumibles t WHERE t.id = p_id AND t.empresa_id = p_empresa;
    END IF;
END $$;

-- ── 4. Crear ────────────────────────────────────────────────────────────────
-- p_items: [{ tipo_item, item_id, cantidad, notas? }]
CREATE OR REPLACE FUNCTION crear_requisicion(p_area_id uuid, p_almacen_id uuid, p_notas text, p_items jsonb)
RETURNS requisiciones
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_empresa uuid := get_empresa_id();
    v_req requisiciones%ROWTYPE; v_ult int; e jsonb; v_it record; v_n int := 0;
BEGIN
    IF v_empresa IS NULL THEN RAISE EXCEPTION 'Sesión sin empresa'; END IF;
    IF NOT _usuario_tiene_modulo(v_empresa, 'requisiciones') THEN
        RAISE EXCEPTION 'Necesitas el módulo de Requisiciones para solicitar materiales';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM areas_consumo WHERE id = p_area_id AND empresa_id = v_empresa AND activa) THEN
        RAISE EXCEPTION 'Área no encontrada o inactiva';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM almacenes WHERE id = p_almacen_id AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Almacén no encontrado';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Agrega al menos un ítem';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('requisicion_num_' || v_empresa::text));
    SELECT MAX(CAST(split_part(numero_requisicion, '-', 2) AS integer)) INTO v_ult
      FROM requisiciones WHERE empresa_id = v_empresa AND numero_requisicion LIKE 'RQ-%';

    INSERT INTO requisiciones (empresa_id, numero_requisicion, solicitante_id, area_id, almacen_id, notas)
    VALUES (v_empresa, 'RQ-' || lpad((COALESCE(v_ult, 0) + 1)::text, 6, '0'), auth.uid(), p_area_id, p_almacen_id, NULLIF(btrim(p_notas), ''))
    RETURNING * INTO v_req;

    FOR e IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        IF COALESCE((e->>'cantidad')::numeric, 0) <= 0 THEN
            RAISE EXCEPTION 'Todas las cantidades deben ser mayores a cero';
        END IF;
        SELECT * INTO v_it FROM _item_inventario(v_empresa, e->>'tipo_item', (e->>'item_id')::uuid);
        IF v_it.nombre IS NULL THEN RAISE EXCEPTION 'Ítem no encontrado'; END IF;
        INSERT INTO requisicion_items (empresa_id, requisicion_id, tipo_item, item_id, item_nombre, item_codigo, unidad, cantidad_solicitada, notas)
        VALUES (v_empresa, v_req.id, e->>'tipo_item', (e->>'item_id')::uuid, v_it.nombre, v_it.codigo, v_it.unidad,
                (e->>'cantidad')::numeric, NULLIF(btrim(e->>'notas'), ''));
        v_n := v_n + 1;
    END LOOP;
    RETURN v_req;
END $$;

-- ── 5. Entregar ─────────────────────────────────────────────────────────────
-- p_items: [{ id (requisicion_items.id), cantidad_entregada }] — las líneas que
-- no vengan se entregan por lo solicitado. Cantidad 0 = no se entregó esa línea.
CREATE OR REPLACE FUNCTION entregar_requisicion(p_requisicion_id uuid, p_items jsonb, p_permitir_faltante boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_req requisiciones%ROWTYPE; v_area text; v_mov jsonb := '[]'::jsonb; r record; v_cant numeric; v_it record; v_res jsonb;
BEGIN
    SELECT * INTO v_req FROM requisiciones WHERE id = p_requisicion_id FOR UPDATE;
    IF v_req.id IS NULL OR (v_req.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Requisición no encontrada';
    END IF;
    IF NOT _usuario_tiene_modulo(v_req.empresa_id, 'inventario') THEN
        RAISE EXCEPTION 'Solo almacén (módulo de Inventario) puede entregar requisiciones';
    END IF;
    IF v_req.estado <> 'pendiente' THEN RAISE EXCEPTION 'La requisición % está %', v_req.numero_requisicion, v_req.estado; END IF;
    SELECT nombre INTO v_area FROM areas_consumo WHERE id = v_req.area_id;

    FOR r IN SELECT * FROM requisicion_items WHERE requisicion_id = v_req.id ORDER BY id LOOP
        SELECT (e->>'cantidad_entregada')::numeric INTO v_cant
          FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e WHERE (e->>'id')::uuid = r.id;
        v_cant := COALESCE(v_cant, r.cantidad_solicitada);
        IF v_cant < 0 THEN RAISE EXCEPTION 'Cantidad entregada inválida en %', r.item_nombre; END IF;
        SELECT * INTO v_it FROM _item_inventario(v_req.empresa_id, r.tipo_item, r.item_id);
        UPDATE requisicion_items SET cantidad_entregada = v_cant, costo_unitario = v_it.costo WHERE id = r.id;
        IF v_cant > 0 THEN
            v_mov := v_mov || jsonb_build_object('tipo_item', r.tipo_item, 'item_id', r.item_id, 'cantidad', v_cant);
        END IF;
    END LOOP;

    IF jsonb_array_length(v_mov) = 0 THEN
        RAISE EXCEPTION 'No se entrega nada: si no se va a despachar, anula la requisición';
    END IF;

    v_res := mover_stock_lote(v_mov, 'salida', 'requisicion', v_req.almacen_id, p_permitir_faltante,
                              v_req.numero_requisicion || ' · ' || COALESCE(v_area, ''), auth.uid(), now());

    UPDATE requisiciones SET estado = 'entregada', entregado_por = auth.uid(), fecha_entrega = now() WHERE id = v_req.id;
    RETURN v_res;
END $$;

-- ── 6. Anular ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION anular_requisicion(p_requisicion_id uuid, p_motivo text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req requisiciones%ROWTYPE; v_area text; v_mov jsonb;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo de anulación es obligatorio'; END IF;
    SELECT * INTO v_req FROM requisiciones WHERE id = p_requisicion_id FOR UPDATE;
    IF v_req.id IS NULL OR (v_req.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Requisición no encontrada';
    END IF;
    IF v_req.estado = 'anulada' THEN RAISE EXCEPTION 'La requisición ya está anulada'; END IF;

    IF v_req.estado = 'pendiente' THEN
        IF v_req.solicitante_id <> auth.uid() AND NOT _usuario_tiene_modulo(v_req.empresa_id, 'inventario') THEN
            RAISE EXCEPTION 'Solo quien la solicitó o almacén pueden anular esta requisición';
        END IF;
    ELSE
        IF NOT _usuario_tiene_modulo(v_req.empresa_id, 'inventario') THEN
            RAISE EXCEPTION 'Solo almacén (módulo de Inventario) puede anular una requisición entregada';
        END IF;
        -- Reverso: lo entregado vuelve al mismo almacén
        SELECT jsonb_agg(jsonb_build_object('tipo_item', tipo_item, 'item_id', item_id, 'cantidad', cantidad_entregada))
          INTO v_mov FROM requisicion_items WHERE requisicion_id = v_req.id AND cantidad_entregada > 0;
        SELECT nombre INTO v_area FROM areas_consumo WHERE id = v_req.area_id;
        IF v_mov IS NOT NULL THEN
            PERFORM mover_stock_lote(v_mov, 'entrada', 'anulacion_requisicion', v_req.almacen_id, false,
                                     'Anulación ' || v_req.numero_requisicion || ' · ' || COALESCE(v_area, '') || ' — ' || btrim(p_motivo),
                                     auth.uid(), now());
        END IF;
    END IF;

    UPDATE requisiciones SET estado = 'anulada', anulado_por = auth.uid(), fecha_anulacion = now(), motivo_anulacion = btrim(p_motivo)
     WHERE id = v_req.id;
    RETURN 'anulada';
END $$;

-- ── 7. Permisos de ejecución ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION _usuario_tiene_modulo(uuid, text), _item_inventario(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crear_requisicion(uuid, uuid, text, jsonb), entregar_requisicion(uuid, jsonb, boolean),
    anular_requisicion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crear_requisicion(uuid, uuid, text, jsonb), entregar_requisicion(uuid, jsonb, boolean),
    anular_requisicion(uuid, text) TO authenticated;

-- ── 8. Módulo (se activa por empresa desde SuperAdmin) ─────────────────────
INSERT INTO modulos (id, nombre, descripcion, icono, orden, activo)
VALUES ('requisiciones', 'Requisiciones', 'Solicitud y entrega de materiales para consumo interno', 'ClipboardCheck', 13, true)
ON CONFLICT (id) DO NOTHING;
