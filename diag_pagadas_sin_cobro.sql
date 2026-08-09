-- ============================================================================
-- Diagnóstico: facturas 'pagado' sin ninguna fila en `cobros`
--
-- Síntoma reportado: en CxC → Pagadas salen facturas con Cobrado $0.00 y saldo
-- igual al total. La columna Cobrado/Saldo se calculaba SOLO desde `cobros`, y
-- una factura de contado puede quedar 'pagado' con cobros en 0 por tres vías:
--
--   1. COBRO EN CERO: Ventas.jsx (facturar pedido / venta retail) sí insertaba
--      la fila en `cobros`, pero con los montos del formulario, que son
--      opcionales. Si se dejaban en blanco quedaba un cobro de 0.
--   2. SIN FILA: Pedidos.jsx → "Convertir en factura" no insertaba nada.
--   3. MIGRADA del POS anterior (migrate_pos.py): estado_cobro='pagado' fijo,
--      con el monto en ventas.pago_usd/pago_bs y sin filas en `cobros`.
--
-- Los tres quedan corregidos hacia adelante; este script mide el histórico.
-- ============================================================================

-- Cliente del reporte: bee65e82-665d-460b-b0b6-7006d3524744


-- ----------------------------------------------------------------------------
-- 1) El caso puntual: NE-000028
--    (numero_factura puede estar guardado como FAC-000028 y mostrarse como NE-)
-- ----------------------------------------------------------------------------
SELECT v.numero_factura, v.estado_cobro, v.total,
       v.pago_usd, v.pago_bs, v.tasa_cambio, v.metodo_usd, v.metodo_bs,
       v.created_at, v.pedido_id,
       (SELECT count(*) FROM cobros c WHERE c.venta_id = v.id) AS filas_en_cobros
FROM ventas v
WHERE v.cliente_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND v.numero_factura IN ('NE-000028', 'FAC-000028');


-- ----------------------------------------------------------------------------
-- 2) Facturas 'pagado' del cliente cuyo cobrado registrado no llega al total,
--    clasificadas por causa. `cobrado` replica cobroEnUsd() del front:
--    monto_usd + monto_bs / tasa_cambio.
-- ----------------------------------------------------------------------------
WITH v AS (
    SELECT ventas.*,
           (SELECT count(*) FROM cobros c WHERE c.venta_id = ventas.id) AS n_cobros,
           coalesce((SELECT sum(c.monto_usd + c.monto_bs / nullif(c.tasa_cambio, 0))
                     FROM cobros c WHERE c.venta_id = ventas.id), 0) AS cobrado
    FROM ventas
    WHERE cliente_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
      AND estado_cobro = 'pagado'
)
SELECT CASE
         WHEN n_cobros > 0                                     THEN '1. cobro registrado en 0'
         WHEN coalesce(pago_usd,0) > 0 OR coalesce(pago_bs,0) > 0 THEN '3. migrada (pago en la venta)'
         ELSE                                                       '2. sin fila en cobros'
       END AS causa,
       count(*) AS facturas,
       sum(total) AS monto_total,
       min(created_at)::date AS desde,
       max(created_at)::date AS hasta
FROM v
WHERE cobrado < total - 0.01
GROUP BY 1
ORDER BY 1;


-- ----------------------------------------------------------------------------
-- 3) Lo mismo a nivel de toda la empresa, para dimensionar el alcance
-- ----------------------------------------------------------------------------
SELECT v.estado_cobro,
       (EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id)) AS tiene_cobros,
       coalesce((SELECT sum(c.monto_usd + c.monto_bs / nullif(c.tasa_cambio, 0))
                 FROM cobros c WHERE c.venta_id = v.id), 0) >= v.total - 0.01 AS cobros_cubren_total,
       (coalesce(v.pago_usd, 0) > 0 OR coalesce(v.pago_bs, 0) > 0) AS tiene_pago_en_venta,
       count(*) AS facturas,
       sum(v.total) AS monto
FROM ventas v
WHERE v.empresa_id = (SELECT empresa_id FROM clientes
                      WHERE id = 'bee65e82-665d-460b-b0b6-7006d3524744')
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;
