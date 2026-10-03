-- ============================================================================
-- Precios sin IVA (base imponible) — Fase 1: cimientos.
-- Plan: docs/plan-iva-base-imponible.md
--
-- Cada línea guarda bajo qué convención está su precio (precio_incluye_iva) y
-- su alícuota (iva_pct); cada documento guarda base gravada, base exenta e IVA.
--
-- precio_incluye_iva queda con DEFAULT true A PROPÓSITO, también después del
-- corte: el frontend nuevo escribe false explícitamente, y cualquier versión
-- vieja de la app (PWA en caché) que inserte sin la columna queda marcada con
-- la convención que realmente usó.
-- ============================================================================

-- ── Líneas ──────────────────────────────────────────────────────────────────
ALTER TABLE pedido_items
    ADD COLUMN IF NOT EXISTS precio_incluye_iva boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);

ALTER TABLE venta_items
    ADD COLUMN IF NOT EXISTS precio_incluye_iva boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2),
    ADD COLUMN IF NOT EXISTS base_linea numeric(14,4);

ALTER TABLE compra_items
    ADD COLUMN IF NOT EXISTS aplica_iva boolean,
    ADD COLUMN IF NOT EXISTS precio_incluye_iva boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2),
    ADD COLUMN IF NOT EXISTS base_linea numeric(14,4);

-- La OC ya guardaba el precio SIN IVA: solo le falta la foto del IVA.
ALTER TABLE orden_compra_items
    ADD COLUMN IF NOT EXISTS aplica_iva boolean,
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);

ALTER TABLE devolucion_items
    ADD COLUMN IF NOT EXISTS precio_incluye_iva boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);

ALTER TABLE solicitud_devolucion_items
    ADD COLUMN IF NOT EXISTS precio_incluye_iva boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);

ALTER TABLE devolucion_proveedor_items
    ADD COLUMN IF NOT EXISTS aplica_iva boolean,
    ADD COLUMN IF NOT EXISTS precio_incluye_iva boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);

-- ── Encabezados ─────────────────────────────────────────────────────────────
ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS base_gravada numeric(12,2),
    ADD COLUMN IF NOT EXISTS base_exenta numeric(12,2),
    ADD COLUMN IF NOT EXISTS iva numeric(12,2),
    ADD COLUMN IF NOT EXISTS total numeric(12,2);
ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS base_gravada numeric(12,2),
    ADD COLUMN IF NOT EXISTS base_exenta numeric(12,2),
    ADD COLUMN IF NOT EXISTS iva numeric(12,2);
ALTER TABLE compras
    ADD COLUMN IF NOT EXISTS base_gravada numeric(12,2),
    ADD COLUMN IF NOT EXISTS base_exenta numeric(12,2),
    ADD COLUMN IF NOT EXISTS iva numeric(12,2);
ALTER TABLE ordenes_compra
    ADD COLUMN IF NOT EXISTS base_gravada numeric(12,2),
    ADD COLUMN IF NOT EXISTS base_exenta numeric(12,2),
    ADD COLUMN IF NOT EXISTS iva numeric(12,2);
ALTER TABLE devoluciones
    ADD COLUMN IF NOT EXISTS base_gravada numeric(12,2),
    ADD COLUMN IF NOT EXISTS base_exenta numeric(12,2);
ALTER TABLE devoluciones_proveedor
    ADD COLUMN IF NOT EXISTS subtotal numeric(12,2),
    ADD COLUMN IF NOT EXISTS iva numeric(12,2),
    ADD COLUMN IF NOT EXISTS base_gravada numeric(12,2),
    ADD COLUMN IF NOT EXISTS base_exenta numeric(12,2);

-- ── Backfill de líneas (todas con la convención vieja: precio_incluye_iva = true) ──
UPDATE pedido_items pi SET iva_pct = CASE WHEN coalesce(pi.aplica_iva, pt.aplica_iva, true) THEN 16 ELSE 0 END
  FROM productos_terminados pt WHERE pt.id = pi.producto_id AND pi.iva_pct IS NULL;
