-- ============================================================================
-- Exportador de datos — Fase 3: compras, pagos a proveedor, cartera CxP,
-- gastos y movimientos de inventario. Plan: docs/plan-exportador.md.
--
-- Mismos criterios que CuentasPagar.jsx y Gastos:
--   saldo de una recepción = total − descuento por pronto pago − pagos vigentes
--     (pagos_proveedor con anulado = false; incluye aplicaciones de anticipo y ND)
--   total de un gasto = monto si > 0; si no, monto_usd + monto_bs / tasa del gasto
--   saldo de un gasto = total − abonos (tabla pagos, origen_tipo = 'gasto')
-- ============================================================================

-- ── Compras: líneas ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_export_compras_lineas WITH (security_invoker = on) AS
SELECT
    ci.id AS linea_id, ci.compra_id, ci.empresa_id, ci.insumo_id,
    ci.tipo_insumo,
    coalesce(mp.codigo, me.codigo, co.codigo, pt.sku) AS insumo_codigo,
    coalesce(mp.nombre, me.nombre, co.nombre, pt.nombre) AS insumo,
    coalesce(mp.unidad_medida, me.unidad_medida, co.unidad_medida, pt.unidad_medida) AS unidad,
    ci.cantidad,
    round(x.pb, 4) AS precio_base,
    coalesce(ci.descuento_item, 0) AS descuento_item,
    coalesce(ci.aplica_iva, true) AS aplica_iva,
    round(x.base, 2) AS base_linea,
    round(CASE WHEN coalesce(ci.aplica_iva, true) THEN x.base * 0.16 ELSE 0 END, 2) AS iva_linea,
    round(x.base * CASE WHEN coalesce(ci.aplica_iva, true) THEN 1.16 ELSE 1 END, 2) AS total_linea
FROM compra_items ci
JOIN compras c ON c.id = ci.compra_id
LEFT JOIN materias_primas mp ON ci.tipo_insumo = 'materia_prima' AND mp.id = ci.insumo_id
LEFT JOIN materiales_empaque me ON ci.tipo_insumo IN ('empaque', 'material_empaque') AND me.id = ci.insumo_id
LEFT JOIN consumibles co ON ci.tipo_insumo = 'consumible' AND co.id = ci.insumo_id
LEFT JOIN productos_terminados pt ON ci.tipo_insumo = 'producto_terminado' AND pt.id = ci.insumo_id
CROSS JOIN LATERAL (
    SELECT p.pb,
           ci.cantidad * p.pb * (1 - coalesce(ci.descuento_item, 0) / 100) * (1 - coalesce(c.descuento_global, 0) / 100) AS base
      FROM (SELECT CASE WHEN ci.precio_incluye_iva AND coalesce(ci.aplica_iva, true)
                        THEN ci.precio_unitario / 1.16 ELSE ci.precio_unitario END AS pb) p
) x;

-- ── Compras: documento ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_export_compras WITH (security_invoker = on) AS
SELECT
    c.id AS compra_id, c.empresa_id, c.numero_doc, c.nro_doc_proveedor,
    c.fecha_compra,
    (c.fecha_compra AT TIME ZONE 'America/Caracas')::date AS fecha,
    c.estado, (c.estado = 'anulada' OR c.motivo_anulacion IS NOT NULL) AS anulada,
    c.estado_cobro, c.condicion_pago, c.dias_credito,
    c.proveedor_id, pr.nombre AS proveedor, pr.rif AS proveedor_rif,
    oc.numero_oc, al.nombre AS almacen, u.nombre AS recibido_por,
    coalesce(c.descuento_global, 0) AS descuento_global,
    c.base_gravada, c.base_exenta, c.iva, c.total,
    coalesce(c.descuento_pago, 0) AS descuento_pronto_pago,
    round(coalesce(pg.pagado, 0), 2) AS pagado,
    round(coalesce(pg.anticipos, 0), 2) AS aplicado_anticipos,
    round(coalesce(pg.nd, 0), 2) AS aplicado_notas_debito,
    s.saldo,
    c.fecha_vencimiento_pago AS vencimiento,
    CASE WHEN s.saldo > 0 AND c.fecha_vencimiento_pago < (now() AT TIME ZONE 'America/Caracas')::date
         THEN (now() AT TIME ZONE 'America/Caracas')::date - c.fecha_vencimiento_pago ELSE 0 END AS dias_vencida,
    CASE WHEN c.estado = 'anulada' OR c.motivo_anulacion IS NOT NULL THEN 'anulada'
         WHEN s.saldo <= 0.005 THEN 'pagado'
         WHEN c.fecha_vencimiento_pago < (now() AT TIME ZONE 'America/Caracas')::date THEN 'vencido'
         ELSE 'al día' END AS estatus,
    coalesce(li.lineas, 0) AS lineas,
    coalesce(li.insumo_ids, '{}') AS insumo_ids
