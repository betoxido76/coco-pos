-- ============================================================================
-- Exportador de datos — Fase 1: ventas (por documento y por producto).
-- Plan: docs/plan-exportador.md
--
-- Vistas planas con todo cruzado y calculado como lo hace el sistema:
--   saldo = total − cobros en USD (monto_usd + monto_bs / tasa), igual que CxC
--   vendedor = el del pedido; sin pedido, quien emitió la nota (igual que el Dashboard)
--   canal = categoría nivel 1 del cliente ('Sin categoría' si no tiene)
--   base/IVA de la línea respetando precio_incluye_iva (docs/plan-iva-base-imponible.md)
--   unidades en unidad primaria; los servicios aportan 0 (src/lib/productos.js)
-- security_invoker: aplican las políticas RLS por empresa de las tablas base.
-- ============================================================================

-- Foto del costo al facturar (por unidad de venta). Las líneas anteriores quedan
-- en NULL y se exportan con el costo promedio actual, marcado como estimado.
ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS costo_unitario numeric(14,4);

CREATE OR REPLACE VIEW v_export_ventas_lineas WITH (security_invoker = on) AS
SELECT
    vi.id                                   AS linea_id,
    vi.venta_id,
    vi.empresa_id,
    vi.producto_id,
    pt.sku,
    pt.nombre                               AS producto,
    pt.tipo_producto,
    pt.categoria_1                          AS producto_cat1,
    pt.categoria_2                          AS producto_cat2,
    pt.categoria_3                          AS producto_cat3,
    pt.categoria_4                          AS producto_cat4,
    vi.unidad_venta,
    vi.cantidad,
    CASE WHEN pt.tipo_producto = 'servicio' THEN 0
         ELSE coalesce(vi.cantidad_primaria, vi.cantidad) END                    AS unidades_primarias,
    round(x.precio_base, 4)                 AS precio_base,
    coalesce(vi.aplica_iva, true)           AS aplica_iva,
    round(x.base_linea, 2)                  AS base_linea,
    round(x.iva_linea, 2)                   AS iva_linea,
    round(x.base_linea + x.iva_linea, 2)    AS total_linea,
    round(x.costo_linea / nullif(vi.cantidad, 0), 4)                             AS costo_unitario,
    round(x.costo_linea, 2)                 AS costo_linea,
    round(x.base_linea - x.costo_linea, 2)  AS margen,
    round((x.base_linea - x.costo_linea) / nullif(x.base_linea, 0) * 100, 2)     AS margen_pct,
    (vi.costo_unitario IS NULL)             AS costo_estimado
FROM venta_items vi
LEFT JOIN productos_terminados pt ON pt.id = vi.producto_id
CROSS JOIN LATERAL (
    SELECT
        p.pb                                                       AS precio_base,
        vi.cantidad * p.pb                                         AS base_linea,
        CASE WHEN coalesce(vi.aplica_iva, true)
             THEN vi.cantidad * p.pb * coalesce(vi.iva_pct, 16) / 100 ELSE 0 END AS iva_linea,
        coalesce(vi.costo_unitario * vi.cantidad,
                 pt.costo_promedio * coalesce(vi.cantidad_primaria, vi.cantidad), 0) AS costo_linea
    FROM (SELECT CASE WHEN vi.precio_incluye_iva AND coalesce(vi.aplica_iva, true)
                      THEN vi.precio_unitario / 1.16 ELSE vi.precio_unitario END AS pb) p
) x;

