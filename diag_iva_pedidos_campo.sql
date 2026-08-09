-- ============================================================================
-- ¿El IVA de los pedidos de campo se aplicó según aplica_iva?
--
-- Contexto: el commit c759053 (2026-05-17) hizo condicional la división entre
-- 1.16 en NuevoPedido. Antes dividía SIEMPRE. PED-000816 es del 2026-08-07 y
-- aun así dividió productos con aplica_iva = false.
--
-- Dos hipótesis:
--   A) El aplica_iva de esos productos era TRUE cuando se tomó el pedido y se
--      cambió a FALSE después. → problema de datos/proceso.
--   B) Algún camino del código ignora aplica_iva. → problema de código.
--
-- Cómo leer la consulta 1:
--   · aplica_iva=false SOLO como 'dividido'            → hipótesis B
--   · aplica_iva=false 'dividido' hasta cierta fecha y
--     'sin dividir' después (o al revés)               → hipótesis A, y el
--     corte de fechas dice cuándo cambió
--
-- Ninguna consulta modifica datos.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Pedidos de campo posteriores al arreglo del IVA: cómo se trató cada línea
--    según el aplica_iva ACTUAL del producto.
-- ----------------------------------------------------------------------------
WITH it AS (
    SELECT pt.aplica_iva,
           p.fecha_pedido,
           pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
                                * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0) AS ratio
    FROM pedido_items pi
    JOIN pedidos p                ON p.id = pi.pedido_id
    JOIN productos_terminados pt  ON pt.id = pi.producto_id
    WHERE p.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
      AND p.origen = 'campo'
      AND p.fecha_pedido >= '2026-05-17'
)
SELECT aplica_iva,
       CASE WHEN ratio BETWEEN 1.158 AND 1.162 THEN 'dividido /1.16'
            WHEN ratio BETWEEN 0.998 AND 1.002 THEN 'sin dividir'
            ELSE 'otro (' || round(ratio::numeric, 2) || ')' END AS trato,
       count(*)                 AS lineas,
       min(fecha_pedido)::date  AS desde,
       max(fecha_pedido)::date  AS hasta
FROM it
GROUP BY 1, 2
ORDER BY 1, 2;


-- ----------------------------------------------------------------------------
-- 2) Detalle por producto exento: si un mismo SKU aparece dividido y sin
--    dividir, la frontera de fechas marca cuándo le cambiaron el aplica_iva.
-- ----------------------------------------------------------------------------
WITH it AS (
    SELECT pt.sku, pt.nombre, pt.aplica_iva, p.fecha_pedido,
           pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
                                * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0) AS ratio
    FROM pedido_items pi
    JOIN pedidos p                ON p.id = pi.pedido_id
    JOIN productos_terminados pt  ON pt.id = pi.producto_id
    WHERE p.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
      AND p.origen = 'campo'
      AND p.fecha_pedido >= '2026-05-17'
      AND pt.aplica_iva IS FALSE
)
SELECT sku, nombre,
       count(*) FILTER (WHERE ratio BETWEEN 1.158 AND 1.162) AS dividido,
       count(*) FILTER (WHERE ratio BETWEEN 0.998 AND 1.002) AS sin_dividir,
       max(fecha_pedido) FILTER (WHERE ratio BETWEEN 1.158 AND 1.162)::date AS ultimo_dividido,
       min(fecha_pedido) FILTER (WHERE ratio BETWEEN 0.998 AND 1.002)::date AS primero_sin_dividir
FROM it
GROUP BY sku, nombre
ORDER BY dividido DESC;


-- ----------------------------------------------------------------------------
-- 3) Cuántos productos están hoy exentos, para dimensionar el impacto.
-- ----------------------------------------------------------------------------
SELECT aplica_iva, count(*) AS productos
FROM productos_terminados
WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
GROUP BY 1
ORDER BY 1;
