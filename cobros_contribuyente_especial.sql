-- ============================================================================
-- Estatus de contribuyente especial congelado en cada cobro
--
-- `clientes.contribuyente_especial` ya existe y es editable desde
-- Administración → Clientes, pero es el estatus ACTUAL: si un cliente cambia de
-- condición, un reporte que haga JOIN contra `clientes` reescribiría el pasado.
--
-- Para reportes se necesita el estatus que aplicaba EN EL MOMENTO DEL PAGO, así
-- que se copia a `cobros` al insertar cada abono.
--
-- Nullable a propósito: NULL = "no se registró" (cobros anteriores a este
-- cambio). No usar DEFAULT false, porque afirmaría que el cliente no era
-- contribuyente especial cuando en realidad no se sabe.
-- ============================================================================

ALTER TABLE cobros
    ADD COLUMN IF NOT EXISTS contribuyente_especial boolean;

COMMENT ON COLUMN cobros.contribuyente_especial IS
    'Estatus del cliente al momento del pago (snapshot de clientes.contribuyente_especial). NULL = no registrado.';

-- Índice para reportes que agrupen por estatus dentro de un rango de fechas
CREATE INDEX IF NOT EXISTS idx_cobros_empresa_fecha
    ON cobros (empresa_id, fecha_cobro);


-- ----------------------------------------------------------------------------
-- Verificar
-- ----------------------------------------------------------------------------
SELECT count(*) AS cobros_totales,
       count(contribuyente_especial) AS con_estatus,
       count(*) - count(contribuyente_especial) AS sin_estatus_historicos
FROM cobros;