FROM compras c
LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
LEFT JOIN ordenes_compra oc ON oc.id = c.orden_compra_id
LEFT JOIN almacenes al ON al.id = c.almacen_id
LEFT JOIN usuarios u ON u.id = c.usuario_id
LEFT JOIN LATERAL (
    SELECT sum(p.monto_usd + p.monto_bs / nullif(p.tasa_cambio, 0)) AS pagado,
           sum(CASE WHEN p.anticipo_id IS NOT NULL THEN p.monto_usd + p.monto_bs / nullif(p.tasa_cambio, 0) ELSE 0 END) AS anticipos,
           sum(CASE WHEN p.devolucion_proveedor_id IS NOT NULL THEN p.monto_usd + p.monto_bs / nullif(p.tasa_cambio, 0) ELSE 0 END) AS nd
      FROM pagos_proveedor p WHERE p.compra_id = c.id AND NOT p.anulado
) pg ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS lineas, array_agg(DISTINCT ci.insumo_id) AS insumo_ids
      FROM compra_items ci WHERE ci.compra_id = c.id
) li ON true
CROSS JOIN LATERAL (
    SELECT CASE WHEN c.estado = 'anulada' OR c.motivo_anulacion IS NOT NULL THEN 0
                ELSE round(greatest(0, coalesce(c.total, 0) - coalesce(c.descuento_pago, 0) - coalesce(pg.pagado, 0)), 2) END AS saldo
) s;

CREATE OR REPLACE VIEW v_export_compras_detalle WITH (security_invoker = on) AS
SELECT d.*, l.linea_id, l.insumo_id AS linea_insumo_id, l.tipo_insumo, l.insumo_codigo, l.insumo, l.unidad,
       l.cantidad, l.precio_base, l.descuento_item, l.aplica_iva, l.base_linea, l.iva_linea, l.total_linea
  FROM v_export_compras_lineas l
  JOIN v_export_compras d ON d.compra_id = l.compra_id;

-- ── Cartera CxP: estado actual ───────────────────────────────────────────────
CREATE OR REPLACE VIEW v_export_cartera_cxp WITH (security_invoker = on) AS
SELECT d.*,
       (now() AT TIME ZONE 'America/Caracas')::date - d.fecha AS antiguedad_dias
  FROM v_export_compras d
 WHERE NOT d.anulada AND d.saldo > 0.005;

-- ── Pagos a proveedor (salidas y aplicaciones) ───────────────────────────────
-- Un renglón por pago contra una recepción y por anticipo pagado. Las
-- aplicaciones de anticipo y de ND no son salida de caja (sale_de_caja = No):
-- el dinero salió con el anticipo, que aparece en su propio renglón.
CREATE OR REPLACE VIEW v_export_pagos_proveedor WITH (security_invoker = on) AS
SELECT
    'P-' || p.id::text AS pago_id, p.empresa_id,
    (p.fecha_pago AT TIME ZONE 'America/Caracas')::date AS fecha,
    CASE WHEN p.anticipo_id IS NOT NULL THEN 'aplicación de anticipo'
         WHEN p.devolucion_proveedor_id IS NOT NULL THEN 'nota de débito aplicada'
         ELSE 'pago' END AS tipo,
    (p.anticipo_id IS NULL AND p.devolucion_proveedor_id IS NULL) AS sale_de_caja,
    c.numero_doc AS recepcion, c.nro_doc_proveedor, an.numero_anticipo,
    c.proveedor_id, pr.nombre AS proveedor, pr.rif AS proveedor_rif,
    p.monto_usd, p.monto_bs, p.tasa_cambio, p.tipo_tasa,
    round(p.monto_usd + p.monto_bs / nullif(p.tasa_cambio, 0), 2) AS monto_equiv_usd,
    p.metodo_usd, p.metodo_bs, cb.banco, cb.nombre AS cuenta, p.nota,
    u.nombre AS registrado_por, p.anulado, p.motivo_anulacion
FROM pagos_proveedor p
JOIN compras c ON c.id = p.compra_id
LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
LEFT JOIN anticipos_proveedor an ON an.id = p.anticipo_id
LEFT JOIN cuentas_bancarias cb ON cb.id = p.cuenta_bancaria_id
LEFT JOIN usuarios u ON u.id = p.usuario_id
UNION ALL
SELECT
    'A-' || a.id::text, a.empresa_id,
    a.fecha,
    'anticipo pagado', true,
    NULL, a.nro_doc_proveedor, a.numero_anticipo,
    a.proveedor_id, pr.nombre, pr.rif,
    a.monto_usd, a.monto_bs, a.tasa_cambio, a.tipo_tasa,
    round(a.monto_equiv_usd, 2),
    a.metodo_usd, a.metodo_bs, cb.banco, cb.nombre, a.nota,
    u.nombre, (a.estado = 'anulado'), a.motivo_anulacion
