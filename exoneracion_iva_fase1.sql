-- ═══════════════════════════════════════════════════════════════════════════
-- Clientes exonerados de IVA — Fase 1: base de datos
-- Plan: docs/plan-exoneracion-iva.md
--
-- Una nota sale sin IVA en productos gravados SOLO si el cliente tiene una
-- exoneración vigente a la fecha de la nota. La exoneración lleva una
-- referencia obligatoria (N° del documento o del control de finanzas); el
-- soporte lo lleva finanzas aparte. Candado en venta_items.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exoneraciones_iva (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES empresas(id),
  cliente_id         uuid NOT NULL REFERENCES clientes(id),
  referencia         text NOT NULL CHECK (btrim(referencia) <> ''),
  vigente_desde      date NOT NULL DEFAULT current_date,
  vigente_hasta      date,                       -- NULL = sin vencimiento
  observaciones      text,
  estado             text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'revocada')),
  usuario_id         uuid REFERENCES usuarios(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  revocado_por       uuid REFERENCES usuarios(id),
  fecha_revocacion   timestamptz,
  motivo_revocacion  text,
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
COMMENT ON TABLE exoneraciones_iva IS
  'Clientes exonerados de IVA (docs/plan-exoneracion-iva.md). Una vigente por cliente. Escritura solo por RPC.';
CREATE UNIQUE INDEX IF NOT EXISTS exoneraciones_iva_una_vigente
  ON exoneraciones_iva (cliente_id) WHERE estado = 'vigente';
CREATE INDEX IF NOT EXISTS exoneraciones_iva_empresa ON exoneraciones_iva (empresa_id);

ALTER TABLE exoneraciones_iva ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exoneraciones_iva_select ON exoneraciones_iva;
CREATE POLICY exoneraciones_iva_select ON exoneraciones_iva FOR SELECT
  USING (empresa_id = get_empresa_id() OR is_superadmin());
-- Sin políticas de INSERT/UPDATE/DELETE: solo las RPC escriben.

-- ── Nota y líneas ───────────────────────────────────────────────────────────
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS exoneracion_id uuid REFERENCES exoneraciones_iva(id),
  ADD COLUMN IF NOT EXISTS base_exonerada numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN ventas.exoneracion_id IS 'Exoneración de IVA que amparó la nota (docs/plan-exoneracion-iva.md).';
COMMENT ON COLUMN ventas.base_exonerada IS
  'Parte de base_exenta que es gravada pero va sin IVA por exoneración. La mantiene el trigger de venta_items.';

ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS iva_exonerado boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN venta_items.iva_exonerado IS
  'Producto gravado que va sin IVA por la exoneración de la nota (distinto de un producto exento). Lo fija el trigger.';

-- ¿Qué exoneración ampara a este cliente en esta fecha? (NULL = ninguna)
CREATE OR REPLACE FUNCTION exoneracion_vigente(p_cliente uuid, p_fecha date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT id FROM exoneraciones_iva
     WHERE cliente_id = p_cliente AND estado = 'vigente'
       AND vigente_desde <= p_fecha AND (vigente_hasta IS NULL OR vigente_hasta >= p_fecha)
       AND (empresa_id = get_empresa_id() OR is_superadmin())
     LIMIT 1;
$$;

-- ── Candado: línea gravada sin IVA ⇒ la nota debe estar amparada ───────────
CREATE OR REPLACE FUNCTION _venta_items_exoneracion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_gravado boolean; v_v ventas%ROWTYPE; v_fecha date;
BEGIN
    SELECT aplica_iva INTO v_gravado FROM productos_terminados WHERE id = NEW.producto_id;
    IF COALESCE(v_gravado, false) AND NOT COALESCE(NEW.aplica_iva, true) THEN
        SELECT * INTO v_v FROM ventas WHERE id = NEW.venta_id;
        v_fecha := (COALESCE(v_v.fecha_venta, v_v.created_at, now()) AT TIME ZONE 'America/Caracas')::date;
        IF v_v.exoneracion_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM exoneraciones_iva e
             WHERE e.id = v_v.exoneracion_id AND e.cliente_id = v_v.cliente_id AND e.estado = 'vigente'
               AND e.vigente_desde <= v_fecha AND (e.vigente_hasta IS NULL OR e.vigente_hasta >= v_fecha)) THEN
            RAISE EXCEPTION 'Un producto gravado solo puede ir sin IVA si el cliente tiene una exoneración vigente (nota %)', v_v.numero_factura;
        END IF;
        NEW.iva_exonerado := true;
        NEW.iva_pct := 0;
    ELSE
        NEW.iva_exonerado := false;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS venta_items_exoneracion ON venta_items;
CREATE TRIGGER venta_items_exoneracion BEFORE INSERT ON venta_items
  FOR EACH ROW EXECUTE FUNCTION _venta_items_exoneracion();

-- base_exonerada del encabezado = suma de las líneas exoneradas
CREATE OR REPLACE FUNCTION _venta_items_base_exonerada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    IF NEW.iva_exonerado THEN
        UPDATE ventas SET base_exonerada = round(COALESCE((
            SELECT SUM(COALESCE(vi.base_linea, vi.cantidad * vi.precio_unitario))
              FROM venta_items vi WHERE vi.venta_id = NEW.venta_id AND vi.iva_exonerado), 0), 2)
         WHERE id = NEW.venta_id;
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS venta_items_base_exonerada ON venta_items;
CREATE TRIGGER venta_items_base_exonerada AFTER INSERT ON venta_items
  FOR EACH ROW EXECUTE FUNCTION _venta_items_base_exonerada();

-- ── RPC ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _exoneracion_puede_operar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT is_superadmin() OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'finanzas'));
$$;