CREATE OR REPLACE VIEW v_export_ventas WITH (security_invoker = on) AS
SELECT
    v.id                                    AS venta_id,
    v.empresa_id,
    v.numero_factura,
    v.created_at,
    (v.created_at AT TIME ZONE 'America/Caracas')::date              AS fecha,
    to_char(v.created_at AT TIME ZONE 'America/Caracas', 'HH24:MI')   AS hora,
    p.numero_pedido,
    v.oc_cliente,
    v.nro_referencia,
    v.estado_cobro,
    (v.estado_cobro = 'anulado' OR v.motivo_anulacion IS NOT NULL)    AS anulada,
    v.cliente_id,
    c.codigo                                AS cliente_codigo,
    c.nombre                                AS cliente,
    c.rif                                   AS cliente_rif,
    coalesce(k1.nombre, 'Sin categoría')    AS canal,
    k2.nombre                               AS cliente_cat2,
    k3.nombre                               AS cliente_cat3,
    k4.nombre                               AS cliente_cat4,
    c.condicion_pago,
    c.dias_credito,
    c.contribuyente_especial,
    v.direccion_entrega_nombre,
    v.direccion_entrega_texto,
    de.ciudad                               AS direccion_ciudad,
    coalesce(p.vendedor_id, v.usuario_id)   AS vendedor_id,
    uv.nombre                               AS vendedor,
    ue.nombre                               AS emitida_por,
    v.base_gravada,
    v.base_exenta,
    v.iva,
    v.total,
    round(coalesce(cb.cobrado, 0), 2)       AS cobrado,
    round(coalesce(cb.nc_aplicadas, 0), 2)  AS nc_aplicadas,
    s.saldo,
    v.fecha_vencimiento_pago                AS vencimiento,
    CASE WHEN s.saldo > 0 AND v.fecha_vencimiento_pago < (now() AT TIME ZONE 'America/Caracas')::date
         THEN (now() AT TIME ZONE 'America/Caracas')::date - v.fecha_vencimiento_pago ELSE 0 END AS dias_vencida,
    CASE WHEN v.estado_cobro = 'anulado' OR v.motivo_anulacion IS NOT NULL THEN 'anulada'
         WHEN s.saldo <= 0.005 THEN 'pagado'
         WHEN v.fecha_vencimiento_pago < (now() AT TIME ZONE 'America/Caracas')::date THEN 'vencido'
         ELSE 'al día' END                  AS estatus,
    coalesce(li.unidades, 0)                AS unidades_primarias,
    coalesce(li.lineas, 0)                  AS lineas,
    round(coalesce(li.costo, 0), 2)         AS costo,
    round(coalesce(v.subtotal, 0) - coalesce(li.costo, 0), 2)                    AS margen,
    round((coalesce(v.subtotal, 0) - coalesce(li.costo, 0)) / nullif(v.subtotal, 0) * 100, 2) AS margen_pct,
    coalesce(li.costo_estimado, false)      AS costo_estimado,
    coalesce(li.producto_ids, '{}')         AS producto_ids
FROM ventas v
LEFT JOIN pedidos p ON p.id = v.pedido_id
LEFT JOIN clientes c ON c.id = v.cliente_id
LEFT JOIN categorias_clientes k1 ON k1.id = c.cat1_id
LEFT JOIN categorias_clientes k2 ON k2.id = c.cat2_id
LEFT JOIN categorias_clientes k3 ON k3.id = c.cat3_id
LEFT JOIN categorias_clientes k4 ON k4.id = c.cat4_id
LEFT JOIN direcciones_entrega de ON de.id = v.direccion_entrega_id
LEFT JOIN usuarios uv ON uv.id = coalesce(p.vendedor_id, v.usuario_id)
LEFT JOIN usuarios ue ON ue.id = v.usuario_id
LEFT JOIN LATERAL (
    SELECT sum(co.monto_usd + co.monto_bs / nullif(co.tasa_cambio, 0)) AS cobrado,
           sum(CASE WHEN co.devolucion_id IS NOT NULL
                    THEN co.monto_usd + co.monto_bs / nullif(co.tasa_cambio, 0) ELSE 0 END) AS nc_aplicadas
      FROM cobros co WHERE co.venta_id = v.id
) cb ON true
LEFT JOIN LATERAL (
    SELECT sum(l.unidades_primarias) AS unidades, count(*) AS lineas, sum(l.costo_linea) AS costo,
           bool_or(l.costo_estimado) AS costo_estimado, array_agg(DISTINCT l.producto_id) AS producto_ids
      FROM v_export_ventas_lineas l WHERE l.venta_id = v.id
) li ON true
CROSS JOIN LATERAL (
    SELECT CASE WHEN v.estado_cobro IN ('pagado', 'anulado') OR v.motivo_anulacion IS NOT NULL THEN 0
                ELSE round(greatest(0, coalesce(v.total, 0) - coalesce(cb.cobrado, 0)), 2) END AS saldo
) s;

-- La vista de líneas se exporta con los campos del documento al lado
CREATE OR REPLACE VIEW v_export_ventas_detalle WITH (security_invoker = on) AS
SELECT d.*, l.linea_id, l.producto_id AS linea_producto_id, l.sku, l.producto, l.tipo_producto,
       l.producto_cat1, l.producto_cat2, l.producto_cat3, l.producto_cat4,
       l.unidad_venta, l.cantidad, l.unidades_primarias AS linea_unidades_primarias,
       l.precio_base, l.aplica_iva, l.base_linea, l.iva_linea, l.total_linea,
       l.costo_unitario, l.costo_linea, l.margen AS linea_margen, l.margen_pct AS linea_margen_pct,
       l.costo_estimado AS linea_costo_estimado
  FROM v_export_ventas_lineas l
  JOIN v_export_ventas d ON d.venta_id = l.venta_id;

GRANT SELECT ON v_export_ventas, v_export_ventas_lineas, v_export_ventas_detalle TO authenticated;
REVOKE ALL ON v_export_ventas, v_export_ventas_lineas, v_export_ventas_detalle FROM anon;

-- Las vistas (y medio sistema) buscan las líneas de una nota: sin este índice
-- cada nota recorría toda la tabla (0,7 s para 1.000 filas exportadas).
CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items (venta_id);
