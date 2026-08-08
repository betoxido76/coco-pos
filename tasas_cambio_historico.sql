-- ============================================================================
-- Histórico de tasas de cambio por fecha
--
-- Contexto: las tasas vivían solo en `configuracion` (clave/valor por empresa),
-- que guarda UNA foto del valor vigente. Al registrar un cobro de hace 2–3 días
-- el sistema aplicaba la tasa de HOY, distorsionando el equivalente en USD.
--
-- Diseño: una fila por (empresa_id, fecha) con las 3 tasas del día. La pantalla
-- de cobro pide la fecha del pago y trae las tasas de ESA fecha.
--
-- `configuracion` NO se elimina: 8 módulos leen de ahí la tasa "vigente"
-- (Ventas, Compras, Gastos, CxP, Bancos, Finanzas, NuevoPedido, CxC). La
-- pantalla de Administración → Tasas de Cambio sigue sincronizándola cuando se
-- guarda la fecha más reciente, para que esos módulos no cambien.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Tabla de histórico. UNIQUE(empresa_id, fecha) permite el upsert:
-- volver a guardar una fecha ya cargada sobreescribe sus valores.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasas_cambio (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      uuid NOT NULL REFERENCES empresas(id),
    fecha           date NOT NULL,
    tasa_bcv        numeric,
    tasa_euro       numeric,
    tasa_binance    numeric,
    usuario_id      uuid,
    created_at      timestamptz DEFAULT now(),
    actualizado_at  timestamptz DEFAULT now(),
    CONSTRAINT tasas_cambio_empresa_fecha_key UNIQUE (empresa_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_tasas_cambio_empresa_fecha
    ON tasas_cambio (empresa_id, fecha DESC);


-- ----------------------------------------------------------------------------
-- PASO 2 — RLS (patrón estándar del proyecto: get_empresa_id() + is_superadmin()).
-- ----------------------------------------------------------------------------
ALTER TABLE tasas_cambio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasas_cambio_select ON tasas_cambio;
CREATE POLICY tasas_cambio_select ON tasas_cambio
    FOR SELECT USING (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS tasas_cambio_insert ON tasas_cambio;
CREATE POLICY tasas_cambio_insert ON tasas_cambio
    FOR INSERT WITH CHECK (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS tasas_cambio_update ON tasas_cambio;
CREATE POLICY tasas_cambio_update ON tasas_cambio
    FOR UPDATE USING (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS tasas_cambio_delete ON tasas_cambio;
CREATE POLICY tasas_cambio_delete ON tasas_cambio
    FOR DELETE USING (empresa_id = get_empresa_id() OR is_superadmin());


-- ----------------------------------------------------------------------------
-- PASO 3 — Sembrar el día de hoy con las tasas vigentes de `configuracion`.
-- Sin esto, el primer cobro del día quedaría bloqueado por falta de tasas.
-- ON CONFLICT DO NOTHING: re-ejecutar el script no pisa lo ya cargado.
-- ----------------------------------------------------------------------------
INSERT INTO tasas_cambio (empresa_id, fecha, tasa_bcv, tasa_euro, tasa_binance)
SELECT empresa_id,
       CURRENT_DATE,
       MAX(CASE WHEN clave = 'tasa_bcv'     THEN valor::numeric END),
       MAX(CASE WHEN clave = 'tasa_euro'    THEN valor::numeric END),
       MAX(CASE WHEN clave = 'tasa_binance' THEN valor::numeric END)
FROM configuracion
WHERE empresa_id IS NOT NULL
  AND clave IN ('tasa_bcv', 'tasa_euro', 'tasa_binance')
GROUP BY empresa_id
ON CONFLICT (empresa_id, fecha) DO NOTHING;


-- ----------------------------------------------------------------------------
-- PASO 4 — Verificar
-- ----------------------------------------------------------------------------
SELECT e.nombre, t.fecha, t.tasa_bcv, t.tasa_euro, t.tasa_binance
FROM tasas_cambio t
JOIN empresas e ON e.id = t.empresa_id
ORDER BY e.nombre, t.fecha DESC;
