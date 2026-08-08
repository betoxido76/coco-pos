-- ============================================================================
-- Diagnóstico: facturas 'pagado' sin ninguna fila en `cobros`
--
-- Síntoma reportado: en CxC → Pagadas salen facturas con Cobrado $0.00 y saldo
-- igual al total. La columna Cobrado/Saldo se calculaba SOLO desde `cobros`, y
-- hay dos rutas que marcan una venta como pagada sin insertar nada ahí:
--
--   1. Venta de CONTADO creada por la app (Ventas.jsx, Pedidos.jsx):
--      estado_cobro='pagado' de entrada, sin fila en cobros y sin pago_usd/bs.
--   2. Venta MIGRADA del POS anterior (migrate_pos.py):
--      estado_cobro='pagado' fijo, con el monto en ventas.pago_usd/pago_bs.
--
-- Este script separa ambos casos para saber cuál aplica.
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
-- 2) Cuántas facturas 'pagado' del cliente no tienen cobros, y de qué tipo
--    - "migrada con pago"  → recuperable desde ventas.pago_usd/pago_bs
--    - "contado sin rastro" → solo queda el estado_cobro
-- ----------------------------------------------------------------------------
SELECT CASE
         WHEN coalesce(v.pago_usd, 0) > 0 OR coalesce(v.pago_bs, 0) > 0
           THEN 'migrada con pago en la venta'
         ELSE 'contado sin registro de pago'
       END AS tipo,
       count(*) AS facturas,
       sum(v.total) AS monto_total,
       min(v.created_at)::date AS desde,
       max(v.created_at)::date AS hasta
FROM ventas v
WHERE v.cliente_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND v.estado_cobro = 'pagado'
  AND NOT EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id)
GROUP BY 1;


-- ----------------------------------------------------------------------------
-- 3) Lo mismo a nivel de toda la empresa, para dimensionar el alcance
-- ----------------------------------------------------------------------------
SELECT v.estado_cobro,
       (EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id)) AS tiene_cobros,
       (coalesce(v.pago_usd, 0) > 0 OR coalesce(v.pago_bs, 0) > 0) AS tiene_pago_en_venta,
       count(*) AS facturas,
       sum(v.total) AS monto
FROM ventas v
WHERE v.empresa_id = (SELECT empresa_id FROM clientes
                      WHERE id = 'bee65e82-665d-460b-b0b6-7006d3524744')
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
