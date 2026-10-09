-- Factura de la recepción en CxP — Fase 1: base de datos
-- docs/plan-factura-recepcion.md (aprobado 2026-10-09)
--
-- La recepción fija CANTIDADES (inventario); la factura fija PRECIOS (deuda).
-- Una recepción puede llegar sin factura (estado_factura = 'pendiente': no se
-- paga) y CxP puede registrar la factura o corregir los precios de cualquier
-- recepción mientras no tenga abonos.

-- ── 1. Columnas ─────────────────────────────────────────────────────────────
-- Default 'registrada': las recepciones existentes y una versión vieja de la
-- app en caché siguen funcionando como hasta hoy (CLAUDE.md §2).
ALTER TABLE compras
    ADD COLUMN IF NOT EXISTS estado_factura text NOT NULL DEFAULT 'registrada'
        CHECK (estado_factura IN ('pendiente', 'registrada')),
    ADD COLUMN IF NOT EXISTS fecha_factura date,
    ADD COLUMN IF NOT EXISTS nro_nota_entrega text,
    ADD COLUMN IF NOT EXISTS factura_registrada_por uuid REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS factura_registrada_at timestamptz,
    ADD COLUMN IF NOT EXISTS motivo_diferencia_factura text;

-- Precio (sin IVA) que cargó logística al recibir. Se llena la primera vez que
-- CxP cambia el precio de la línea; la tolerancia se mide siempre contra él.
ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS precio_recepcion numeric(14,6);

-- ── 2. Permiso: módulo CxP (decisión 3) ────────────────────────────────────
CREATE OR REPLACE FUNCTION _puede_cxp(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_superadmin()
        OR EXISTS (SELECT 1 FROM usuario_modulos
                    WHERE usuario_id = auth.uid() AND empresa_id = p_empresa
                      AND modulo_id = 'cxp' AND activo);
$$;

-- ── 3. registrar_factura_recepcion ──────────────────────────────────────────
-- Registra la factura de una recepción que llegó sin ella, o corrige los
-- precios de cualquier recepción sin abonos (decisión 5).
--   p_items: [{ "id": <compra_items.id>, "precio_unitario": <precio SIN IVA> }]
-- Totales con la fórmula de src/lib/iva.js (totalesDocumento): IVA una vez
-- sobre la base gravada total, descuento_global incluido.
CREATE OR REPLACE FUNCTION registrar_factura_recepcion(
    p_compra_id uuid, p_nro text, p_fecha date, p_items jsonb, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_c compras%ROWTYPE;
    v_it record;
    v_ref numeric;
    v_nuevo numeric;
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

    -- Con abonos no se corrige: el ajuste va por NC de proveedor (decisión B)
    IF EXISTS (SELECT 1 FROM pagos_proveedor WHERE compra_id = p_compra_id AND NOT anulado)
       OR COALESCE(v_c.pago_usd, 0) > 0 OR COALESCE(v_c.pago_bs, 0) > 0 THEN
        RAISE EXCEPTION 'La recepción % ya tiene abonos (pagos, retenciones, anticipos o notas de crédito): corrige con una nota de crédito del proveedor', v_c.numero_doc;
    END IF;
    -- Una devolución (ND) se calculó con el precio actual de la línea
    IF EXISTS (SELECT 1 FROM devoluciones_proveedor WHERE compra_id = p_compra_id
                AND origen = 'devolucion' AND estado_nd <> 'anulada') THEN
        RAISE EXCEPTION 'La recepción % tiene una devolución al proveedor: anúlala antes de corregir los precios', v_c.numero_doc;
    END IF;

    -- Líneas: validar y aplicar los precios nuevos
    FOR v_it IN
        SELECT ci.*, (x->>'precio_unitario')::numeric AS precio_nuevo
          FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) x
          LEFT JOIN compra_items ci ON ci.id = (x->>'id')::uuid AND ci.compra_id = p_compra_id
    LOOP
        IF v_it.id IS NULL THEN RAISE EXCEPTION 'Una línea no pertenece a la recepción'; END IF;
        v_nuevo := round(v_it.precio_nuevo, 6);
        IF v_nuevo IS NULL OR v_nuevo < 0 THEN RAISE EXCEPTION 'Precio inválido en una línea'; END IF;

        -- Referencia: el precio que cargó logística, en base (sin IVA)
        v_ref := COALESCE(v_it.precio_recepcion,
            CASE WHEN v_it.precio_incluye_iva AND COALESCE(v_it.aplica_iva, true)
                 THEN round(v_it.precio_unitario / 1.16, 6) ELSE v_it.precio_unitario END);
        IF (v_ref > 0 AND abs(v_nuevo - v_ref) / v_ref > 0.05) OR (v_ref = 0 AND v_nuevo > 0) THEN
            v_fuera := v_fuera + 1;
        END IF;

        UPDATE compra_items SET
            precio_recepcion = v_ref,
            precio_unitario = v_nuevo,
            precio_incluye_iva = false,
            iva_pct = CASE WHEN COALESCE(aplica_iva, true) THEN 16 ELSE 0 END,
            base_linea = round(cantidad * v_nuevo * (1 - COALESCE(descuento_item, 0) / 100), 4)
         WHERE id = v_it.id;
    END LOOP;

    IF v_fuera > 0 AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
        RAISE EXCEPTION '% línea(s) difieren más del 5%% del precio recibido: el motivo es obligatorio', v_fuera;
    END IF;

    -- Encabezado (misma fórmula que totalesDocumento en src/lib/iva.js)
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
END $$;

REVOKE EXECUTE ON FUNCTION registrar_factura_recepcion(uuid, text, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_factura_recepcion(uuid, text, date, jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION _puede_cxp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _puede_cxp(uuid) TO authenticated;

-- ── 4. Candados (una pestaña con la versión vieja no debe saltarlos) ──────────
-- Sin factura no hay abonos: pago, anticipo, NC ni retención (decisión 1).
-- Todos escriben en pagos_proveedor.
CREATE OR REPLACE FUNCTION _pagos_proveedor_exige_factura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc text;
BEGIN
    SELECT numero_doc INTO v_doc FROM compras
     WHERE id = NEW.compra_id AND estado_factura = 'pendiente';
    IF FOUND THEN
        RAISE EXCEPTION 'La recepción % no tiene factura registrada: regístrala en Cuentas por Pagar antes de pagar', v_doc;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pagos_proveedor_exige_factura ON pagos_proveedor;
CREATE TRIGGER pagos_proveedor_exige_factura BEFORE INSERT ON pagos_proveedor
    FOR EACH ROW EXECUTE FUNCTION _pagos_proveedor_exige_factura();

-- La devolución (ND) toma el precio de la línea: sin factura sería el estimado
-- (decisión C). Las NCP manuales no dependen del precio de la recepción.
CREATE OR REPLACE FUNCTION _devolucion_exige_factura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc text;
BEGIN
    IF NEW.origen = 'devolucion' AND NEW.compra_id IS NOT NULL THEN
        SELECT numero_doc INTO v_doc FROM compras
         WHERE id = NEW.compra_id AND estado_factura = 'pendiente';
        IF FOUND THEN
            RAISE EXCEPTION 'La recepción % no tiene factura registrada: regístrala en Cuentas por Pagar antes de devolver', v_doc;
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS devoluciones_proveedor_exige_factura ON devoluciones_proveedor;
CREATE TRIGGER devoluciones_proveedor_exige_factura BEFORE INSERT ON devoluciones_proveedor
    FOR EACH ROW EXECUTE FUNCTION _devolucion_exige_factura();
