-- compra_items.precio_unitario guardaba 2 decimales (numeric(12,2)) y la OC no
-- tiene límite: 0,09165 se guardaba 0,09 y 0,029 → 0,03. El encabezado y
-- base_linea quedaban bien; el precio de la línea (y lo que se calcula con él:
-- ND a proveedor, exportador) no. Caso REC-000054 (2026-10-09).
-- Las dos vistas del exportador que leen la columna se recrean con su misma
-- definición (se toma de la base para no transcribirla).
BEGIN;

DO $$
DECLARE v_lineas text := pg_get_viewdef('v_export_compras_lineas'::regclass);
        v_detalle text := pg_get_viewdef('v_export_compras_detalle'::regclass);
BEGIN
    DROP VIEW v_export_compras_detalle;
    DROP VIEW v_export_compras_lineas;
    ALTER TABLE compra_items ALTER COLUMN precio_unitario TYPE numeric(14,6);
    EXECUTE 'CREATE VIEW v_export_compras_lineas WITH (security_invoker = on) AS ' || v_lineas;
    EXECUTE 'CREATE VIEW v_export_compras_detalle WITH (security_invoker = on) AS ' || v_detalle;
END $$;
GRANT SELECT ON v_export_compras_lineas, v_export_compras_detalle TO authenticated;

-- Recuperar el precio exacto de las líneas con la convención nueva (precio
-- base): base_linea tiene 4 decimales y no se redondeó.
UPDATE compra_items
   SET precio_unitario = round(base_linea / (cantidad * (1 - COALESCE(descuento_item, 0) / 100.0)), 6)
 WHERE precio_incluye_iva = false AND cantidad > 0 AND COALESCE(descuento_item, 0) < 100
   AND abs(base_linea - cantidad * precio_unitario * (1 - COALESCE(descuento_item, 0) / 100.0)) > 0.005;

COMMIT;
