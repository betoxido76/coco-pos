-- ============================================================================
-- Desambiguar el conteo de "cobros cubren total"
--
-- El filtro `cobrado >= total - 0.01` se cumple trivialmente cuando total = 0,
-- así que una factura en $0 sin cobros se contaba como "cubierta". Esto separa
-- los tres casos reales:
--
--   a) total = 0            → factura de cortesía/muestra, nada que cobrar
--   b) cobrada de verdad    → tiene cobros que cubren un total > 0
--   c) sin respaldo         → total > 0 y los cobros no lo cubren
--
-- El caso (b) dentro de estado 'pendiente' sería el hallazgo grave: plata
-- cobrada que sigue reportándose como cartera por cobrar.
--
-- Empresa: Grupo Meraki C.A. — bee65e82-665d-460b-b0b6-7006d3524744
-- ============================================================================

WITH v AS (
    SELECT ventas.id, ventas.numero_factura, ventas.total, ventas.estado_cobro,
           ventas.created_at, ventas.cliente_id,
           coalesce((SELECT sum(c.monto_usd + c.monto_bs / nullif(c.tasa_cambio, 0))
                     FROM cobros c WHERE c.venta_id = ventas.id), 0) AS cobrado
    FROM ventas
    WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
)
SELECT estado_cobro,
       CASE
         WHEN total <= 0.01                  THEN 'a) factura en $0'
         WHEN cobrado >= total - 0.01        THEN 'b) cobrada de verdad'
         ELSE                                     'c) sin respaldo en cobros'
       END AS caso,
       count(*)   AS facturas,
       sum(total) AS monto
FROM v
GROUP BY 1, 2
ORDER BY 1, 2;


-- ----------------------------------------------------------------------------
-- Si el caso (b) aparece bajo 'pendiente', listarlas: son facturas cobradas
-- que siguen figurando como cartera.
-- ----------------------------------------------------------------------------
WITH v AS (
    SELECT ventas.id, ventas.numero_factura, ventas.total, ventas.created_at,
           ventas.cliente_id,
           coalesce((SELECT sum(c.monto_usd + c.monto_bs / nullif(c.tasa_cambio, 0))
                     FROM cobros c WHERE c.venta_id = ventas.id), 0) AS cobrado
    FROM ventas
    WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
      AND estado_cobro = 'pendiente'
)
SELECT v.numero_factura, cl.nombre AS cliente, v.created_at::date AS emision,
       v.total, round(v.cobrado::numeric, 2) AS cobrado
FROM v
JOIN clientes cl ON cl.id = v.cliente_id
WHERE v.total > 0.01
  AND v.cobrado >= v.total - 0.01
ORDER BY v.created_at DESC;
