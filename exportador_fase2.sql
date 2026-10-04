-- ============================================================================
-- Exportador de datos — Fase 2: pedidos, cobros y cartera CxC.
-- Plan: docs/plan-exportador.md. Mismos criterios que exportador_fase1.sql.
-- ============================================================================

-- ── Pedidos: líneas ──────────────────────────────────────────────────────────
-- La cantidad efectiva sigue a recalcular_totales_pedido: alistado/facturado/
-- despachado usan lo alistado (unidades primarias → unidad de venta si es UM2).
-- Los montos de la línea incluyen el descuento global del pedido, para que la
-- suma de las líneas cuadre con el total del pedido.
CREATE OR REPLACE VIEW v_export_pedidos_lineas WITH (security_invoker = on) AS
SELECT
    pi.id AS linea_id, pi.pedido_id, pi.empresa_id, pi.producto_id,
    pt.sku, coalesce(pt.nombre, pi.nombre_producto) AS producto, pt.tipo_producto,
    pt.categoria_1 AS producto_cat1, pt.categoria_2 AS producto_cat2,
    pi.unidad_venta,
    pi.cantidad AS cantidad_pedida,
    coalesce(pi.cantidad_primaria, pi.cantidad * x.factor) AS unidades_pedidas,
    pi.cantidad_alistada AS unidades_alistadas,
    CASE WHEN pi.cantidad_alistada IS NULL THEN 'pendiente'
         WHEN pi.cantidad_alistada = 0 THEN 'cancelada'
         ELSE 'alistada' END AS estado_linea,
    round(x.precio_base, 4) AS precio_base,
    coalesce(pi.descuento_item, 0) AS descuento_item,
    coalesce(pi.aplica_iva, pt.aplica_iva, true) AS aplica_iva,
    round(x.base, 2) AS base_linea,
    round(CASE WHEN coalesce(pi.aplica_iva, pt.aplica_iva, true) THEN x.base * 0.16 ELSE 0 END, 2) AS iva_linea,
    round(x.base * CASE WHEN coalesce(pi.aplica_iva, pt.aplica_iva, true) THEN 1.16 ELSE 1 END, 2) AS total_linea
FROM pedido_items pi
JOIN pedidos pe ON pe.id = pi.pedido_id
LEFT JOIN productos_terminados pt ON pt.id = pi.producto_id
CROSS JOIN LATERAL (
    SELECT f.factor, pb.precio_base,
           coalesce(c.cant, 0) * pb.precio_base * (1 - coalesce(pi.descuento_item, 0) / 100)
               * (1 - coalesce(pe.descuento_global, 0) / 100) AS base
      FROM (SELECT CASE WHEN coalesce(pt.factor_conversion_2, 1) > 1
                         AND (pi.unidad_venta = '2' OR (pt.unidad_venta_2 IS NOT NULL AND pi.unidad_venta = pt.unidad_venta_2))
                        THEN pt.factor_conversion_2 ELSE 1 END AS factor) f
     CROSS JOIN LATERAL (SELECT CASE WHEN pi.precio_incluye_iva AND coalesce(pi.aplica_iva, pt.aplica_iva, true)
                                     THEN pi.precio_unitario / 1.16 ELSE pi.precio_unitario END AS precio_base) pb
     CROSS JOIN LATERAL (SELECT CASE WHEN pe.estado IN ('alistado', 'facturado', 'despachado') AND pi.cantidad_alistada IS NOT NULL
                                     THEN pi.cantidad_alistada / f.factor ELSE pi.cantidad END AS cant) c
) x;

-- ── Pedidos: documento ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_export_pedidos WITH (security_invoker = on) AS
SELECT
    pe.id AS pedido_id, pe.empresa_id, pe.numero_pedido,
    pe.fecha_pedido,
    (pe.fecha_pedido AT TIME ZONE 'America/Caracas')::date AS fecha,
    to_char(pe.fecha_pedido AT TIME ZONE 'America/Caracas', 'HH24:MI') AS hora,
    pe.estado, pe.origen,
    (pe.estado = 'rechazado' OR pe.motivo_anulacion IS NOT NULL) AS anulado,
    pe.fecha_entrega, pe.fecha_despacho, pe.oc_cliente, pe.notas, pe.motivo_rechazo, pe.motivo_anulacion,
    v.numero_factura AS nota_entrega,
    pe.cliente_id, c.codigo AS cliente_codigo, c.nombre AS cliente, c.rif AS cliente_rif,
    coalesce(k1.nombre, 'Sin categoría') AS canal, k2.nombre AS cliente_cat2,
    pe.direccion_entrega_nombre, pe.direccion_entrega_texto, de.ciudad AS direccion_ciudad,
    pe.vendedor_id, u.nombre AS vendedor,
    lp.nombre AS lista_precio,
    coalesce(pe.descuento_global, 0) AS descuento_global,
    pe.base_gravada, pe.base_exenta, pe.iva, pe.total,
    coalesce(li.lineas, 0) AS lineas,
    coalesce(li.unidades_pedidas, 0) AS unidades_pedidas,
    coalesce(li.unidades_alistadas, 0) AS unidades_alistadas,
    coalesce(li.producto_ids, '{}') AS producto_ids
