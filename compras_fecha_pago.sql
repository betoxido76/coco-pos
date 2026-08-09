-- ============================================================================
-- Fecha del pago en recepciones de contado
--
-- `compras` ya guardaba tasa_cambio / tipo_tasa / pago_usd / pago_bs, pero no
-- CUÁNDO se pagó: la tasa se tomaba siempre de la vigente del día en que se
-- registraba la recepción. Con la fecha explícita, la tasa se rige por ella,
-- igual que en CxC, CxP y Gastos.
--
-- Nullable: solo aplica al contado. A crédito el pago se registra después desde
-- Cuentas por Pagar, y allí la fecha vive en pagos_proveedor.fecha_pago.
--
-- `fecha_compra` no sirve para esto: es la fecha de la recepción de mercancía,
-- que no tiene por qué coincidir con la del pago.
-- ============================================================================

ALTER TABLE compras
    ADD COLUMN IF NOT EXISTS fecha_pago date;

COMMENT ON COLUMN compras.fecha_pago IS
    'Fecha real del pago en recepciones de contado; determina la tasa aplicada. NULL en crédito.';


-- ----------------------------------------------------------------------------
-- Verificar
-- ----------------------------------------------------------------------------
SELECT estado_cobro,
       count(*)             AS recepciones,
       count(fecha_pago)    AS con_fecha_pago
FROM compras
GROUP BY estado_cobro
ORDER BY estado_cobro;
