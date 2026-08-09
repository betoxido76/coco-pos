-- ============================================================================
-- Reconstruir los cobros faltantes de las ventas de contado
--
-- Diagnóstico (Grupo Meraki, bee65e82-...): 61 facturas marcadas 'pagado' sin
-- ninguna fila en `cobros`, por $5.980,57, entre 2026-05-25 y 2026-07-30.
-- Causa: Pedidos.jsx → "Convertir en factura" marcaba la venta pagada sin
-- registrar el cobro. Ya corregido; esto solo repara el histórico.
--
-- QUÉ SE PUEDE RECUPERAR Y QUÉ NO
--   Recuperable: el monto (= total de la factura) y la fecha (= emisión; eran
--   ventas de contado, se pagaban al emitirse).
--   NO recuperable: si el pago fue en USD o en Bs., el método, y la cuenta
--   bancaria. `ventas.pago_usd` y `pago_bs` están en 0 en los 61 casos.
--
-- Por eso se registra el total en USD con método 'Efectivo' — una suposición,
-- marcada explícitamente en la nota para que sea distinguible de un cobro real
-- y reversible (ver el paso 4).
--
-- La tasa es solo informativa: con monto_bs = 0 no afecta el equivalente en USD
-- (cobroEnUsd = monto_usd + monto_bs/tasa). Se usa la BCV vigente más cercana
-- a la fecha de emisión.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Vista previa. Confirmar que son 61 y que los montos cuadran.
-- ----------------------------------------------------------------------------
SELECT v.numero_factura, cl.nombre AS cliente, v.created_at::date AS emision,
       v.total AS monto_a_registrar,
       COALESCE(
           (SELECT t.tasa_bcv FROM tasas_cambio t
             WHERE t.empresa_id = v.empresa_id AND t.fecha <= v.created_at::date
             ORDER BY t.fecha DESC LIMIT 1),
           (SELECT cfg.valor::numeric FROM configuracion cfg
             WHERE cfg.empresa_id = v.empresa_id AND cfg.clave = 'tasa_bcv'),
           1
       ) AS tasa_a_usar
FROM ventas v
JOIN clientes cl ON cl.id = v.cliente_id
WHERE v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND v.estado_cobro = 'pagado'
  AND v.total > 0.01
  AND NOT EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id)
ORDER BY v.created_at;


-- ----------------------------------------------------------------------------
-- PASO 2 — Totales de control. Deben dar 61 facturas y 5980.57.
-- ----------------------------------------------------------------------------
SELECT count(*) AS facturas, sum(v.total) AS monto
FROM ventas v
WHERE v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND v.estado_cobro = 'pagado'
  AND v.total > 0.01
  AND NOT EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id);


-- ----------------------------------------------------------------------------
-- PASO 3 — El insert. Descomentar para ejecutar.
--   Idempotente: el NOT EXISTS impide duplicar si se corre dos veces.
-- ----------------------------------------------------------------------------
-- INSERT INTO cobros (
--     venta_id, empresa_id, usuario_id,
--     monto_usd, monto_bs, tasa_cambio, tipo_tasa,
--     metodo_usd, metodo_bs, fecha_cobro, nota, contribuyente_especial
-- )
-- SELECT v.id, v.empresa_id, v.usuario_id,
--        v.total, 0,
--        COALESCE(
--            (SELECT t.tasa_bcv FROM tasas_cambio t
--              WHERE t.empresa_id = v.empresa_id AND t.fecha <= v.created_at::date
--              ORDER BY t.fecha DESC LIMIT 1),
--            (SELECT cfg.valor::numeric FROM configuracion cfg
--              WHERE cfg.empresa_id = v.empresa_id AND cfg.clave = 'tasa_bcv'),
--            1
--        ),
--        'tasa_bcv',
--        'Efectivo', NULL,
--        v.created_at,
--        'Cobro reconstruido — venta de contado sin registro (backfill)',
--        cl.contribuyente_especial
-- FROM ventas v
-- JOIN clientes cl ON cl.id = v.cliente_id
-- WHERE v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
--   AND v.estado_cobro = 'pagado'
--   AND v.total > 0.01
--   AND NOT EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id);


-- ----------------------------------------------------------------------------
-- PASO 4 — Verificar. No deben quedar facturas pagadas sin respaldo.
-- ----------------------------------------------------------------------------
SELECT count(*) AS pagadas_sin_respaldo
FROM ventas v
WHERE v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
  AND v.estado_cobro = 'pagado'
  AND v.total > 0.01
  AND NOT EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id);


-- ----------------------------------------------------------------------------
-- DESHACER (solo si algo salió mal). La nota los identifica sin ambigüedad.
-- ----------------------------------------------------------------------------
-- DELETE FROM cobros
-- WHERE nota = 'Cobro reconstruido — venta de contado sin registro (backfill)';
