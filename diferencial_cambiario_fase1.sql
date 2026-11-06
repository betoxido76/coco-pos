-- ═══════════════════════════════════════════════════════════════════════════
-- Diferencial cambiario en CxC — Fase 1: base de datos
-- Plan: docs/plan-diferencial-cambiario.md
--
-- Algunos clientes (p. ej. Farmatodo en Meraki) no pagan indexado: pagan los
-- bolívares de la factura aunque la tasa haya subido, y en USD queda un residuo
-- que nunca va a entrar. Finanzas lo lleva a pérdida con un botón en CxC: queda
-- una fila en `diferenciales_cambiarios` (trazabilidad) y un ABONO SIN CAJA en
-- `cobros` (diferencial_id, sin cuenta bancaria), igual que una retención. Así
-- todo lo que lee saldos ve la nota saldada sin cambios. Escritura solo por RPC.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Cliente: ¿paga indexado a la tasa del día? ──────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS paga_indexado boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN clientes.paga_indexado IS
  'false = paga los Bs. de la factura sin indexar a la tasa del día: CxC permite llevar el residuo en USD a diferencial cambiario (docs/plan-diferencial-cambiario.md).';

-- ── Registro de diferenciales ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diferenciales_cambiarios (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id        uuid NOT NULL REFERENCES empresas(id),
    numero            text NOT NULL,                       -- DC-000001 por empresa
    venta_id          uuid NOT NULL REFERENCES ventas(id),
    cliente_id        uuid NOT NULL REFERENCES clientes(id),
    fecha             date NOT NULL,                       -- fecha del último pago en Bs. de la nota
    monto_usd         numeric(14,2) NOT NULL CHECK (monto_usd > 0),
    total_nota        numeric(14,2) NOT NULL,
    cobrado_usd       numeric(14,2) NOT NULL,              -- abonado antes del ajuste (dinero, NC y retenciones)
    bs_pagados        numeric(16,2) NOT NULL,              -- Bs. de dinero recibidos en la nota
    tipo_tasa         text,
    tasa_nota         numeric(14,4),                       -- tasa del día de emisión (referencia)
    tasa_ultimo_pago  numeric(14,4),
    referencia_usd    numeric(14,2),                       -- diferencial calculado con las tasas (referencia)
    motivo            text NOT NULL,
    usuario_id        uuid REFERENCES usuarios(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    estado            text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulado')),
    anulado_por       uuid REFERENCES usuarios(id),
    fecha_anulacion   timestamptz,
    motivo_anulacion  text,
    UNIQUE (empresa_id, numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS diferenciales_un_vigente_por_nota
    ON diferenciales_cambiarios (venta_id) WHERE estado = 'vigente';
CREATE INDEX IF NOT EXISTS diferenciales_empresa_fecha_idx ON diferenciales_cambiarios (empresa_id, fecha);
COMMENT ON TABLE diferenciales_cambiarios IS
  'Residuo en USD de una nota llevado a pérdida porque el cliente pagó los Bs. sin indexar. Escritura solo por RPC (registrar_/anular_diferencial_cambiario).';

ALTER TABLE diferenciales_cambiarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diferenciales_select ON diferenciales_cambiarios;
CREATE POLICY diferenciales_select ON diferenciales_cambiarios FOR SELECT
    USING (empresa_id = get_empresa_id() OR is_superadmin());
-- Sin políticas de INSERT/UPDATE/DELETE: solo las RPC (SECURITY DEFINER) escriben.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diferenciales_cambiarios TO authenticated, service_role;

-- ── Abono del diferencial en cobros ─────────────────────────────────────────
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS diferencial_id uuid REFERENCES diferenciales_cambiarios(id);
ALTER TABLE cobros DROP CONSTRAINT IF EXISTS cobros_diferencial_sin_cuenta;
ALTER TABLE cobros ADD CONSTRAINT cobros_diferencial_sin_cuenta
  CHECK (diferencial_id IS NULL OR cuenta_bancaria_id IS NULL);
CREATE INDEX IF NOT EXISTS cobros_diferencial_idx ON cobros (diferencial_id) WHERE diferencial_id IS NOT NULL;
COMMENT ON COLUMN cobros.diferencial_id IS
  'Abono de un diferencial cambiario llevado a pérdida (metodo_usd diferencial_cambiario). Sin caja: Finanzas y Bancos lo excluyen.';

CREATE OR REPLACE FUNCTION _guarda_diferencial_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.diferencial_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.diferencial_id IS DISTINCT FROM OLD.diferencial_id)
       AND COALESCE(current_setting('mipos.registrando_diferencial', true), '') <> 'on' THEN
        RAISE EXCEPTION 'El diferencial cambiario se registra con registrar_diferencial_cambiario';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cobros_guarda_diferencial ON cobros;
CREATE TRIGGER cobros_guarda_diferencial BEFORE INSERT OR UPDATE OF diferencial_id ON cobros
  FOR EACH ROW EXECUTE FUNCTION _guarda_diferencial_id();

-- ── Permiso: solo Finanzas o Administración ─────────────────────────────────
CREATE OR REPLACE FUNCTION _diferencial_puede_operar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT is_superadmin()
        OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'finanzas'));
