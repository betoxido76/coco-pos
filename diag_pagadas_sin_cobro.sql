-- ============================================================================
-- Facturas marcadas 'pagado' sin respaldo suficiente en `cobros`
--
-- Tres vías producen ese estado (las tres ya corregidas hacia adelante):
--   1. COBRO EN CERO: Ventas.jsx insertaba la fila con los montos del
--      formulario, que son opcionales; en blanco quedaba un cobro de 0.
--   2. SIN FILA: Pedidos.jsx → "Convertir en factura" no insertaba nada.
--   3. MIGRADA del POS anterior: estado_cobro='pagado' fijo, con el monto en
--      ventas.pago_usd/pago_bs y sin filas en `cobros`.
--
-- Este script mide el histórico. No modifica nada.
--
-- NOTA: bee65e82-665d-460b-b0b6-7006d3524744 es un **empresa_id**, no un
-- cliente_id. La versión anterior lo buscaba en `clientes`, la subconsulta
-- devolvía NULL y todo salía vacío. Ahora se filtra directo por empresa.
-- ============================================================================

-- Empresa bajo análisis: bee65e82-665d-460b-b0b6-7006d3524744


-- ----------------------------------------------------------------------------
-- 0) ¿Cuántas empresas hay en la base? Los diagnósticos previos no filtraban
--    por empresa: si aquí hay más de una, esas cifras estaban infladas.
-- ----------------------------------------------------------------------------
SELECT e.id, e.nombre,
       (SELECT count(*) FROM ventas   v WHERE v.empresa_id = e.id) AS ventas,
       (SELECT count(*) FROM clientes c WHERE c.empresa_id = e.id) AS clientes
FROM empresas e
ORDER BY ventas DESC;


-- ----------------------------------------------------------------------------
-- 1) Panorama: todas las ventas por estado y por respaldo en `cobros`.
--    `cobrado` replica cobroEnUsd() del front: monto_usd + monto_bs/tasa.
-- ----------------------------------------------------------------------------
WITH v AS (
    SELECT ventas.id, ventas.total, ventas.estado_cobro, ventas.created_at,
           ventas.pago_usd, ventas.pago_bs, ventas.empresa_id,
           (SELECT count(*) FROM cobros c WHERE c.venta_id = ventas.id) AS n_cobros,
           coalesce((SELECT sum(c.monto_usd + c.monto_bs / nullif(c.tasa_cambio, 0))
                     FROM cobros c WHERE c.venta_id = ventas.id), 0) AS cobrado
    FROM ventas
    WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
)
SELECT estado_cobro,
       count(*)                                            AS facturas,
       count(*) FILTER (WHERE cobrado >= total - 0.01)      AS cobros_cubren_total,
       count(*) FILTER (WHERE cobrado < total - 0.01)       AS cobros_no_cubren,
       sum(total)                                           AS monto_total
FROM v
GROUP BY estado_cobro
ORDER BY estado_cobro;


-- ----------------------------------------------------------------------------
-- 2) EL NÚMERO QUE IMPORTA: facturas 'pagado' cuyo cobrado no llega al total,
--    clasificadas por causa.
-- ----------------------------------------------------------------------------
WITH v AS (
    SELECT ventas.id, ventas.total, ventas.created_at,
           ventas.pago_usd, ventas.pago_bs,
           (SELECT count(*) FROM cobros c WHERE c.venta_id = ventas.id) AS n_cobros,
           coalesce((SELECT sum(c.monto_usd + c.monto_bs / nullif(c.tasa_cambio, 0))
                     FROM cobros c WHERE c.venta_id = ventas.id), 0) AS cobrado
    FROM ventas
    WHERE estado_cobro = 'pagado'
      AND empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
)
SELECT CASE
         WHEN n_cobros > 0                                          THEN '1. cobro registrado en 0'
         WHEN coalesce(pago_usd,0) > 0 OR coalesce(pago_bs,0) > 0    THEN '3. migrada (pago en la venta)'
         ELSE                                                            '2. sin fila en cobros'
       END AS causa,
       count(*)              AS facturas,
       sum(total)            AS monto_sin_respaldo,
       min(created_at)::date AS desde,
       max(created_at)::date AS hasta
FROM v
WHERE cobrado < total - 0.01
GROUP BY 1
ORDER BY 1;


-- ----------------------------------------------------------------------------
-- 3) Muestra de 20 casos para revisar a mano antes de decidir el backfill
-- ----------------------------------------------------------------------------
SELECT v.numero_factura, cl.nombre AS cliente, v.created_at::date AS emision,
       v.total, v.pago_usd, v.pago_bs,
       (SELECT count(*) FROM cobros c WHERE c.venta_id = v.id) AS n_cobros
FROM ventas v
JOIN clientes cl ON cl.id = v.cliente_id
WHERE v.estado_cobro = 'pagado'
  AND v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND coalesce((SELECT sum(c.monto_usd + c.monto_bs / nullif(c.tasa_cambio, 0))
                FROM cobros c WHERE c.venta_id = v.id), 0) < v.total - 0.01
ORDER BY v.created_at DESC
LIMIT 20;
