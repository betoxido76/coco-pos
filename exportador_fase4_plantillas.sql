-- ============================================================================
-- Exportador de datos — Fase 4a: plantillas guardadas (docs/plan-exportador.md).
--
-- Una plantilla guarda fuente, detalle, campos EN ORDEN, formato e "incluir
-- anulados". Los filtros NO: se toman del Dashboard al exportar.
--   alcance 'personal': solo la ve quien la creó
--   alcance 'empresa' : la ven todos los usuarios de la empresa
-- Cualquier usuario crea plantillas de ambos alcances (decisión 2026-10-03);
-- modificar o borrar: el creador, o un admin de la empresa.
-- ============================================================================

CREATE TABLE IF NOT EXISTS plantillas_exportacion (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES usuarios(id),
    nombre           text NOT NULL CHECK (length(trim(nombre)) > 0),
    fuente           text NOT NULL,
    modo             text NOT NULL CHECK (modo IN ('documento', 'producto')),
    campos           jsonb NOT NULL CHECK (jsonb_typeof(campos) = 'array'),
    formato          text NOT NULL DEFAULT 'xlsx' CHECK (formato IN ('xlsx', 'csv', 'txt')),
    incluir_anulados boolean NOT NULL DEFAULT false,
    alcance          text NOT NULL DEFAULT 'personal' CHECK (alcance IN ('personal', 'empresa')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plantillas_exportacion_empresa ON plantillas_exportacion (empresa_id, fuente);

DROP TRIGGER IF EXISTS plantillas_exportacion_updated_at ON plantillas_exportacion;
CREATE TRIGGER plantillas_exportacion_updated_at BEFORE UPDATE ON plantillas_exportacion
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE plantillas_exportacion ENABLE ROW LEVEL SECURITY;

-- ¿El usuario autenticado es admin de su empresa?
CREATE OR REPLACE FUNCTION _es_admin_empresa() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'superadmin'))
$$;
REVOKE EXECUTE ON FUNCTION _es_admin_empresa() FROM PUBLIC, anon;

DROP POLICY IF EXISTS plantillas_exportacion_select ON plantillas_exportacion;
CREATE POLICY plantillas_exportacion_select ON plantillas_exportacion FOR SELECT TO authenticated
    USING ((empresa_id = get_empresa_id() AND (alcance = 'empresa' OR usuario_id = auth.uid())) OR is_superadmin());

DROP POLICY IF EXISTS plantillas_exportacion_insert ON plantillas_exportacion;
CREATE POLICY plantillas_exportacion_insert ON plantillas_exportacion FOR INSERT TO authenticated
    WITH CHECK (empresa_id = get_empresa_id() AND usuario_id = auth.uid());

DROP POLICY IF EXISTS plantillas_exportacion_update ON plantillas_exportacion;
CREATE POLICY plantillas_exportacion_update ON plantillas_exportacion FOR UPDATE TO authenticated
    USING (empresa_id = get_empresa_id() AND (usuario_id = auth.uid() OR (alcance = 'empresa' AND _es_admin_empresa())))
    WITH CHECK (empresa_id = get_empresa_id());

DROP POLICY IF EXISTS plantillas_exportacion_delete ON plantillas_exportacion;
CREATE POLICY plantillas_exportacion_delete ON plantillas_exportacion FOR DELETE TO authenticated
    USING (empresa_id = get_empresa_id() AND (usuario_id = auth.uid() OR (alcance = 'empresa' AND _es_admin_empresa())));

GRANT SELECT, INSERT, UPDATE, DELETE ON plantillas_exportacion TO authenticated;
REVOKE ALL ON plantillas_exportacion FROM anon;
