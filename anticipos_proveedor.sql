-- ============================================================================
-- ANTICIPOS A PROVEEDOR — Fase 1 (docs/plan-anticipos-proveedor.md)
--
-- Un anticipo es dinero entregado a un proveedor antes de recibir mercancía,
-- normalmente contra una OC. Es un documento propio (ANT-000001) que sale del
-- banco el día que se paga. Se cruza contra recepciones con una "aplicación":
-- una fila de pagos_proveedor con anticipo_id y SIN cuenta bancaria. Para CxP
-- es un abono más; para caja no es una salida (el dinero ya salió con el
-- anticipo).
--
--   saldo = monto_equiv_usd − aplicaciones vigentes − reembolsos vigentes
--
-- Escritura SOLO por RPC (las tablas no tienen política de INSERT/UPDATE):
--   registrar_anticipo_proveedor · aplicar_anticipo_proveedor
--   anular_anticipo_proveedor · registrar_reembolso_anticipo
--   anular_reembolso_anticipo
-- y anular_pago_proveedor (extendida) devuelve el saldo al anular una aplicación.
-- ============================================================================

-- ── 1. Tablas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anticipos_proveedor (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id         uuid NOT NULL REFERENCES empresas(id),
    numero_anticipo    text NOT NULL,
    proveedor_id       uuid NOT NULL REFERENCES proveedores(id),
    orden_compra_id    uuid REFERENCES ordenes_compra(id),
    fecha              date NOT NULL,
    monto_usd          numeric NOT NULL DEFAULT 0 CHECK (monto_usd >= 0),
    monto_bs           numeric NOT NULL DEFAULT 0 CHECK (monto_bs >= 0),
    tasa_cambio        numeric,
    tipo_tasa          text,
    metodo_usd         text,
    metodo_bs          text,
    cuenta_bancaria_id uuid REFERENCES cuentas_bancarias(id),
    monto_equiv_usd    numeric NOT NULL CHECK (monto_equiv_usd > 0),
    nro_doc_proveedor  text,
    nota               text,
    estado             text NOT NULL DEFAULT 'disponible'
                       CHECK (estado IN ('disponible','aplicado_parcial','aplicado','reembolsado','anulado')),
    usuario_id         uuid REFERENCES usuarios(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    anulado_por        uuid REFERENCES usuarios(id),
    fecha_anulacion    timestamptz,
    motivo_anulacion   text,
    CONSTRAINT anticipos_proveedor_numero_unico UNIQUE (empresa_id, numero_anticipo),
    CONSTRAINT anticipos_proveedor_bs_con_tasa CHECK (monto_bs = 0 OR tasa_cambio > 0)
);
CREATE INDEX IF NOT EXISTS anticipos_proveedor_prov_idx ON anticipos_proveedor (empresa_id, proveedor_id, estado);
CREATE INDEX IF NOT EXISTS anticipos_proveedor_oc_idx   ON anticipos_proveedor (orden_compra_id);

CREATE TABLE IF NOT EXISTS anticipo_reembolsos (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id         uuid NOT NULL REFERENCES empresas(id),
    anticipo_id        uuid NOT NULL REFERENCES anticipos_proveedor(id),
    fecha              date NOT NULL,
    monto_usd          numeric NOT NULL DEFAULT 0 CHECK (monto_usd >= 0),
    monto_bs           numeric NOT NULL DEFAULT 0 CHECK (monto_bs >= 0),
    tasa_cambio        numeric,
    tipo_tasa          text,
    metodo_usd         text,
    metodo_bs          text,
    cuenta_bancaria_id uuid REFERENCES cuentas_bancarias(id),
    monto_equiv_usd    numeric NOT NULL CHECK (monto_equiv_usd > 0),
    nota               text,
    usuario_id         uuid REFERENCES usuarios(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    anulado            boolean NOT NULL DEFAULT false,
    anulado_por        uuid REFERENCES usuarios(id),
    fecha_anulacion    timestamptz,
    motivo_anulacion   text,
    CONSTRAINT anticipo_reembolsos_bs_con_tasa CHECK (monto_bs = 0 OR tasa_cambio > 0)
);
CREATE INDEX IF NOT EXISTS anticipo_reembolsos_anticipo_idx ON anticipo_reembolsos (anticipo_id);

-- ── 2. Enlace de la aplicación en pagos_proveedor ───────────────────────────
ALTER TABLE pagos_proveedor
    ADD COLUMN IF NOT EXISTS anticipo_id uuid REFERENCES anticipos_proveedor(id);
CREATE INDEX IF NOT EXISTS pagos_proveedor_anticipo_idx ON pagos_proveedor (anticipo_id) WHERE anticipo_id IS NOT NULL;
ALTER TABLE pagos_proveedor DROP CONSTRAINT IF EXISTS pagos_proveedor_anticipo_sin_cuenta;
ALTER TABLE pagos_proveedor ADD CONSTRAINT pagos_proveedor_anticipo_sin_cuenta
    CHECK (anticipo_id IS NULL OR cuenta_bancaria_id IS NULL);

-- pagos_proveedor admite INSERT directo desde la app (RLS por empresa). Sin
-- esto, una "aplicación" escrita a mano se saltaría la validación de saldo:
-- solo aplicar_anticipo_proveedor puede escribir anticipo_id.
CREATE OR REPLACE FUNCTION _pagos_proveedor_guarda_anticipo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.anticipo_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.anticipo_id IS DISTINCT FROM OLD.anticipo_id)
       AND COALESCE(current_setting('mipos.aplicando_anticipo', true), '') <> 'on' THEN
        RAISE EXCEPTION 'Las aplicaciones de anticipo se registran con aplicar_anticipo_proveedor';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pagos_proveedor_guarda_anticipo ON pagos_proveedor;
CREATE TRIGGER pagos_proveedor_guarda_anticipo
    BEFORE INSERT OR UPDATE OF anticipo_id ON pagos_proveedor
    FOR EACH ROW EXECUTE FUNCTION _pagos_proveedor_guarda_anticipo();

-- ── 3. RLS: lectura por empresa; escritura solo vía RPC ─────────────────────
ALTER TABLE anticipos_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE anticipo_reembolsos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anticipos_select ON anticipos_proveedor;
CREATE POLICY anticipos_select ON anticipos_proveedor FOR SELECT
    USING (empresa_id = get_empresa_id() OR is_superadmin());
DROP POLICY IF EXISTS reembolsos_select ON anticipo_reembolsos;
CREATE POLICY reembolsos_select ON anticipo_reembolsos FOR SELECT
    USING (empresa_id = get_empresa_id() OR is_superadmin());

-- ── 4. Helpers internos ─────────────────────────────────────────────────────
-- Permiso para registrar/aplicar: módulo compras o cxp (decisión 0.2). El rol
-- admin NO basta: hay admins sin esos módulos (p. ej. vendedores en Meraki).
CREATE OR REPLACE FUNCTION _anticipo_puede_operar(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_superadmin()
        OR EXISTS (SELECT 1 FROM usuario_modulos
                    WHERE usuario_id = auth.uid() AND empresa_id = p_empresa
                      AND modulo_id IN ('compras', 'cxp') AND activo);
$$;

-- Permiso para anular: admin / finanzas / superadmin (decisión 0.3, igual que anular_pago_proveedor)
CREATE OR REPLACE FUNCTION _anticipo_puede_anular(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_superadmin()
        OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa
                      AND rol IN ('admin', 'finanzas'));
$$;

-- Saldo vigente de un anticipo (USD)
CREATE OR REPLACE FUNCTION saldo_anticipo(p_anticipo_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT a.monto_equiv_usd
         - COALESCE((SELECT SUM(monto_usd) FROM pagos_proveedor
                      WHERE anticipo_id = a.id AND NOT anulado), 0)
         - COALESCE((SELECT SUM(monto_equiv_usd) FROM anticipo_reembolsos
                      WHERE anticipo_id = a.id AND NOT anulado), 0)
    FROM anticipos_proveedor a WHERE a.id = p_anticipo_id;
$$;

-- Único punto que escribe anticipos_proveedor.estado (salvo 'anulado')
CREATE OR REPLACE FUNCTION recalcular_anticipo(p_anticipo_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_a anticipos_proveedor%ROWTYPE;
    v_aplicado numeric; v_reemb numeric; v_saldo numeric; v_estado text;
BEGIN
    SELECT * INTO v_a FROM anticipos_proveedor WHERE id = p_anticipo_id;
    IF v_a.id IS NULL OR v_a.estado = 'anulado' THEN RETURN v_a.estado; END IF;
    SELECT COALESCE(SUM(monto_usd), 0) INTO v_aplicado
      FROM pagos_proveedor WHERE anticipo_id = v_a.id AND NOT anulado;
    SELECT COALESCE(SUM(monto_equiv_usd), 0) INTO v_reemb
      FROM anticipo_reembolsos WHERE anticipo_id = v_a.id AND NOT anulado;
    v_saldo := v_a.monto_equiv_usd - v_aplicado - v_reemb;
    v_estado := CASE
        WHEN v_saldo <= 0.01 THEN CASE WHEN v_reemb > v_aplicado THEN 'reembolsado' ELSE 'aplicado' END
        WHEN v_aplicado + v_reemb > 0.01 THEN 'aplicado_parcial'
        ELSE 'disponible'
    END;
    UPDATE anticipos_proveedor SET estado = v_estado WHERE id = v_a.id;
    RETURN v_estado;
END $$;

-- Mismo cálculo de estado_cobro que anular_pago_proveedor
CREATE OR REPLACE FUNCTION _recalcular_estado_cobro_compra(p_compra_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_compra compras%ROWTYPE; v_pagado numeric; v_debido numeric; v_estado text;
BEGIN
    SELECT * INTO v_compra FROM compras WHERE id = p_compra_id;
    SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
      FROM pagos_proveedor WHERE compra_id = p_compra_id AND NOT anulado;
    v_debido := COALESCE(v_compra.total, 0) - COALESCE(v_compra.descuento_pago, 0);
    v_estado := CASE
        WHEN v_pagado >= v_debido - 0.01 THEN 'pagado'
        WHEN v_pagado > 0.01 THEN 'parcial'
        ELSE 'pendiente'
    END;
    UPDATE compras SET estado_cobro = v_estado WHERE id = p_compra_id;
    RETURN v_estado;
END $$;

-- ── 5. Registrar anticipo ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registrar_anticipo_proveedor(
    p_proveedor_id uuid, p_orden_compra_id uuid, p_fecha date,
    p_monto_usd numeric, p_monto_bs numeric, p_tasa_cambio numeric, p_tipo_tasa text,
    p_metodo_usd text, p_metodo_bs text, p_cuenta_bancaria_id uuid,
    p_nro_doc_proveedor text, p_nota text
) RETURNS anticipos_proveedor
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_empresa uuid := get_empresa_id();
    v_oc ordenes_compra%ROWTYPE;
    v_equiv numeric; v_vigente numeric; v_ult int; v_row anticipos_proveedor%ROWTYPE;
BEGIN
    IF v_empresa IS NULL THEN RAISE EXCEPTION 'Sesión sin empresa'; END IF;
    IF NOT _anticipo_puede_operar(v_empresa) THEN
        RAISE EXCEPTION 'Necesitas el módulo de Compras o de Cuentas por Pagar para registrar anticipos';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM proveedores WHERE id = p_proveedor_id AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Proveedor no encontrado';
    END IF;
    IF p_fecha IS NULL THEN RAISE EXCEPTION 'La fecha es obligatoria'; END IF;
    IF COALESCE(p_monto_bs, 0) > 0 AND COALESCE(p_tasa_cambio, 0) <= 0 THEN
        RAISE EXCEPTION 'Falta la tasa de cambio para el monto en Bs.';
    END IF;
    v_equiv := round(COALESCE(p_monto_usd, 0) + COALESCE(p_monto_bs, 0) / NULLIF(p_tasa_cambio, 0), 2);
    v_equiv := COALESCE(v_equiv, round(COALESCE(p_monto_usd, 0), 2));
    IF v_equiv <= 0 THEN RAISE EXCEPTION 'El monto del anticipo debe ser mayor a cero'; END IF;
    IF p_cuenta_bancaria_id IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM cuentas_bancarias WHERE id = p_cuenta_bancaria_id AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Cuenta bancaria no encontrada';
    END IF;

    IF p_orden_compra_id IS NOT NULL THEN
        -- Bloquea la OC: dos anticipos simultáneos no se saltan el tope
        SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_compra_id AND empresa_id = v_empresa FOR UPDATE;
        IF v_oc.id IS NULL THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
        IF v_oc.proveedor_id IS DISTINCT FROM p_proveedor_id THEN
            RAISE EXCEPTION 'La OC es de otro proveedor';
        END IF;
        IF v_oc.estado NOT IN ('pendiente', 'aprobada', 'recibida_parcial') THEN
            RAISE EXCEPTION 'No se pueden registrar anticipos en una OC %', replace(v_oc.estado, '_', ' ');
        END IF;
        -- Tope (decisión 0.4): total de la OC menos anticipos vigentes
        SELECT COALESCE(SUM(monto_equiv_usd), 0) INTO v_vigente
          FROM anticipos_proveedor WHERE orden_compra_id = v_oc.id AND estado <> 'anulado';
        IF v_vigente + v_equiv > COALESCE(v_oc.total, 0) + 0.01 THEN
            RAISE EXCEPTION 'El anticipo supera el total de la OC: disponible para anticipar $%',
                to_char(GREATEST(COALESCE(v_oc.total, 0) - v_vigente, 0), 'FM999999990.00');
        END IF;
    END IF;

    -- Numeración por empresa; el UNIQUE atrapa una colisión simultánea
    PERFORM pg_advisory_xact_lock(hashtext('anticipo_num_' || v_empresa::text));
    SELECT MAX(CAST(split_part(numero_anticipo, '-', 2) AS integer)) INTO v_ult
      FROM anticipos_proveedor WHERE empresa_id = v_empresa AND numero_anticipo LIKE 'ANT-%';

    INSERT INTO anticipos_proveedor (
        empresa_id, numero_anticipo, proveedor_id, orden_compra_id, fecha,
        monto_usd, monto_bs, tasa_cambio, tipo_tasa, metodo_usd, metodo_bs,
        cuenta_bancaria_id, monto_equiv_usd, nro_doc_proveedor, nota, usuario_id)
    VALUES (
        v_empresa, 'ANT-' || lpad((COALESCE(v_ult, 0) + 1)::text, 6, '0'), p_proveedor_id, p_orden_compra_id, p_fecha,
        COALESCE(p_monto_usd, 0), COALESCE(p_monto_bs, 0), p_tasa_cambio, p_tipo_tasa,
        NULLIF(p_metodo_usd, ''), NULLIF(p_metodo_bs, ''), p_cuenta_bancaria_id, v_equiv,
        NULLIF(btrim(p_nro_doc_proveedor), ''), NULLIF(btrim(p_nota), ''), auth.uid())
    RETURNING * INTO v_row;
    RETURN v_row;
END $$;

-- ── 6. Aplicar anticipo a una recepción ─────────────────────────────────────
CREATE OR REPLACE FUNCTION aplicar_anticipo_proveedor(
    p_anticipo_id uuid, p_compra_id uuid, p_monto numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_a anticipos_proveedor%ROWTYPE; v_c compras%ROWTYPE;
    v_saldo_ant numeric; v_pagado numeric; v_saldo_comp numeric; v_monto numeric;
    v_estado_cobro text; v_estado_ant text;
BEGIN
    v_monto := round(COALESCE(p_monto, 0), 2);
    IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto a aplicar debe ser mayor a cero'; END IF;

    -- Orden fijo de bloqueo (anticipo → recepción) para no generar deadlocks
    SELECT * INTO v_a FROM anticipos_proveedor WHERE id = p_anticipo_id FOR UPDATE;
    IF v_a.id IS NULL OR (v_a.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Anticipo no encontrado';
    END IF;
    IF NOT _anticipo_puede_operar(v_a.empresa_id) THEN
        RAISE EXCEPTION 'Necesitas el módulo de Compras o de Cuentas por Pagar para aplicar anticipos';
    END IF;
    IF v_a.estado = 'anulado' THEN RAISE EXCEPTION 'El anticipo % está anulado', v_a.numero_anticipo; END IF;

    SELECT * INTO v_c FROM compras WHERE id = p_compra_id FOR UPDATE;
    IF v_c.id IS NULL OR v_c.empresa_id <> v_a.empresa_id THEN RAISE EXCEPTION 'Recepción no encontrada'; END IF;
    IF v_c.estado = 'anulada' THEN RAISE EXCEPTION 'La recepción está anulada'; END IF;
    IF v_c.proveedor_id IS DISTINCT FROM v_a.proveedor_id THEN
        RAISE EXCEPTION 'El anticipo % es de otro proveedor', v_a.numero_anticipo;
    END IF;

    v_saldo_ant := saldo_anticipo(v_a.id);
    IF v_monto > v_saldo_ant + 0.01 THEN
        RAISE EXCEPTION 'El anticipo % solo tiene $% disponibles', v_a.numero_anticipo, to_char(v_saldo_ant, 'FM999999990.00');
    END IF;
    SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
      FROM pagos_proveedor WHERE compra_id = v_c.id AND NOT anulado;
    v_saldo_comp := COALESCE(v_c.total, 0) - COALESCE(v_c.descuento_pago, 0) - v_pagado;
    IF v_monto > v_saldo_comp + 0.01 THEN
        RAISE EXCEPTION 'La recepción % solo debe $%', COALESCE(v_c.numero_doc, ''), to_char(GREATEST(v_saldo_comp, 0), 'FM999999990.00');
    END IF;

    -- La aplicación es un abono SIN cuenta bancaria: no es salida de dinero.
    -- La bandera (local a la transacción) habilita el trigger guardián.
    PERFORM set_config('mipos.aplicando_anticipo', 'on', true);
    INSERT INTO pagos_proveedor (
        compra_id, usuario_id, fecha_pago, monto_usd, monto_bs, tasa_cambio, tipo_tasa,
        metodo_usd, nota, empresa_id, anticipo_id)
    VALUES (
        v_c.id, COALESCE(auth.uid(), v_a.usuario_id), now(), v_monto, 0,
        COALESCE(NULLIF(v_a.tasa_cambio, 0), 1), v_a.tipo_tasa,
        'anticipo', 'Aplicación ' || v_a.numero_anticipo, v_a.empresa_id, v_a.id);

    PERFORM set_config('mipos.aplicando_anticipo', 'off', true);

    v_estado_cobro := _recalcular_estado_cobro_compra(v_c.id);
    v_estado_ant := recalcular_anticipo(v_a.id);
    RETURN jsonb_build_object('estado_cobro', v_estado_cobro, 'estado_anticipo', v_estado_ant,
                              'saldo_anticipo', saldo_anticipo(v_a.id));
END $$;

-- ── 7. Anular anticipo ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION anular_anticipo_proveedor(p_anticipo_id uuid, p_motivo text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a anticipos_proveedor%ROWTYPE;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo de anulación es obligatorio';
    END IF;
    SELECT * INTO v_a FROM anticipos_proveedor WHERE id = p_anticipo_id FOR UPDATE;
    IF v_a.id IS NULL OR (v_a.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Anticipo no encontrado';
    END IF;
    IF NOT _anticipo_puede_anular(v_a.empresa_id) THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden anular anticipos';
    END IF;
    IF v_a.estado = 'anulado' THEN RAISE EXCEPTION 'Este anticipo ya está anulado'; END IF;
    IF EXISTS (SELECT 1 FROM pagos_proveedor WHERE anticipo_id = v_a.id AND NOT anulado) THEN
        RAISE EXCEPTION 'El anticipo tiene aplicaciones vigentes: anúlalas primero desde la recepción';
    END IF;
    IF EXISTS (SELECT 1 FROM anticipo_reembolsos WHERE anticipo_id = v_a.id AND NOT anulado) THEN
        RAISE EXCEPTION 'El anticipo tiene reembolsos vigentes: anúlalos primero';
    END IF;
    UPDATE anticipos_proveedor
       SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
           anulado_por = auth.uid(), fecha_anulacion = now()
     WHERE id = v_a.id;
    RETURN 'anulado';
END $$;

-- ── 8. Reembolsos ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registrar_reembolso_anticipo(
    p_anticipo_id uuid, p_fecha date, p_monto_usd numeric, p_monto_bs numeric,
    p_tasa_cambio numeric, p_tipo_tasa text, p_metodo_usd text, p_metodo_bs text,
    p_cuenta_bancaria_id uuid, p_nota text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a anticipos_proveedor%ROWTYPE; v_equiv numeric; v_saldo numeric;
BEGIN
    SELECT * INTO v_a FROM anticipos_proveedor WHERE id = p_anticipo_id FOR UPDATE;
    IF v_a.id IS NULL OR (v_a.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Anticipo no encontrado';
    END IF;
    IF NOT _anticipo_puede_operar(v_a.empresa_id) THEN
        RAISE EXCEPTION 'Necesitas el módulo de Compras o de Cuentas por Pagar para registrar reembolsos';
    END IF;
    IF v_a.estado = 'anulado' THEN RAISE EXCEPTION 'El anticipo % está anulado', v_a.numero_anticipo; END IF;
    IF p_fecha IS NULL THEN RAISE EXCEPTION 'La fecha es obligatoria'; END IF;
    IF COALESCE(p_monto_bs, 0) > 0 AND COALESCE(p_tasa_cambio, 0) <= 0 THEN
        RAISE EXCEPTION 'Falta la tasa de cambio para el monto en Bs.';
    END IF;
    IF p_cuenta_bancaria_id IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM cuentas_bancarias WHERE id = p_cuenta_bancaria_id AND empresa_id = v_a.empresa_id) THEN
        RAISE EXCEPTION 'Cuenta bancaria no encontrada';
    END IF;
    v_equiv := round(COALESCE(p_monto_usd, 0) + COALESCE(COALESCE(p_monto_bs, 0) / NULLIF(p_tasa_cambio, 0), 0), 2);
    IF v_equiv <= 0 THEN RAISE EXCEPTION 'El monto del reembolso debe ser mayor a cero'; END IF;
    v_saldo := saldo_anticipo(v_a.id);
    IF v_equiv > v_saldo + 0.01 THEN
        RAISE EXCEPTION 'El anticipo % solo tiene $% disponibles', v_a.numero_anticipo, to_char(v_saldo, 'FM999999990.00');
    END IF;
    INSERT INTO anticipo_reembolsos (
        empresa_id, anticipo_id, fecha, monto_usd, monto_bs, tasa_cambio, tipo_tasa,
        metodo_usd, metodo_bs, cuenta_bancaria_id, monto_equiv_usd, nota, usuario_id)
    VALUES (
        v_a.empresa_id, v_a.id, p_fecha, COALESCE(p_monto_usd, 0), COALESCE(p_monto_bs, 0),
        p_tasa_cambio, p_tipo_tasa, NULLIF(p_metodo_usd, ''), NULLIF(p_metodo_bs, ''),
        p_cuenta_bancaria_id, v_equiv, NULLIF(btrim(p_nota), ''), auth.uid());
    RETURN jsonb_build_object('estado_anticipo', recalcular_anticipo(v_a.id), 'saldo_anticipo', saldo_anticipo(v_a.id));
END $$;

CREATE OR REPLACE FUNCTION anular_reembolso_anticipo(p_reembolso_id uuid, p_motivo text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r anticipo_reembolsos%ROWTYPE;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo de anulación es obligatorio';
    END IF;
    SELECT * INTO v_r FROM anticipo_reembolsos WHERE id = p_reembolso_id;
    IF v_r.id IS NULL OR (v_r.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Reembolso no encontrado';
    END IF;
    IF NOT _anticipo_puede_anular(v_r.empresa_id) THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden anular reembolsos';
    END IF;
    IF v_r.anulado THEN RAISE EXCEPTION 'Este reembolso ya está anulado'; END IF;
    PERFORM 1 FROM anticipos_proveedor WHERE id = v_r.anticipo_id FOR UPDATE;
    UPDATE anticipo_reembolsos
       SET anulado = true, motivo_anulacion = btrim(p_motivo), anulado_por = auth.uid(), fecha_anulacion = now()
     WHERE id = v_r.id;
    RETURN recalcular_anticipo(v_r.anticipo_id);
END $$;

-- ── 9. anular_pago_proveedor: la definición vigente + devolver saldo al anticipo
CREATE OR REPLACE FUNCTION public.anular_pago_proveedor(p_pago_id uuid, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago pagos_proveedor%ROWTYPE;
  v_compra compras%ROWTYPE;
  v_rol text;
  v_pagado numeric;
  v_debido numeric;
  v_estado text;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de anulación es obligatorio';
  END IF;

  SELECT rol INTO v_rol FROM usuarios WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'finanzas', 'superadmin') THEN
    RAISE EXCEPTION 'Solo Finanzas o Administración pueden anular pagos';
  END IF;

  SELECT * INTO v_pago FROM pagos_proveedor WHERE id = p_pago_id;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_pago.empresa_id <> get_empresa_id() AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;
  IF v_pago.anulado THEN RAISE EXCEPTION 'Este pago ya está anulado'; END IF;

  -- Si es la aplicación de un anticipo, bloquear el anticipo ANTES que la
  -- recepción (mismo orden que aplicar_anticipo_proveedor: evita deadlocks)
  IF v_pago.anticipo_id IS NOT NULL THEN
    PERFORM 1 FROM anticipos_proveedor WHERE id = v_pago.anticipo_id FOR UPDATE;
  END IF;

  -- Bloquea la recepción: dos anulaciones/pagos simultáneos no pisan el estado
  SELECT * INTO v_compra FROM compras WHERE id = v_pago.compra_id FOR UPDATE;
  IF v_compra.estado = 'anulada' THEN
    RAISE EXCEPTION 'La recepción está anulada';
  END IF;

  UPDATE pagos_proveedor
     SET anulado = true,
         motivo_anulacion = btrim(p_motivo),
         anulado_por = auth.uid(),
         fecha_anulacion = now()
   WHERE id = p_pago_id;

  IF v_pago.devolucion_proveedor_id IS NOT NULL THEN
    UPDATE devoluciones_proveedor SET estado_nd = 'pendiente'
     WHERE id = v_pago.devolucion_proveedor_id AND estado_nd = 'aplicada';
  END IF;

  -- El saldo aplicado vuelve al anticipo
  IF v_pago.anticipo_id IS NOT NULL THEN
    PERFORM recalcular_anticipo(v_pago.anticipo_id);
  END IF;

  SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
    FROM pagos_proveedor WHERE compra_id = v_compra.id AND NOT anulado;
  v_debido := COALESCE(v_compra.total, 0) - COALESCE(v_compra.descuento_pago, 0);
  v_estado := CASE
    WHEN v_pagado >= v_debido - 0.01 THEN 'pagado'
    WHEN v_pagado > 0.01 THEN 'parcial'
    ELSE 'pendiente'
  END;

  UPDATE compras SET estado_cobro = v_estado WHERE id = v_compra.id;
  RETURN v_estado;
END $function$;

-- ── 10. Vista de saldos (RLS del que consulta) ──────────────────────────────
CREATE OR REPLACE VIEW v_anticipos_saldo WITH (security_invoker = true) AS
SELECT a.*,
       COALESCE(ap.aplicado, 0)    AS aplicado_usd,
       COALESCE(re.reembolsado, 0) AS reembolsado_usd,
       CASE WHEN a.estado = 'anulado' THEN 0
            ELSE a.monto_equiv_usd - COALESCE(ap.aplicado, 0) - COALESCE(re.reembolsado, 0) END AS saldo_usd
FROM anticipos_proveedor a
LEFT JOIN (SELECT anticipo_id, SUM(monto_usd) AS aplicado FROM pagos_proveedor
            WHERE anticipo_id IS NOT NULL AND NOT anulado GROUP BY anticipo_id) ap ON ap.anticipo_id = a.id
LEFT JOIN (SELECT anticipo_id, SUM(monto_equiv_usd) AS reembolsado FROM anticipo_reembolsos
            WHERE NOT anulado GROUP BY anticipo_id) re ON re.anticipo_id = a.id;

-- ── 11. Permisos de ejecución: solo usuarios autenticados ───────────────────
REVOKE ALL ON FUNCTION _anticipo_puede_operar(uuid), _anticipo_puede_anular(uuid),
    recalcular_anticipo(uuid), _recalcular_estado_cobro_compra(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION saldo_anticipo(uuid),
    registrar_anticipo_proveedor(uuid, uuid, date, numeric, numeric, numeric, text, text, text, uuid, text, text),
    aplicar_anticipo_proveedor(uuid, uuid, numeric), anular_anticipo_proveedor(uuid, text),
    registrar_reembolso_anticipo(uuid, date, numeric, numeric, numeric, text, text, text, uuid, text),
    anular_reembolso_anticipo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saldo_anticipo(uuid),
    registrar_anticipo_proveedor(uuid, uuid, date, numeric, numeric, numeric, text, text, text, uuid, text, text),
    aplicar_anticipo_proveedor(uuid, uuid, numeric), anular_anticipo_proveedor(uuid, text),
    registrar_reembolso_anticipo(uuid, date, numeric, numeric, numeric, text, text, text, uuid, text),
    anular_reembolso_anticipo(uuid, text) TO authenticated;
GRANT SELECT ON anticipos_proveedor, anticipo_reembolsos, v_anticipos_saldo TO authenticated;
