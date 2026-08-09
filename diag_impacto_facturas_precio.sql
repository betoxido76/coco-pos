-- ============================================================================
-- Cuánto se dejó de facturar por el bug del precio en pedidos de campo
--
-- Cadena del error:
--   NuevoPedido guardó  precio_unitario = precio / 1.16
--   Pedidos.jsx calcula el total extrayendo la base:  precio_unitario / 1.16
--   → total_factura = total_correcto / 1.16   (13,79% por debajo)
--
-- Diferencia a favor de la empresa = total_facturado * 0.16
--
-- Ninguna consulta modifica datos.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) EL NÚMERO: cuánto falta por facturar, separado por estado de cobro.
--    Lo aún 'pendiente' es corregible antes de cobrar; lo 'pagado' ya se cobró
--    de menos y solo se recupera renegociando o con nota de débito.
-- ----------------------------------------------------------------------------
WITH afectados AS (
    SELECT DISTINCT pi.pedido_id
    FROM pedido_items pi
    WHERE pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
                               * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0)
          BETWEEN 1.158 AND 1.162
)
SELECT v.estado_cobro,
       count(*)                                  AS facturas,
       round(sum(v.total)::numeric, 2)           AS facturado,
       round(sum(v.total * 1.16)::numeric, 2)    AS debio_ser,
       round(sum(v.total * 0.16)::numeric, 2)    AS diferencia
FROM afectados a
JOIN pedidos p ON p.id = a.pedido_id
JOIN ventas  v ON v.pedido_id = p.id
GROUP BY v.estado_cobro
ORDER BY v.estado_cobro;


-- ----------------------------------------------------------------------------
-- 2) Por cliente, para priorizar la conversación comercial.
-- ----------------------------------------------------------------------------
WITH afectados AS (
    SELECT DISTINCT pi.pedido_id
    FROM pedido_items pi
    WHERE pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
                               * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0)
          BETWEEN 1.158 AND 1.162
)
SELECT cl.nombre AS cliente,
       count(*)                               AS facturas,
       round(sum(v.total)::numeric, 2)        AS facturado,
       round(sum(v.total * 0.16)::numeric, 2) AS diferencia
FROM afectados a
JOIN pedidos  p  ON p.id = a.pedido_id
JOIN ventas   v  ON v.pedido_id = p.id
JOIN clientes cl ON cl.id = v.cliente_id
GROUP BY cl.nombre
ORDER BY diferencia DESC;


-- ----------------------------------------------------------------------------
-- 3) Facturas afectadas que quedaron en total = 0.
--    Aparecieron varias en el listado (NE-000388, NE-000389, NE-000390,
--    NE-000424, NE-000438, NE-000643...). Un total de 0 no se explica por el
--    bug del precio: hay que ver si el pedido se despachó con cantidades en 0.
-- ----------------------------------------------------------------------------
SELECT v.numero_factura, cl.nombre AS cliente, p.numero_pedido,
       v.total, v.subtotal,
       (SELECT count(*) FROM venta_items vi WHERE vi.venta_id = v.id)  AS items_factura,
       (SELECT count(*) FROM pedido_items pi WHERE pi.pedido_id = p.id) AS items_pedido,
       (SELECT sum(COALESCE(pi.cantidad_alistada, pi.cantidad))
          FROM pedido_items pi WHERE pi.pedido_id = p.id)               AS cant_alistada
FROM ventas v
JOIN pedidos  p  ON p.id = v.pedido_id
JOIN clientes cl ON cl.id = v.cliente_id
WHERE v.total <= 0.01
ORDER BY v.created_at DESC;