-- Registra la exoneración del cliente. Si ya tenía una vigente, la reemplaza
-- (queda revocada con el motivo "Reemplazada").
CREATE OR REPLACE FUNCTION registrar_exoneracion_iva(
    p_cliente_id uuid, p_referencia text, p_vigente_desde date DEFAULT NULL,
    p_vigente_hasta date DEFAULT NULL, p_observaciones text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cli clientes%ROWTYPE; v_id uuid; v_desde date;
BEGIN
    IF NOT _exoneracion_puede_operar() THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden registrar exoneraciones de IVA';
    END IF;
    SELECT * INTO v_cli FROM clientes WHERE id = p_cliente_id;
    IF v_cli.id IS NULL OR (v_cli.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Cliente no encontrado';
    END IF;
    IF NULLIF(btrim(COALESCE(v_cli.rif, '')), '') IS NULL THEN
        RAISE EXCEPTION 'El cliente % no tiene RIF: cárgalo antes de registrar la exoneración', v_cli.nombre;
    END IF;
    IF NULLIF(btrim(COALESCE(p_referencia, '')), '') IS NULL THEN
        RAISE EXCEPTION 'La referencia del documento de exoneración es obligatoria';
    END IF;
    v_desde := COALESCE(p_vigente_desde, (now() AT TIME ZONE 'America/Caracas')::date);
    IF p_vigente_hasta IS NOT NULL AND p_vigente_hasta < v_desde THEN
        RAISE EXCEPTION 'La vigencia termina antes de empezar';
    END IF;

    UPDATE exoneraciones_iva SET estado = 'revocada', revocado_por = auth.uid(), fecha_revocacion = now(),
                                 motivo_revocacion = 'Reemplazada por una nueva exoneración'
     WHERE cliente_id = v_cli.id AND estado = 'vigente';

    INSERT INTO exoneraciones_iva (empresa_id, cliente_id, referencia, vigente_desde, vigente_hasta, observaciones, usuario_id)
    VALUES (v_cli.empresa_id, v_cli.id, btrim(p_referencia), v_desde, p_vigente_hasta,
            NULLIF(btrim(COALESCE(p_observaciones, '')), ''), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION revocar_exoneracion_iva(p_exoneracion_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_e exoneraciones_iva%ROWTYPE;
BEGIN
    IF NOT _exoneracion_puede_operar() THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden revocar exoneraciones de IVA';
    END IF;
    IF NULLIF(btrim(COALESCE(p_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;
    SELECT * INTO v_e FROM exoneraciones_iva WHERE id = p_exoneracion_id FOR UPDATE;
    IF v_e.id IS NULL OR (v_e.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Exoneración no encontrada';
    END IF;
    IF v_e.estado = 'revocada' THEN RAISE EXCEPTION 'La exoneración ya está revocada'; END IF;
    UPDATE exoneraciones_iva SET estado = 'revocada', revocado_por = auth.uid(), fecha_revocacion = now(),
                                 motivo_revocacion = btrim(p_motivo)
     WHERE id = v_e.id;
END $$;

REVOKE EXECUTE ON FUNCTION _venta_items_exoneracion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _venta_items_base_exonerada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _exoneracion_puede_operar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION exoneracion_vigente(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION registrar_exoneracion_iva(uuid, text, date, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION revocar_exoneracion_iva(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION exoneracion_vigente(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_exoneracion_iva(uuid, text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION revocar_exoneracion_iva(uuid, text) TO authenticated;