FROM pedidos pe
LEFT JOIN ventas v ON v.id = pe.venta_id
LEFT JOIN clientes c ON c.id = pe.cliente_id
LEFT JOIN categorias_clientes k1 ON k1.id = c.cat1_id
LEFT JOIN categorias_clientes k2 ON k2.id = c.cat2_id
LEFT JOIN direcciones_entrega de ON de.id = pe.direccion_entrega_id
LEFT JOIN usuarios u ON u.id = pe.vendedor_id
LEFT JOIN listas_precio lp ON lp.id = pe.lista_precio_id
LEFT JOIN LATERAL (
    SELECT count(*) AS lineas, sum(l.unidades_pedidas) AS unidades_pedidas,
           sum(coalesce(l.unidades_alistadas, 0)) AS unidades_alistadas,
           array_agg(DISTINCT l.producto_id) AS producto_ids
      FROM v_export_pedidos_lineas l WHERE l.pedido_id = pe.id
) li ON true;

CREATE OR REPLACE VIEW v_export_pedidos_detalle WITH (security_invoker = on) AS
SELECT d.*, l.linea_id, l.producto_id AS linea_producto_id, l.sku, l.producto, l.tipo_producto,
       l.producto_cat1, l.producto_cat2, l.unidad_venta, l.cantidad_pedida,
       l.unidades_pedidas AS linea_unidades_pedidas, l.unidades_alistadas AS linea_unidades_alistadas,
       l.estado_linea, l.precio_base, l.descuento_item, l.aplica_iva,
       l.base_linea, l.iva_linea, l.total_linea
  FROM v_export_pedidos_lineas l
  JOIN v_export_pedidos d ON d.pedido_id = l.pedido_id;

-- ── Cobros ───────────────────────────────────────────────────────────────────
-- Fecha = fecha REAL del pago (fecha_cobro) en hora de Caracas (CLAUDE.md §7).
-- Una NC aplicada como cobro no es dinero: columna es_nota_credito.
CREATE OR REPLACE VIEW v_export_cobros WITH (security_invoker = on) AS
SELECT
    co.id AS cobro_id, co.empresa_id,
    co.fecha_cobro,
    (co.fecha_cobro AT TIME ZONE 'America/Caracas')::date AS fecha,
    (co.created_at AT TIME ZONE 'America/Caracas')::date AS registrado_el,
    v.numero_factura, (v.created_at AT TIME ZONE 'America/Caracas')::date AS fecha_nota,
    v.total AS total_nota, v.estado_cobro,
    v.cliente_id, c.codigo AS cliente_codigo, c.nombre AS cliente, c.rif AS cliente_rif,
    coalesce(k1.nombre, 'Sin categoría') AS canal,
    coalesce(p.vendedor_id, v.usuario_id) AS vendedor_id, uv.nombre AS vendedor,
    co.monto_usd, co.monto_bs, co.tasa_cambio, co.tipo_tasa,
    round(co.monto_usd + co.monto_bs / nullif(co.tasa_cambio, 0), 2) AS monto_equiv_usd,
    co.metodo_usd, co.metodo_bs,
    cb.banco, cb.numero_cuenta, cb.nombre AS cuenta,
    co.nota,
    (co.devolucion_id IS NOT NULL) AS es_nota_credito,
    d.numero_nc,
    co.contribuyente_especial,
    ur.nombre AS registrado_por,
    (v.estado_cobro = 'anulado' OR v.motivo_anulacion IS NOT NULL) AS anulado
FROM cobros co
JOIN ventas v ON v.id = co.venta_id
LEFT JOIN pedidos p ON p.id = v.pedido_id
LEFT JOIN clientes c ON c.id = v.cliente_id
LEFT JOIN categorias_clientes k1 ON k1.id = c.cat1_id
LEFT JOIN usuarios uv ON uv.id = coalesce(p.vendedor_id, v.usuario_id)
LEFT JOIN usuarios ur ON ur.id = co.usuario_id
LEFT JOIN cuentas_bancarias cb ON cb.id = co.cuenta_bancaria_id
LEFT JOIN devoluciones d ON d.id = co.devolucion_id;

-- ── Cartera CxC: estado actual (sin filtro de fechas) ────────────────────────
CREATE OR REPLACE VIEW v_export_cartera_cxc WITH (security_invoker = on) AS
SELECT d.*,
       (now() AT TIME ZONE 'America/Caracas')::date - d.fecha AS antiguedad_dias,
       CASE WHEN (now() AT TIME ZONE 'America/Caracas')::date - d.fecha <= 15 THEN '0–15 días'
            WHEN (now() AT TIME ZONE 'America/Caracas')::date - d.fecha <= 30 THEN '16–30 días'
            WHEN (now() AT TIME ZONE 'America/Caracas')::date - d.fecha <= 60 THEN '31–60 días'
            ELSE '> 60 días' END AS tramo_antiguedad
  FROM v_export_ventas d
 WHERE d.estado_cobro IN ('pendiente', 'parcial') AND NOT d.anulada;

GRANT SELECT ON v_export_pedidos, v_export_pedidos_lineas, v_export_pedidos_detalle,
                v_export_cobros, v_export_cartera_cxc TO authenticated;
REVOKE ALL ON v_export_pedidos, v_export_pedidos_lineas, v_export_pedidos_detalle,
              v_export_cobros, v_export_cartera_cxc FROM anon;

CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items (pedido_id);
