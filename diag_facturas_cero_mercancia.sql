-- ============================================================================
-- Facturas en $0 con mercancía despachada
--
-- Causa (corregida en el commit siguiente): en Pedidos.jsx el botón "Convertir
-- en factura" no estaba deshabilitado mientras cargaban los ítems. Al hacer
-- clic antes de tiempo, `items` estaba vacío → la venta se creaba con total 0 y
-- sin líneas, pero el pedido igual pasaba a 'facturado' y el stock se descontó.
-- Ventas.jsx sí tenía la guarda (`disabled={procesando || loading}`).
--
-- Hay dos grupos y NO deben mezclarse:
--   a) Intencionales: clientes MUESTRAS / Obsequio → precio 0 a propósito.
--   b) Anómalas: clientes reales con mercancía alistada y factura vacía.
--
-- Ninguna consulta modifica datos.
-- Empresa: Grupo Meraki C.A. — bee65e82-665d-460b-b0b6-7006d3524744
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Separar los dos grupos y valorar la mercancía al precio del pedido.
--    `valor_pedido` sale de pedido_items.subtotal, que sí quedó bien guardado.
-- ----------------------------------------------------------------------------
WITH cero AS (
    SELECT v.id AS venta_id, v.numero_factura, v.created_at,
           p.id AS pedido_id, p.numero_pedido,
           cl.nombre AS cliente,
           (SELECT count(*) FROM venta_items vi WHERE vi.venta_id = v.id) AS items_factura,
           (SELECT COALESCE(sum(pi.subtotal), 0) FROM pedido_items pi
             WHERE pi.pedido_id = p.id)                                    AS valor_pedido
    FROM ventas v
    JOIN pedidos  p  ON p.id = v.pedido_id
    JOIN clientes cl ON cl.id = v.cliente_id
    WHERE v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
      AND v.total <= 0.01
)
SELECT CASE WHEN cliente ILIKE '%muestra%' OR cliente ILIKE '%obsequio%'
            THEN 'a) muestras / obsequios (intencional)'
            ELSE 'b) cliente real — revisar' END AS grupo,
       count(*)                            AS facturas,
       round(sum(valor_pedido)::numeric, 2) AS valor_despachado,
       count(*) FILTER (WHERE items_factura = 0) AS facturas_sin_lineas
FROM cero
GROUP BY 1
ORDER BY 1;


-- ----------------------------------------------------------------------------
-- 2) El detalle del grupo (b), ordenado por lo que está en juego.
--    Son las candidatas a refacturar.
-- ----------------------------------------------------------------------------
WITH cero AS (
    SELECT v.numero_factura, v.created_at, v.estado_cobro,
           p.numero_pedido, p.id AS pedido_id,
           cl.nombre AS cliente,
           (SELECT count(*) FROM venta_items vi WHERE vi.venta_id = v.id) AS items_factura,
           (SELECT COALESCE(sum(pi.subtotal), 0) FROM pedido_items pi
             WHERE pi.pedido_id = p.id)                                    AS valor_pedido
    FROM ventas v
    JOIN pedidos  p  ON p.id = v.pedido_id
    JOIN clientes cl ON cl.id = v.cliente_id
    WHERE v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
      AND v.total <= 0.01
)
SELECT numero_factura, numero_pedido, cliente, created_at::date AS fecha,
       items_factura, round(valor_pedido::numeric, 2) AS valor_despachado, estado_cobro
FROM cero
WHERE cliente NOT ILIKE '%muestra%' AND cliente NOT ILIKE '%obsequio%'
ORDER BY valor_pedido DESC;


-- ----------------------------------------------------------------------------
-- 3) ¿Sigue ocurriendo? Facturas en $0 de los últimos 30 días.
--    Tras el arreglo del botón no deberían aparecer nuevas con cliente real.
-- ----------------------------------------------------------------------------
SELECT v.numero_factura, cl.nombre AS cliente, v.created_at::date AS fecha, v.total
FROM ventas v
JOIN clientes cl ON cl.id = v.cliente_id
WHERE v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND v.total <= 0.01
  AND v.created_at >= now() - interval '30 days'
ORDER BY v.created_at DESC;