UPDATE pedido_items SET iva_pct = CASE WHEN coalesce(aplica_iva, true) THEN 16 ELSE 0 END WHERE iva_pct IS NULL;

UPDATE venta_items SET
    iva_pct = CASE WHEN coalesce(aplica_iva, true) THEN 16 ELSE 0 END,
    base_linea = round(cantidad * precio_unitario / CASE WHEN coalesce(aplica_iva, true) THEN 1.16 ELSE 1 END, 4)
 WHERE iva_pct IS NULL;

-- compra_items / OC / ND no tenían foto de IVA: la mejor fuente es el catálogo actual.
CREATE OR REPLACE FUNCTION _iva_catalogo_insumo(p_tipo text, p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT CASE
        WHEN p_tipo IN ('materia_prima', 'materias_primas') THEN (SELECT aplica_iva FROM materias_primas WHERE id = p_id)
        WHEN p_tipo IN ('empaque', 'material_empaque', 'materiales_empaque') THEN (SELECT aplica_iva FROM materiales_empaque WHERE id = p_id)
        WHEN p_tipo IN ('consumible', 'consumibles') THEN (SELECT aplica_iva FROM consumibles WHERE id = p_id)
        WHEN p_tipo IN ('producto_terminado', 'productos_terminados') THEN (SELECT aplica_iva FROM productos_terminados WHERE id = p_id)
    END
$$;

UPDATE compra_items SET aplica_iva = coalesce(_iva_catalogo_insumo(tipo_insumo, insumo_id), true) WHERE aplica_iva IS NULL;
UPDATE compra_items SET
    iva_pct = CASE WHEN aplica_iva THEN 16 ELSE 0 END,
    base_linea = round(cantidad * precio_unitario * (1 - coalesce(descuento_item, 0) / 100)
                       / CASE WHEN aplica_iva THEN 1.16 ELSE 1 END, 4)
 WHERE iva_pct IS NULL;

UPDATE orden_compra_items SET aplica_iva = coalesce(_iva_catalogo_insumo(tipo_insumo, insumo_id), true) WHERE aplica_iva IS NULL;
UPDATE orden_compra_items SET iva_pct = CASE WHEN aplica_iva THEN 16 ELSE 0 END WHERE iva_pct IS NULL;

UPDATE devolucion_items SET iva_pct = CASE WHEN coalesce(aplica_iva, true) THEN 16 ELSE 0 END WHERE iva_pct IS NULL;
UPDATE solicitud_devolucion_items SET iva_pct = CASE WHEN coalesce(aplica_iva, true) THEN 16 ELSE 0 END WHERE iva_pct IS NULL;

UPDATE devolucion_proveedor_items SET aplica_iva = coalesce(_iva_catalogo_insumo(tipo_insumo, insumo_id), true) WHERE aplica_iva IS NULL;
UPDATE devolucion_proveedor_items SET iva_pct = CASE WHEN aplica_iva THEN 16 ELSE 0 END WHERE iva_pct IS NULL;

-- ── Backfill de encabezados: los montos guardados mandan ─────────────────────
-- iva = total − subtotal; base gravada = iva ÷ 16 %; base exenta = el resto.
-- Una exenta de ±5 céntimos es redondeo de un documento todo gravado (→ 0).
-- Si sale más negativa, los montos guardados no sirven para repartir (p. ej.
-- la migración de Los Chorros guardó subtotal 0): se reparte con las líneas.
CREATE OR REPLACE FUNCTION _split_iva(p_subtotal numeric, p_total numeric,
    OUT g numeric, OUT e numeric, OUT i numeric)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    i := round(p_total - p_subtotal, 2);
    g := round(i / 0.16, 2);
    e := round(p_subtotal - g, 2);
    IF abs(e) <= 0.05 THEN e := 0; g := p_subtotal; END IF;
END $$;

UPDATE ventas v SET base_gravada = s.g, base_exenta = s.e, iva = s.i
  FROM ventas x CROSS JOIN LATERAL _split_iva(x.subtotal, x.total) s
 WHERE x.id = v.id AND v.iva IS NULL AND v.total IS NOT NULL AND v.subtotal IS NOT NULL;
UPDATE ventas v SET base_gravada = l.g, base_exenta = l.e, iva = round(v.total - l.g - l.e, 2)
  FROM (SELECT venta_id,
               round(sum(CASE WHEN coalesce(aplica_iva, true) THEN cantidad * precio_unitario / 1.16 ELSE 0 END), 2) g,
               round(sum(CASE WHEN coalesce(aplica_iva, true) THEN 0 ELSE cantidad * precio_unitario END), 2) e
          FROM venta_items GROUP BY venta_id) l
 WHERE l.venta_id = v.id AND v.base_exenta < -0.05;

UPDATE compras c SET base_gravada = s.g, base_exenta = s.e, iva = s.i
  FROM compras x CROSS JOIN LATERAL _split_iva(x.subtotal, x.total) s
 WHERE x.id = c.id AND c.iva IS NULL AND c.total IS NOT NULL AND c.subtotal IS NOT NULL;
UPDATE compras c SET base_gravada = l.g, base_exenta = l.e, iva = round(c.total - l.g - l.e, 2)
  FROM (SELECT compra_id,
               round(sum(CASE WHEN aplica_iva THEN base_linea ELSE 0 END), 2) g,
               round(sum(CASE WHEN aplica_iva THEN 0 ELSE base_linea END), 2) e
          FROM compra_items GROUP BY compra_id) l
 WHERE l.compra_id = c.id AND c.base_exenta < -0.05;

UPDATE ordenes_compra o SET base_gravada = s.g, base_exenta = s.e, iva = s.i
  FROM ordenes_compra x CROSS JOIN LATERAL _split_iva(x.subtotal, x.total) s
 WHERE x.id = o.id AND o.iva IS NULL AND o.total IS NOT NULL AND o.subtotal IS NOT NULL;

-- NC anteriores a la Fase 0 de notas de crédito no tienen subtotal: se deriva de sus líneas.
UPDATE devoluciones d SET subtotal = s.sub, iva = round(d.monto_devuelto - s.sub, 2)
  FROM (SELECT devolucion_id,
               round(sum(cantidad_devuelta * precio_unitario / CASE WHEN coalesce(aplica_iva, true) THEN 1.16 ELSE 1 END), 2) sub
          FROM devolucion_items GROUP BY devolucion_id) s
 WHERE s.devolucion_id = d.id AND d.subtotal IS NULL;
UPDATE devoluciones d SET base_gravada = s.g, base_exenta = s.e
  FROM devoluciones x CROSS JOIN LATERAL _split_iva(x.subtotal, x.monto_devuelto) s
 WHERE x.id = d.id AND d.base_gravada IS NULL AND d.subtotal IS NOT NULL;

UPDATE devoluciones_proveedor d SET
    base_gravada = s.g, base_exenta = s.e, subtotal = s.g + s.e, iva = round(d.monto_total - s.g - s.e, 2)
  FROM (SELECT devolucion_proveedor_id,
               round(sum(CASE WHEN aplica_iva THEN cantidad * precio_unitario / 1.16 ELSE 0 END), 2) g,
               round(sum(CASE WHEN aplica_iva THEN 0 ELSE cantidad * precio_unitario END), 2) e
          FROM devolucion_proveedor_items GROUP BY devolucion_proveedor_id) s
 WHERE s.devolucion_proveedor_id = d.id AND d.subtotal IS NULL;

-- ── Totales del pedido: una sola fórmula, en la base ────────────────────────
-- Igual que las pantallas: alistado/facturado/despachado usan lo alistado
-- (en unidades primarias → unidad de venta si la línea es UM2).
-- Una vez facturado (venta_id) el pedido queda con los montos de su nota.
CREATE OR REPLACE FUNCTION recalcular_totales_pedido(p_pedido uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_dg numeric; v_estado text; v_venta uuid;
    v_g numeric := 0; v_e numeric := 0; v_f numeric;
    r record; v_cant numeric; v_precio numeric; v_aplica boolean; v_base numeric;
BEGIN
    SELECT coalesce(descuento_global, 0), estado, venta_id INTO v_dg, v_estado, v_venta
      FROM pedidos WHERE id = p_pedido;
    IF NOT FOUND THEN RETURN; END IF;
    IF v_venta IS NOT NULL THEN
        UPDATE pedidos p SET
            base_gravada = coalesce(v.base_gravada, round((v.total - v.subtotal) / 0.16, 2)),
            base_exenta = coalesce(v.base_exenta, round(v.subtotal - round((v.total - v.subtotal) / 0.16, 2), 2)),
            iva = coalesce(v.iva, round(v.total - v.subtotal, 2)),
            total = v.total
          FROM ventas v WHERE v.id = v_venta AND p.id = p_pedido;
        RETURN;
    END IF;

    FOR r IN
        SELECT pi.cantidad, pi.cantidad_alistada, pi.precio_unitario, pi.descuento_item,
               pi.unidad_venta, pi.aplica_iva, pi.precio_incluye_iva,
               pt.aplica_iva AS pt_iva, pt.unidad_venta_2, pt.factor_conversion_2
          FROM pedido_items pi LEFT JOIN productos_terminados pt ON pt.id = pi.producto_id
         WHERE pi.pedido_id = p_pedido
    LOOP
        v_cant := r.cantidad;
        IF v_estado IN ('alistado', 'facturado', 'despachado') AND r.cantidad_alistada IS NOT NULL THEN
            v_f := coalesce(r.factor_conversion_2, 1);
            IF v_f > 1 AND (r.unidad_venta = '2' OR (r.unidad_venta_2 IS NOT NULL AND r.unidad_venta = r.unidad_venta_2)) THEN
                v_cant := r.cantidad_alistada / v_f;
            ELSE
                v_cant := r.cantidad_alistada;
            END IF;
        END IF;
        v_aplica := coalesce(r.aplica_iva, r.pt_iva, true);
        v_precio := CASE WHEN r.precio_incluye_iva AND v_aplica THEN r.precio_unitario / 1.16 ELSE r.precio_unitario END;
        v_base := coalesce(v_cant, 0) * coalesce(v_precio, 0) * (1 - coalesce(r.descuento_item, 0) / 100);
        IF v_aplica THEN v_g := v_g + v_base; ELSE v_e := v_e + v_base; END IF;
    END LOOP;

    v_g := round(v_g * (1 - v_dg / 100), 2);
    v_e := round(v_e * (1 - v_dg / 100), 2);
    UPDATE pedidos SET base_gravada = v_g, base_exenta = v_e,
                       iva = round(v_g * 0.16, 2), total = v_g + v_e + round(v_g * 0.16, 2)
     WHERE id = p_pedido;
END $$;

CREATE OR REPLACE FUNCTION _pedido_items_totales() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM recalcular_totales_pedido(OLD.pedido_id); END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id) THEN
        PERFORM recalcular_totales_pedido(NEW.pedido_id);
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS pedido_items_totales ON pedido_items;
CREATE TRIGGER pedido_items_totales AFTER INSERT OR UPDATE OR DELETE ON pedido_items
    FOR EACH ROW EXECUTE FUNCTION _pedido_items_totales();

CREATE OR REPLACE FUNCTION _pedidos_totales() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM recalcular_totales_pedido(NEW.id);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS pedidos_totales ON pedidos;
CREATE TRIGGER pedidos_totales AFTER UPDATE OF estado, descuento_global, venta_id ON pedidos
    FOR EACH ROW EXECUTE FUNCTION _pedidos_totales();

-- Backfill: los facturados toman los montos de su nota; el resto se calcula.
UPDATE pedidos p SET base_gravada = v.base_gravada, base_exenta = v.base_exenta, iva = v.iva, total = v.total
  FROM ventas v WHERE v.id = p.venta_id AND p.total IS NULL;
DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT id FROM pedidos WHERE total IS NULL LOOP
        PERFORM recalcular_totales_pedido(r.id);
    END LOOP;
END $$;
