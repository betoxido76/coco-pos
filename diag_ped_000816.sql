-- ============================================================================
-- Revisar PED-000816 (Grupo Meraki) — precio del SKU 10012 aparentemente x2
--
-- Compara el precio guardado contra el precio de lista y el factor de la
-- unidad secundaria. Si el producto se pidió en UM2, precio = lista x factor
-- es el comportamiento correcto (el precio de la caja, no el de la unidad).
-- Si factor = 2, un "x2" es esperado y no es un error.
--
-- No modifica nada.
-- ============================================================================

SELECT pi.nombre_producto,
       pt.sku,

       -- lo pedido
       pi.cantidad,
       pi.unidad_venta,
       pi.cantidad_primaria,

       -- unidades del producto
       pt.unidad_medida       AS um1,
       pt.unidad_venta_2      AS um2,
       pt.factor_conversion_2 AS factor,

       -- precios
       pp.precio              AS precio_lista,
       pi.precio_unitario     AS precio_guardado,
       round((pi.precio_unitario / NULLIF(pp.precio, 0))::numeric, 4) AS veces_la_lista,

       -- coherencia de la línea
       pi.descuento_item,
       pi.subtotal,
       round((pi.cantidad * pi.precio_unitario
              * (1 - COALESCE(pi.descuento_item, 0) / 100.0))::numeric, 2) AS subtotal_recalculado,

       pt.aplica_iva
FROM pedidos p
JOIN pedido_items pi        ON pi.pedido_id = p.id
JOIN productos_terminados pt ON pt.id = pi.producto_id
LEFT JOIN producto_precios pp
       ON pp.producto_id = pi.producto_id
      AND pp.lista_id    = p.lista_precio_id
      AND pp.empresa_id  = p.empresa_id
WHERE p.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND p.numero_pedido = 'PED-000816'
ORDER BY pt.sku;


-- Cabecera del pedido: origen, lista de precios y descuento global
SELECT p.numero_pedido, p.origen, p.estado, p.fecha_pedido::date AS fecha,
       p.descuento_global, lp.nombre AS lista_precio, u.nombre AS vendedor
FROM pedidos p
LEFT JOIN listas_precio lp ON lp.id = p.lista_precio_id
LEFT JOIN usuarios u       ON u.id = p.vendedor_id
WHERE p.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND p.numero_pedido = 'PED-000816';
