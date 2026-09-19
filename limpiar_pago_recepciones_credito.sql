-- ============================================================================
-- Limpieza: montos de pago "fantasma" en recepciones A CRÉDITO.
--
-- La ventana de recepción de Compras guardaba pago_usd/pago_bs/metodo_* aunque
-- la condición fuera crédito (el campo USD venía prellenado con el total y el
-- Bs. se autollenaba). En una recepción a crédito esos campos NO son pagos: los
-- pagos reales viven en pagos_proveedor. Diagnóstico 2026-09-19: 100 recepciones
-- a crédito (5 empresas) con esos campos; en 98 el monto es exactamente el
-- total de la recepción, incluso en las que siguen pendientes o parciales.
-- Ninguna pantalla los lee hoy; se limpian para que ningún reporte futuro los
-- tome por pagos.
--
-- Desde el fix de la ventana (commit "pagos parciales...") la recepción a
-- crédito ya guarda 0/NULL, así que esto no se repite.
--
-- Correr en el SQL Editor de Supabase. Guarda respaldo antes de tocar nada.
-- ============================================================================

-- 1) Respaldo de los valores actuales
CREATE TABLE IF NOT EXISTS backup_compras_pago_credito_20260919 AS
SELECT id, empresa_id, numero_doc, total, estado_cobro,
       pago_usd, pago_bs, metodo_usd, metodo_bs, fecha_pago, now() AS respaldado_en
FROM compras
WHERE condicion_pago = 'credito'
  AND (COALESCE(pago_usd, 0) > 0 OR COALESCE(pago_bs, 0) > 0);

-- 2) Limpieza (solo recepciones a crédito; contado no se toca)
UPDATE compras
SET pago_usd = 0, pago_bs = 0, metodo_usd = NULL, metodo_bs = NULL, fecha_pago = NULL
WHERE condicion_pago = 'credito'
  AND (COALESCE(pago_usd, 0) > 0 OR COALESCE(pago_bs, 0) > 0);

-- 3) Verificación: debe devolver 0
SELECT count(*) AS quedan
FROM compras
WHERE condicion_pago = 'credito'
  AND (COALESCE(pago_usd, 0) > 0 OR COALESCE(pago_bs, 0) > 0);
