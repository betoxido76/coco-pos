-- Factura de la recepción en CxP — Fase 4: exportador
-- docs/plan-factura-recepcion.md
-- v_export_compras suma estado_factura, fecha_factura y nro_nota_entrega al
-- final (se toma la definición vigente de la base para no transcribirla).
-- v_export_compras_detalle usa d.* y hay que recrearla para que los incluya.
BEGIN;

DROP VIEW v_export_compras_detalle;

DO $$
DECLARE v_def text := pg_get_viewdef('v_export_compras'::regclass);
        v_nuevo text;
BEGIN
    v_nuevo := regexp_replace(v_def, 'AS retenido(\s+FROM)',
        'AS retenido, c.estado_factura, c.fecha_factura, c.nro_nota_entrega\1');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontró el punto de inserción en v_export_compras'; END IF;
    EXECUTE 'CREATE OR REPLACE VIEW v_export_compras WITH (security_invoker = on) AS ' || v_nuevo;
END $$;

CREATE VIEW v_export_compras_detalle WITH (security_invoker = on) AS
SELECT d.*, l.linea_id, l.insumo_id AS linea_insumo_id, l.tipo_insumo, l.insumo_codigo, l.insumo, l.unidad,
       l.cantidad, l.precio_base, l.descuento_item, l.aplica_iva, l.base_linea, l.iva_linea, l.total_linea
  FROM v_export_compras_lineas l
  JOIN v_export_compras d ON d.compra_id = l.compra_id;

GRANT SELECT ON v_export_compras, v_export_compras_detalle TO authenticated;

COMMIT;
