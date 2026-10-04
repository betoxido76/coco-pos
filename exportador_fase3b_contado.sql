-- ============================================================================
-- Exportador — Fase 3b: recepciones de CONTADO.
-- El pago de contado vive en la propia recepción (compras.pago_usd / pago_bs /
-- tasa_cambio), no en pagos_proveedor: sin esto una recepción de contado pagada
-- aparecía con todo su total como saldo. Un contado parcial pasa a crédito y su
-- anticipo queda en pagos_proveedor (CLAUDE.md §7), así que solo se suma el
-- pago de la recepción cuando condicion_pago = 'contado'.
-- ============================================================================

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
    round(coalesce(pg.pagado, 0) + ct.contado, 2) AS pagado,
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
CROSS JOIN LATERAL (
    SELECT CASE WHEN c.condicion_pago = 'contado'
                THEN coalesce(c.pago_usd, 0) + coalesce(c.pago_bs, 0) / nullif(c.tasa_cambio, 0) ELSE 0 END AS contado
) ct
LEFT JOIN LATERAL (
    SELECT count(*) AS lineas, array_agg(DISTINCT ci.insumo_id) AS insumo_ids
      FROM compra_items ci WHERE ci.compra_id = c.id
) li ON true
CROSS JOIN LATERAL (
    SELECT CASE WHEN c.estado = 'anulada' OR c.motivo_anulacion IS NOT NULL THEN 0
                ELSE round(greatest(0, coalesce(c.total, 0) - coalesce(c.descuento_pago, 0)
                                       - coalesce(pg.pagado, 0) - coalesce(ct.contado, 0)), 2) END AS saldo
) s;

-- Pagos de contado (en la recepción) también son salidas a proveedor
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
    'A-' || a.id::text, a.empresa_id, a.fecha,
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
LEFT JOIN usuarios u ON u.id = a.usuario_id
UNION ALL
SELECT
    'C-' || c.id::text, c.empresa_id,
    coalesce(c.fecha_pago, (c.fecha_compra AT TIME ZONE 'America/Caracas')::date),
    'pago de contado', true,
    c.numero_doc, c.nro_doc_proveedor, NULL,
    c.proveedor_id, pr.nombre, pr.rif,
    coalesce(c.pago_usd, 0), coalesce(c.pago_bs, 0), c.tasa_cambio, c.tipo_tasa,
    round(coalesce(c.pago_usd, 0) + coalesce(c.pago_bs, 0) / nullif(c.tasa_cambio, 0), 2),
    c.metodo_usd, c.metodo_bs, NULL, NULL, NULL,
    u.nombre, (c.estado = 'anulada' OR c.motivo_anulacion IS NOT NULL), c.motivo_anulacion
FROM compras c
LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
LEFT JOIN usuarios u ON u.id = c.usuario_id
WHERE c.condicion_pago = 'contado' AND (coalesce(c.pago_usd, 0) > 0 OR coalesce(c.pago_bs, 0) > 0);