FROM anticipos_proveedor a
LEFT JOIN proveedores pr ON pr.id = a.proveedor_id
LEFT JOIN cuentas_bancarias cb ON cb.id = a.cuenta_bancaria_id
LEFT JOIN usuarios u ON u.id = a.usuario_id;

-- ── Gastos ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_export_gastos WITH (security_invoker = on) AS
SELECT
    g.id AS gasto_id, g.empresa_id, g.numero_gasto, g.fecha,
    tg.nombre AS tipo_gasto, g.categoria, g.nombre AS concepto, g.descripcion,
    g.proveedor_id, pr.nombre AS proveedor, g.numero_factura,
    g.monto_usd, g.monto_bs, g.tasa_cambio, g.tipo_tasa,
    t.total_usd,
    round(coalesce(ab.abonado, 0), 2) AS abonado,
    CASE WHEN g.motivo_anulacion IS NOT NULL OR g.estado = 'pagado' THEN 0
         ELSE round(greatest(0, t.total_usd - coalesce(ab.abonado, 0)), 2) END AS saldo,
    g.estado, g.fecha_vencimiento AS vencimiento, g.metodo_pago,
    cb.banco, cb.nombre AS cuenta,
    (g.motivo_anulacion IS NOT NULL) AS anulado, g.motivo_anulacion,
    u.nombre AS registrado_por
FROM gastos g
LEFT JOIN tipos_gastos tg ON tg.id = g.tipo_gasto_id
LEFT JOIN proveedores pr ON pr.id = g.proveedor_id
LEFT JOIN cuentas_bancarias cb ON cb.id = g.cuenta_bancaria_id
LEFT JOIN usuarios u ON u.id = g.usuario_id
CROSS JOIN LATERAL (
    SELECT round(CASE WHEN coalesce(g.monto, 0) > 0 THEN g.monto
                      ELSE coalesce(g.monto_usd, 0) + coalesce(g.monto_bs, 0) / nullif(g.tasa_cambio, 0) END, 2) AS total_usd
) t
LEFT JOIN LATERAL (
    SELECT sum(p.monto_usd + p.monto_bs / nullif(p.tasa_cambio, 0)) AS abonado
      FROM pagos p WHERE p.origen_tipo = 'gasto' AND p.origen_id = g.id AND p.empresa_id = g.empresa_id
) ab ON true;

-- ── Movimientos de inventario ────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_export_movimientos WITH (security_invoker = on) AS
SELECT
    m.id AS movimiento_id, m.empresa_id, m.fecha AS fecha_hora,
    (m.fecha AT TIME ZONE 'America/Caracas')::date AS fecha,
    to_char(m.fecha AT TIME ZONE 'America/Caracas', 'HH24:MI') AS hora,
    m.tipo_item, m.item_id, m.item_codigo, m.item_nombre,
    m.tipo_movimiento, m.cantidad, m.stock_anterior, m.stock_actual,
    m.origen, m.notas,
    al.nombre AS almacen, au.nombre AS ubicacion, u.nombre AS usuario,
    x.costo AS costo_actual,
    round(m.cantidad * x.costo, 2) AS valor_costo_actual
FROM movimientos_inventario m
LEFT JOIN almacenes al ON al.id = m.almacen_id
LEFT JOIN almacen_ubicaciones au ON au.id = m.almacen_ubicacion_id
LEFT JOIN usuarios u ON u.id = m.usuario_id
LEFT JOIN materias_primas mp ON m.tipo_item = 'materia_prima' AND mp.id = m.item_id
LEFT JOIN materiales_empaque me ON m.tipo_item IN ('material_empaque', 'empaque') AND me.id = m.item_id
LEFT JOIN consumibles co ON m.tipo_item = 'consumible' AND co.id = m.item_id
LEFT JOIN productos_terminados pt ON m.tipo_item = 'producto_terminado' AND pt.id = m.item_id
CROSS JOIN LATERAL (
    SELECT coalesce(pt.costo_promedio, mp.costo_compra_promedio, me.costo_compra_promedio, co.costo_compra_promedio) AS costo
) x;

GRANT SELECT ON v_export_compras, v_export_compras_lineas, v_export_compras_detalle, v_export_cartera_cxp,
                v_export_pagos_proveedor, v_export_gastos, v_export_movimientos TO authenticated;
REVOKE ALL ON v_export_compras, v_export_compras_lineas, v_export_compras_detalle, v_export_cartera_cxp,
              v_export_pagos_proveedor, v_export_gastos, v_export_movimientos FROM anon;

CREATE INDEX IF NOT EXISTS idx_compra_items_compra ON compra_items (compra_id);
