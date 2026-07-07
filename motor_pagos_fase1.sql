-- ============================================================================
-- Motor de pagos compartido — FASE 1 (Gastos)
--
-- Contexto: el módulo de Gastos no tenía pagos parciales (abonos). Al "pagar" un
-- gasto programado, ModalPagarGasto SOBREESCRIBÍA monto_usd/monto_bs con el abono
-- y forzaba estado='pagado', perdiendo el total original y saltándose el parcial.
--
-- Diseño (traído del patrón de CxP): la obligación (gasto) queda intacta y cada
-- abono es una fila en una tabla de pagos aparte. El estado se DERIVA:
--   saldo  = gastos.monto - SUM(pagos.monto_en_usd del gasto)
--   estado = 'pagado'  cuando los pagos cubren gastos.monto
--            'parcial' cuando hay abonos pero no cubren
--            'pendiente' cuando no hay abonos
--
-- La tabla `pagos` es GENÉRICA (origen_tipo/origen_id) y superconjunto de
-- pagos_proveedor, para que en Fase 2 compras migre a ella casi 1:1.
-- En Fase 1 SOLO se escribe origen_tipo='gasto'.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Tabla genérica de pagos (motor compartido).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    origen_tipo         text NOT NULL CHECK (origen_tipo IN ('gasto', 'compra')),
    origen_id           uuid NOT NULL,
    fecha               date NOT NULL DEFAULT CURRENT_DATE,
    monto_usd           numeric DEFAULT 0,
    monto_bs            numeric DEFAULT 0,
    tasa_cambio         numeric,
    tipo_tasa           text,
    metodo_usd          text,             -- gastos usan solo este; compras (Fase 2) usan ambos
    metodo_bs           text,
    cuenta_bancaria_id  uuid REFERENCES cuentas_bancarias(id),
    devolucion_id       uuid,             -- ND aplicada como pago (Fase 2)
    nota                text,
    usuario_id          uuid,
    created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_origen
    ON pagos (empresa_id, origen_tipo, origen_id);


-- ----------------------------------------------------------------------------
-- PASO 2 — RLS (patrón estándar del proyecto: get_empresa_id() + is_superadmin()).
-- ----------------------------------------------------------------------------
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pagos_select ON pagos;
CREATE POLICY pagos_select ON pagos
    FOR SELECT USING (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS pagos_insert ON pagos;
CREATE POLICY pagos_insert ON pagos
    FOR INSERT WITH CHECK (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS pagos_update ON pagos;
CREATE POLICY pagos_update ON pagos
    FOR UPDATE USING (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS pagos_delete ON pagos;
CREATE POLICY pagos_delete ON pagos
    FOR DELETE USING (empresa_id = get_empresa_id() OR is_superadmin());


-- ----------------------------------------------------------------------------
-- PASO 3 — Ampliar el estado de gastos para admitir 'parcial'.
--   Antes: CHECK IN ('pagado','pendiente')
--   Ahora: CHECK IN ('pagado','pendiente','parcial')
-- El nombre del constraint puede variar; se descubre y se reemplaza de forma
-- segura. Si tu constraint tiene otro nombre, ajústalo en el DROP.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    cons_name text;
BEGIN
    SELECT conname INTO cons_name
    FROM pg_constraint
    WHERE conrelid = 'gastos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%estado%'
      AND pg_get_constraintdef(oid) ILIKE '%pendiente%';

    IF cons_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE gastos DROP CONSTRAINT %I', cons_name);
    END IF;

    ALTER TABLE gastos
        ADD CONSTRAINT gastos_estado_check
        CHECK (estado IN ('pagado', 'pendiente', 'parcial'));
END $$;
