-- ============================================================================
-- Cuentas por Pagar — Descuento al pagar (Opción A) + limpieza de registros
-- trabados por el bug del descuento.
--
-- Contexto: al registrar un pago con descuento, el sistema intentaba guardar el
-- descuento como una fila en pagos_proveedor (metodo_usd='descuento'). Ese insert
-- fallaba en silencio, así que la factura quedaba 'parcial' con un saldo igual al
-- descuento, en vez de cerrarse como 'pagado'.
--
-- Nuevo modelo: el descuento reduce el valor de la factura via compras.descuento_pago.
--   saldo  = total - descuento_pago - SUM(pagos_proveedor.monto_usd)
--   estado = 'pagado' cuando los pagos cubren (total - descuento_pago)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Columna nueva (SEGURO de correr ya; idempotente).
-- ----------------------------------------------------------------------------
ALTER TABLE compras
    ADD COLUMN IF NOT EXISTS descuento_pago numeric DEFAULT 0;


-- ----------------------------------------------------------------------------
-- PASO 2 — DIAGNÓSTICO (solo lectura). Reemplaza <EMPRESA_ID>.
--
-- Lista las compras a crédito que quedaron 'parcial'. OJO: tras el bug, una
-- factura trabada por descuento es indistinguible de un parcial legítimo, porque
-- la fila de descuento nunca se guardó. Por eso esta limpieza es MANUAL: revisa
-- cada caso con el cliente y decide cuáles eran descuentos.
-- ----------------------------------------------------------------------------
SELECT
    c.id,
    c.numero_doc,
    pr.nombre                                   AS proveedor,
    c.total,
    COALESCE(SUM(pp.monto_usd), 0)              AS pagado,
    c.total - COALESCE(SUM(pp.monto_usd), 0)    AS saldo_pendiente,
    ROUND(100 * (c.total - COALESCE(SUM(pp.monto_usd), 0)) / NULLIF(c.total, 0), 1)
                                                AS pct_saldo,   -- ¿coincide con un % de descuento redondo?
    c.fecha_compra
FROM compras c
LEFT JOIN proveedores pr      ON pr.id = c.proveedor_id
LEFT JOIN pagos_proveedor pp  ON pp.compra_id = c.id
WHERE c.empresa_id   = '<EMPRESA_ID>'
  AND c.condicion_pago = 'credito'
  AND c.estado_cobro   = 'parcial'
GROUP BY c.id, c.numero_doc, pr.nombre, c.total, c.fecha_compra
ORDER BY c.fecha_compra DESC;


-- ----------------------------------------------------------------------------
-- PASO 3 — LIMPIEZA por registro (revisar antes de ejecutar).
--
-- Para una factura que en realidad fue descontada por completo: el saldo que
-- quedó pendiente ERA el descuento. Lo movemos a descuento_pago y la cerramos.
-- Reemplaza <COMPRA_ID> y <SALDO_PENDIENTE> (columna saldo_pendiente del paso 2).
-- ----------------------------------------------------------------------------
-- UPDATE compras
-- SET descuento_pago = <SALDO_PENDIENTE>,
--     estado_cobro   = 'pagado'
-- WHERE id = '<COMPRA_ID>';

-- Caso parcial real + descuento parcial (raro): poner solo el monto descontado.
-- UPDATE compras
-- SET descuento_pago = <MONTO_DESCUENTO>,
--     estado_cobro   = CASE WHEN <PAGADO> >= c.total - <MONTO_DESCUENTO> - 0.01
--                           THEN 'pagado' ELSE 'parcial' END
-- WHERE id = '<COMPRA_ID>';
