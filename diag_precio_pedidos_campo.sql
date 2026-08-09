-- ============================================================================
-- Pedidos de campo con precio_unitario guardado sin IVA
--
-- Bug (corregido en el commit ef280f6): NuevoPedido.jsx insertaba
--     precio_unitario = precio / 1.16   (cuando el producto aplica IVA)
-- mientras que `subtotal` sí se calculaba con el precio completo:
--     subtotal = cantidad * precio * (1 - desc/100)
--
-- Esa incoherencia dentro de la misma fila es lo que permite detectar los casos
-- con certeza, sin heurísticas:
--
--     ratio = subtotal / (cantidad * precio_unitario * (1 - desc/100))
--
--     ratio ≈ 1.16  → fila afectada (precio dividido)
--     ratio ≈ 1.00  → fila correcta
--
-- Ninguna consulta de este script modifica datos. El UPDATE va comentado.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Alcance por empresa y estado del pedido.
--    El estado importa: un pedido ya facturado arrastró el precio malo a la
--    factura, y eso NO se arregla corrigiendo pedido_items (ver consulta 3).
-- ----------------------------------------------------------------------------
-- Nota: columnas explícitas, no `pi.*`. `pedido_items` y `pedidos` tienen ambas
-- una columna `empresa_id`, y con el asterisco la CTE queda con el nombre
-- duplicado → "column reference empresa_id is ambiguous".
WITH it AS (
    SELECT pi.pedido_id,
           pi.subtotal,
           p.empresa_id AS emp_id,
           p.estado,
           pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
                                * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0) AS ratio
    FROM pedido_items pi
    JOIN pedidos p ON p.id = pi.pedido_id
)
SELECT e.nombre AS empresa, it.estado,
       count(*)                            AS items_afectados,
       count(DISTINCT it.pedido_id)        AS pedidos,
       round(sum(it.subtotal)::numeric, 2) AS subtotal_afectado
FROM it
JOIN empresas e ON e.id = it.emp_id
WHERE it.ratio BETWEEN 1.158 AND 1.162
GROUP BY e.nombre, it.estado
ORDER BY e.nombre, it.estado;


-- ----------------------------------------------------------------------------
-- 2) Control de sanidad: distribución completa de ratios.
--    Debe verse un grupo en ~1.00 (correctos) y otro en ~1.16 (afectados).
--    Cualquier otro valor merece revisión antes de tocar nada.
-- ----------------------------------------------------------------------------
WITH it AS (
    SELECT pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
                                * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0) AS ratio
    FROM pedido_items pi
)
SELECT round(ratio::numeric, 2) AS ratio, count(*) AS items
FROM it
WHERE ratio IS NOT NULL
GROUP BY 1
ORDER BY 1;


-- ----------------------------------------------------------------------------
-- 3) LO MÁS IMPORTANTE: pedidos afectados que YA se facturaron.
--    Esas facturas se emitieron con el precio bajo. Corregir pedido_items no
--    las toca: la venta ya tiene su propio total. Es decisión de negocio
--    (renegociar, nota de débito, o asumirlo).
-- ----------------------------------------------------------------------------
WITH afectados AS (
    SELECT DISTINCT pi.pedido_id
    FROM pedido_items pi
    WHERE pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
                               * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0)
          BETWEEN 1.158 AND 1.162
)
SELECT p.numero_pedido, cl.nombre AS cliente, p.fecha_pedido::date AS fecha,
       p.estado, v.numero_factura, v.total AS total_facturado, v.estado_cobro
FROM afectados a
JOIN pedidos  p  ON p.id = a.pedido_id
JOIN clientes cl ON cl.id = p.cliente_id
LEFT JOIN ventas v ON v.pedido_id = p.id
WHERE v.id IS NOT NULL
ORDER BY p.fecha_pedido DESC;


-- ----------------------------------------------------------------------------
-- 4) LA CORRECCIÓN — solo pedidos AÚN NO FACTURADOS.
--    Se excluyen facturado/despachado a propósito: cambiar el precio de un
--    pedido ya facturado lo dejaría inconsistente con su factura.
--    Descomentar para ejecutar.
-- ----------------------------------------------------------------------------
-- UPDATE pedido_items pi
-- SET precio_unitario = round((pi.precio_unitario * 1.16)::numeric, 4)
-- FROM pedidos p
-- WHERE p.id = pi.pedido_id
--   AND p.estado NOT IN ('facturado', 'despachado', 'anulado', 'rechazado')
--   AND pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
--                            * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0)
--       BETWEEN 1.158 AND 1.162;


-- ----------------------------------------------------------------------------
-- 5) Verificar. Tras el UPDATE no deben quedar afectados en pedidos abiertos.
-- ----------------------------------------------------------------------------
SELECT p.estado, count(*) AS items_afectados
FROM pedido_items pi
JOIN pedidos p ON p.id = pi.pedido_id
WHERE pi.subtotal / NULLIF(pi.cantidad * pi.precio_unitario
                           * (1 - COALESCE(pi.descuento_item, 0) / 100.0), 0)
      BETWEEN 1.158 AND 1.162
GROUP BY p.estado
ORDER BY p.estado;


-- ----------------------------------------------------------------------------
-- DESHACER (si hiciera falta). Revierte solo lo que quedó en ratio ≈ 1.00
-- por efecto del UPDATE anterior; correr únicamente si se detecta un error.
-- ----------------------------------------------------------------------------
-- UPDATE pedido_items pi
-- SET precio_unitario = round((pi.precio_unitario / 1.16)::numeric, 4)
-- FROM pedidos p
-- WHERE p.id = pi.pedido_id
--   AND p.origen = 'campo'
--   AND p.estado NOT IN ('facturado', 'despachado', 'anulado', 'rechazado');