$$;

-- ── Registrar: lleva el saldo de la nota a diferencial cambiario ────────────
CREATE OR REPLACE FUNCTION registrar_diferencial_cambiario(p_venta_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_v ventas%ROWTYPE; v_cli clientes%ROWTYPE;
    v_cobrado numeric; v_saldo numeric; v_bs numeric;
    v_ult_fecha timestamptz; v_ult_tasa numeric; v_tipo_tasa text;
    v_fecha_nota date; v_tasa_nota numeric; v_ref numeric;
    v_numero text; v_id uuid;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;
    IF NOT _diferencial_puede_operar() THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden llevar un saldo a diferencial cambiario';
    END IF;

    SELECT * INTO v_v FROM ventas WHERE id = p_venta_id FOR UPDATE;
    IF v_v.id IS NULL OR (v_v.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Nota no encontrada';
    END IF;
    IF v_v.estado_cobro = 'anulado' OR v_v.motivo_anulacion IS NOT NULL THEN
        RAISE EXCEPTION 'La nota % está anulada', v_v.numero_factura;
    END IF;

    SELECT * INTO v_cli FROM clientes WHERE id = v_v.cliente_id;
    IF v_cli.id IS NULL THEN RAISE EXCEPTION 'La nota % no tiene cliente', v_v.numero_factura; END IF;
    IF COALESCE(v_cli.paga_indexado, true) THEN
        RAISE EXCEPTION 'El cliente % paga indexado: su saldo no puede ir a diferencial cambiario', v_cli.nombre;
    END IF;

    IF EXISTS (SELECT 1 FROM diferenciales_cambiarios WHERE venta_id = v_v.id AND estado = 'vigente') THEN
        RAISE EXCEPTION '% ya tiene un diferencial cambiario registrado', v_v.numero_factura;
    END IF;

    -- Dinero en Bs. recibido (sin NC, retenciones ni diferenciales) y su último pago
    SELECT COALESCE(SUM(monto_bs), 0) INTO v_bs
      FROM cobros WHERE venta_id = v_v.id AND monto_bs > 0
       AND devolucion_id IS NULL AND retencion_id IS NULL AND diferencial_id IS NULL;
    IF v_bs <= 0 THEN
        RAISE EXCEPTION '% no tiene pagos en bolívares: no puede haber diferencial cambiario', v_v.numero_factura;
    END IF;
    SELECT fecha_cobro, tasa_cambio, COALESCE(tipo_tasa, 'tasa_bcv')
      INTO v_ult_fecha, v_ult_tasa, v_tipo_tasa
      FROM cobros WHERE venta_id = v_v.id AND monto_bs > 0
       AND devolucion_id IS NULL AND retencion_id IS NULL AND diferencial_id IS NULL
     ORDER BY fecha_cobro DESC NULLS LAST, created_at DESC LIMIT 1;

    -- Saldo = total − abonos − pago directo en la venta (misma regla que _recalcular_estado_cobro_venta)
    SELECT COALESCE(SUM(monto_usd + COALESCE(monto_bs / NULLIF(tasa_cambio, 0), 0)), 0)
      INTO v_cobrado FROM cobros WHERE venta_id = v_v.id;
    v_cobrado := v_cobrado + COALESCE(v_v.pago_usd, 0) + COALESCE(v_v.pago_bs / NULLIF(v_v.tasa_cambio, 0), 0);
    v_saldo := round(COALESCE(v_v.total, 0) - v_cobrado, 2);
    IF v_saldo <= 0.01 THEN RAISE EXCEPTION '% no tiene saldo pendiente', v_v.numero_factura; END IF;

    -- Referencia: lo que daría el diferencial con la tasa del día de emisión
    v_fecha_nota := (COALESCE(v_v.fecha_venta, v_v.created_at) AT TIME ZONE 'America/Caracas')::date;
    SELECT CASE v_tipo_tasa WHEN 'tasa_euro' THEN tasa_euro WHEN 'tasa_binance' THEN tasa_binance ELSE tasa_bcv END
      INTO v_tasa_nota FROM tasas_cambio WHERE empresa_id = v_v.empresa_id AND fecha = v_fecha_nota;
    IF COALESCE(v_tasa_nota, 0) > 0 THEN
        SELECT round(SUM(monto_bs / v_tasa_nota - monto_bs / NULLIF(tasa_cambio, 0)), 2) INTO v_ref
          FROM cobros WHERE venta_id = v_v.id AND monto_bs > 0
           AND devolucion_id IS NULL AND retencion_id IS NULL AND diferencial_id IS NULL;
    END IF;

    -- Correlativo por empresa
    PERFORM pg_advisory_xact_lock(hashtext('diferencial_cambiario:' || v_v.empresa_id::text));
    SELECT 'DC-' || lpad((COALESCE(MAX(substring(numero FROM 4)::int), 0) + 1)::text, 6, '0')
      INTO v_numero FROM diferenciales_cambiarios WHERE empresa_id = v_v.empresa_id;

    INSERT INTO diferenciales_cambiarios (empresa_id, numero, venta_id, cliente_id, fecha, monto_usd,
            total_nota, cobrado_usd, bs_pagados, tipo_tasa, tasa_nota, tasa_ultimo_pago, referencia_usd,
            motivo, usuario_id)
    VALUES (v_v.empresa_id, v_numero, v_v.id, v_cli.id, (v_ult_fecha AT TIME ZONE 'America/Caracas')::date, v_saldo,
            v_v.total, round(v_cobrado, 2), v_bs, v_tipo_tasa, v_tasa_nota, v_ult_tasa, v_ref,
            btrim(p_motivo), auth.uid())
    RETURNING id INTO v_id;

    PERFORM set_config('mipos.registrando_diferencial', 'on', true);
    INSERT INTO cobros (venta_id, fecha_cobro, monto_usd, monto_bs, tasa_cambio, tipo_tasa,
                        metodo_usd, nota, usuario_id, empresa_id, contribuyente_especial, diferencial_id)
    VALUES (v_v.id, v_ult_fecha, v_saldo, 0, v_ult_tasa, v_tipo_tasa,
            'diferencial_cambiario', 'Diferencial cambiario ' || v_numero,
            auth.uid(), v_v.empresa_id, v_cli.contribuyente_especial, v_id);
    PERFORM set_config('mipos.registrando_diferencial', 'off', true);

    PERFORM _recalcular_estado_cobro_venta(v_v.id);
    RETURN jsonb_build_object('id', v_id, 'numero', v_numero, 'monto_usd', v_saldo, 'referencia_usd', v_ref);
END $$;

-- ── Anular: la nota vuelve a tener saldo ────────────────────────────────────
CREATE OR REPLACE FUNCTION anular_diferencial_cambiario(p_id uuid, p_motivo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_d diferenciales_cambiarios%ROWTYPE;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo de anulación es obligatorio'; END IF;
    IF NOT _diferencial_puede_operar() THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden anular un diferencial cambiario';
    END IF;
    SELECT * INTO v_d FROM diferenciales_cambiarios WHERE id = p_id FOR UPDATE;
    IF v_d.id IS NULL OR (v_d.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Diferencial no encontrado';
    END IF;
    IF v_d.estado = 'anulado' THEN RAISE EXCEPTION 'El diferencial % ya está anulado', v_d.numero; END IF;

    UPDATE diferenciales_cambiarios SET estado = 'anulado', anulado_por = auth.uid(), fecha_anulacion = now(),
                                        motivo_anulacion = btrim(p_motivo)
     WHERE id = v_d.id;
    -- cobros no tiene anulación lógica: el abono se borra (como al anular una retención)
    DELETE FROM cobros WHERE diferencial_id = v_d.id;
    RETURN _recalcular_estado_cobro_venta(v_d.venta_id);
END $$;

-- ── Nota anulada → su diferencial también ───────────────────────────────────
CREATE OR REPLACE FUNCTION _ventas_anula_diferenciales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    IF NEW.estado_cobro = 'anulado' AND OLD.estado_cobro IS DISTINCT FROM 'anulado' THEN
        DELETE FROM cobros WHERE venta_id = NEW.id AND diferencial_id IS NOT NULL;
        UPDATE diferenciales_cambiarios SET estado = 'anulado', anulado_por = auth.uid(), fecha_anulacion = now(),
               motivo_anulacion = 'Nota anulada' || COALESCE(': ' || NEW.motivo_anulacion, '')
         WHERE venta_id = NEW.id AND estado = 'vigente';
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS ventas_anula_diferenciales ON ventas;
CREATE TRIGGER ventas_anula_diferenciales AFTER UPDATE OF estado_cobro ON ventas
  FOR EACH ROW EXECUTE FUNCTION _ventas_anula_diferenciales();

-- ── Exportador: marcar el diferencial (columna nueva al final) ──────────────
CREATE OR REPLACE VIEW v_export_cobros WITH (security_invoker = true) AS
 SELECT co.id AS cobro_id,
    co.empresa_id,
    co.fecha_cobro,
    (co.fecha_cobro AT TIME ZONE 'America/Caracas'::text)::date AS fecha,
    (co.created_at AT TIME ZONE 'America/Caracas'::text)::date AS registrado_el,
    v.numero_factura,
    (v.created_at AT TIME ZONE 'America/Caracas'::text)::date AS fecha_nota,
    v.total AS total_nota,
    v.estado_cobro,
    v.cliente_id,
    c.codigo AS cliente_codigo,
    c.nombre AS cliente,
    c.rif AS cliente_rif,
    COALESCE(k1.nombre, 'Sin categoría'::text) AS canal,
    COALESCE(p.vendedor_id, v.usuario_id) AS vendedor_id,
    uv.nombre AS vendedor,
    co.monto_usd,
    co.monto_bs,
    co.tasa_cambio,
    co.tipo_tasa,
    round(co.monto_usd + co.monto_bs / NULLIF(co.tasa_cambio, 0::numeric), 2) AS monto_equiv_usd,
    co.metodo_usd,
    co.metodo_bs,
    cb.banco,
    cb.numero_cuenta,
    cb.nombre AS cuenta,
    co.nota,
    co.devolucion_id IS NOT NULL AS es_nota_credito,
    d.numero_nc,
    co.contribuyente_especial,
    ur.nombre AS registrado_por,
    v.estado_cobro = 'anulado'::text OR v.motivo_anulacion IS NOT NULL AS anulado,
    co.retencion_id IS NOT NULL AS es_retencion,
    rt.numero_comprobante AS comprobante_retencion,
    co.diferencial_id IS NOT NULL AS es_diferencial_cambiario
   FROM cobros co
     JOIN ventas v ON v.id = co.venta_id
     LEFT JOIN pedidos p ON p.id = v.pedido_id
     LEFT JOIN clientes c ON c.id = v.cliente_id
     LEFT JOIN categorias_clientes k1 ON k1.id = c.cat1_id
     LEFT JOIN usuarios uv ON uv.id = COALESCE(p.vendedor_id, v.usuario_id)
     LEFT JOIN usuarios ur ON ur.id = co.usuario_id
     LEFT JOIN cuentas_bancarias cb ON cb.id = co.cuenta_bancaria_id
     LEFT JOIN devoluciones d ON d.id = co.devolucion_id
     LEFT JOIN retenciones rt ON rt.id = co.retencion_id;

-- ── Exposición ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION _diferencial_puede_operar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _ventas_anula_diferenciales() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION registrar_diferencial_cambiario(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION anular_diferencial_cambiario(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_diferencial_cambiario(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION anular_diferencial_cambiario(uuid, text) TO authenticated;
