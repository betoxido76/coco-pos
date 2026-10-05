-- ═══════════════════════════════════════════════════════════════════════════
-- Retenciones de IVA e ISLR a proveedores — Fase 1: base de datos
-- Plan: docs/plan-retenciones.md
--
-- La retención se registra AL PAGAR, como un abono sin caja a la obligación
-- (fila en pagos_proveedor o pagos con retencion_id y sin cuenta bancaria),
-- igual que la aplicación de un anticipo. Escritura solo por RPC.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Configuración ───────────────────────────────────────────────────────────
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS agente_retencion boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN empresas.agente_retencion IS
  'La empresa retiene IVA/ISLR a sus proveedores (docs/plan-retenciones.md). Apagado = nada de retenciones aparece.';

ALTER TABLE proveedores
  ADD COLUMN IF NOT EXISTS retiene_iva boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pct_retencion_iva numeric CHECK (pct_retencion_iva IS NULL OR (pct_retencion_iva > 0 AND pct_retencion_iva <= 100)),
  ADD COLUMN IF NOT EXISTS retiene_islr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pct_retencion_islr numeric CHECK (pct_retencion_islr IS NULL OR (pct_retencion_islr > 0 AND pct_retencion_islr <= 100));

-- Desglose del gasto (USD, como gastos.monto). NULL en gastos viejos.
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS base_imponible numeric CHECK (base_imponible IS NULL OR base_imponible >= 0),
  ADD COLUMN IF NOT EXISTS monto_iva numeric CHECK (monto_iva IS NULL OR monto_iva >= 0);

-- ── Retenciones ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retenciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES empresas(id),
  tipo              text NOT NULL CHECK (tipo IN ('iva', 'islr')),
  origen_tipo       text NOT NULL CHECK (origen_tipo IN ('compra', 'gasto')),
  origen_id         uuid NOT NULL,
  proveedor_id      uuid REFERENCES proveedores(id),
  fecha             date NOT NULL,
  base_calculo      numeric NOT NULL,          -- IVA del documento (iva) o base imponible (islr), USD
  porcentaje        numeric NOT NULL,          -- foto del % del proveedor al retener
  monto_usd         numeric NOT NULL CHECK (monto_usd > 0),
  tasa_cambio       numeric NOT NULL,
  tipo_tasa         text,
  monto_bs          numeric NOT NULL,
  estado            text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulada')),
  usuario_id        uuid REFERENCES usuarios(id),
  anulado_por       uuid REFERENCES usuarios(id),
  fecha_anulacion   timestamptz,
  motivo_anulacion  text,
  -- Para el proceso completo (hoy lo lleva Galac): NULL por ahora
  numero_comprobante      text,
  periodo                 text,
  concepto_islr           text,
  fecha_enteramiento      date,
  referencia_enteramiento text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE retenciones IS
  'Retenciones de IVA/ISLR hechas al pagar a un proveedor. Escritura solo por RPC (registrar_retenciones / anular_retencion). docs/plan-retenciones.md';

-- Una sola retención vigente por documento y tipo
CREATE UNIQUE INDEX IF NOT EXISTS retenciones_vigente_unica
  ON retenciones (origen_tipo, origen_id, tipo) WHERE estado = 'vigente';
CREATE INDEX IF NOT EXISTS retenciones_empresa_fecha ON retenciones (empresa_id, fecha);

ALTER TABLE retenciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retenciones_select ON retenciones;
CREATE POLICY retenciones_select ON retenciones FOR SELECT
  USING (empresa_id = get_empresa_id() OR is_superadmin());
-- Sin políticas de INSERT/UPDATE/DELETE: solo las RPC (SECURITY DEFINER) escriben.

-- El abono sin caja que representa la retención
ALTER TABLE pagos_proveedor ADD COLUMN IF NOT EXISTS retencion_id uuid REFERENCES retenciones(id);
ALTER TABLE pagos           ADD COLUMN IF NOT EXISTS retencion_id uuid REFERENCES retenciones(id);
ALTER TABLE pagos_proveedor DROP CONSTRAINT IF EXISTS pagos_proveedor_retencion_sin_cuenta;
ALTER TABLE pagos_proveedor ADD CONSTRAINT pagos_proveedor_retencion_sin_cuenta
  CHECK (retencion_id IS NULL OR cuenta_bancaria_id IS NULL);
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_retencion_sin_cuenta;
ALTER TABLE pagos ADD CONSTRAINT pagos_retencion_sin_cuenta
  CHECK (retencion_id IS NULL OR cuenta_bancaria_id IS NULL);

-- retencion_id solo se escribe desde las RPC
CREATE OR REPLACE FUNCTION _guarda_retencion_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.retencion_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.retencion_id IS DISTINCT FROM OLD.retencion_id)
       AND COALESCE(current_setting('mipos.registrando_retencion', true), '') <> 'on' THEN
        RAISE EXCEPTION 'Las retenciones se registran con registrar_retenciones';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pagos_proveedor_guarda_retencion ON pagos_proveedor;
CREATE TRIGGER pagos_proveedor_guarda_retencion
  BEFORE INSERT OR UPDATE OF retencion_id ON pagos_proveedor
  FOR EACH ROW EXECUTE FUNCTION _guarda_retencion_id();
DROP TRIGGER IF EXISTS pagos_guarda_retencion ON pagos;
CREATE TRIGGER pagos_guarda_retencion
  BEFORE INSERT OR UPDATE OF retencion_id ON pagos
  FOR EACH ROW EXECUTE FUNCTION _guarda_retencion_id();

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Quién puede retener: quien puede pagar (compras, CxP o gastos)
CREATE OR REPLACE FUNCTION _retencion_puede_operar(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT is_superadmin()
        OR EXISTS (SELECT 1 FROM usuario_modulos
                    WHERE usuario_id = auth.uid() AND empresa_id = p_empresa
                      AND modulo_id IN ('compras', 'cxp', 'gastos') AND activo);
$$;

-- Total de un gasto en USD (mismo criterio que la app y v_export_gastos)
CREATE OR REPLACE FUNCTION _total_gasto_usd(g gastos)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT round(CASE WHEN COALESCE(g.monto, 0) > 0 THEN g.monto
                      ELSE COALESCE(g.monto_usd, 0) + COALESCE(g.monto_bs, 0) / NULLIF(g.tasa_cambio, 0) END, 2);
$$;

-- Estado de un gasto derivado de sus abonos (no toca uno anulado)
CREATE OR REPLACE FUNCTION _recalcular_estado_gasto(p_gasto_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_g gastos%ROWTYPE; v_pagado numeric; v_estado text;
BEGIN
    SELECT * INTO v_g FROM gastos WHERE id = p_gasto_id;
    IF v_g.estado = 'anulado' THEN RETURN 'anulado'; END IF;
    SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
      FROM pagos WHERE origen_tipo = 'gasto' AND origen_id = p_gasto_id;
    v_estado := CASE
        WHEN v_pagado >= _total_gasto_usd(v_g) - 0.01 THEN 'pagado'
        WHEN v_pagado > 0.01 THEN 'parcial'
        ELSE 'pendiente'
    END;
    UPDATE gastos SET estado = v_estado WHERE id = p_gasto_id;
    RETURN v_estado;
END $$;

-- ── registrar_retenciones ───────────────────────────────────────────────────
-- Calcula en el servidor (no confía en montos del navegador) y escribe, por
-- cada tipo pedido: la retención + su abono sin caja. Devuelve lo retenido.
-- p_base / p_iva: solo para gastos sin desglose; se guardan en el gasto.
CREATE OR REPLACE FUNCTION registrar_retenciones(
    p_origen_tipo text, p_origen_id uuid, p_fecha date, p_tasa numeric, p_tipo_tasa text,
    p_aplicar_iva boolean, p_aplicar_islr boolean,
    p_base numeric DEFAULT NULL, p_iva numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_empresa uuid; v_proveedor uuid; v_numero text;
    v_base numeric; v_iva numeric; v_saldo numeric; v_total numeric; v_pagado numeric;
    v_prov proveedores%ROWTYPE; v_c compras%ROWTYPE; v_g gastos%ROWTYPE;
    v_tipo text; v_pct numeric; v_calc numeric; v_monto numeric; v_ret_id uuid;
    v_out jsonb := '{}'::jsonb; v_tasa numeric;
BEGIN
    v_tasa := COALESCE(NULLIF(p_tasa, 0), 1);
    IF p_fecha IS NULL THEN RAISE EXCEPTION 'Falta la fecha del pago'; END IF;

    IF p_origen_tipo = 'compra' THEN
        SELECT * INTO v_c FROM compras WHERE id = p_origen_id FOR UPDATE;
        IF v_c.id IS NULL THEN RAISE EXCEPTION 'Recepción no encontrada'; END IF;
        IF v_c.estado = 'anulada' THEN RAISE EXCEPTION 'La recepción está anulada'; END IF;
        v_empresa := v_c.empresa_id; v_proveedor := v_c.proveedor_id; v_numero := v_c.numero_doc;
        IF v_c.base_gravada IS NULL AND v_c.base_exenta IS NULL THEN
            RAISE EXCEPTION 'La recepción % no tiene base e IVA desglosados: no se puede calcular la retención', v_numero;
        END IF;
        v_base := COALESCE(v_c.base_gravada, 0) + COALESCE(v_c.base_exenta, 0);
        v_iva  := COALESCE(v_c.iva, 0);
        SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
          FROM pagos_proveedor WHERE compra_id = v_c.id AND NOT anulado;
        v_saldo := COALESCE(v_c.total, 0) - COALESCE(v_c.descuento_pago, 0) - v_pagado;
    ELSIF p_origen_tipo = 'gasto' THEN
        SELECT * INTO v_g FROM gastos WHERE id = p_origen_id FOR UPDATE;
        IF v_g.id IS NULL THEN RAISE EXCEPTION 'Gasto no encontrado'; END IF;
        IF v_g.estado = 'anulado' THEN RAISE EXCEPTION 'El gasto está anulado'; END IF;
        v_empresa := v_g.empresa_id; v_proveedor := v_g.proveedor_id; v_numero := v_g.numero_gasto;
        v_total := _total_gasto_usd(v_g);
        IF p_base IS NOT NULL OR p_iva IS NOT NULL THEN
            IF COALESCE(p_base, 0) <= 0 OR COALESCE(p_iva, 0) < 0 THEN
                RAISE EXCEPTION 'Base imponible e IVA inválidos';
            END IF;
            IF round(p_base + p_iva, 2) > v_total + 0.01 THEN
                RAISE EXCEPTION 'Base imponible + IVA ($%) supera el total del gasto ($%)',
                    to_char(p_base + p_iva, 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
            END IF;
            UPDATE gastos SET base_imponible = round(p_base, 2), monto_iva = round(p_iva, 2) WHERE id = v_g.id;
            v_g.base_imponible := round(p_base, 2); v_g.monto_iva := round(p_iva, 2);
        END IF;
        IF v_g.base_imponible IS NULL THEN
            RAISE EXCEPTION 'El gasto % no tiene base imponible e IVA: indícalos para calcular la retención', v_numero;
        END IF;
        v_base := v_g.base_imponible; v_iva := COALESCE(v_g.monto_iva, 0);
        SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
          FROM pagos WHERE origen_tipo = 'gasto' AND origen_id = v_g.id;
        v_saldo := v_total - v_pagado;
    ELSE
        RAISE EXCEPTION 'Origen inválido: %', p_origen_tipo;
    END IF;

    IF v_empresa <> get_empresa_id() AND NOT is_superadmin() THEN RAISE EXCEPTION 'Documento no encontrado'; END IF;
    IF NOT _retencion_puede_operar(v_empresa) THEN
        RAISE EXCEPTION 'Necesitas el módulo de Compras, Cuentas por Pagar o Gastos para registrar retenciones';
    END IF;
    IF NOT (SELECT agente_retencion FROM empresas WHERE id = v_empresa) THEN
        RAISE EXCEPTION 'La empresa no está configurada como agente de retención';
    END IF;
    IF v_proveedor IS NULL THEN RAISE EXCEPTION 'El documento % no tiene proveedor', v_numero; END IF;
    SELECT * INTO v_prov FROM proveedores WHERE id = v_proveedor;

    PERFORM set_config('mipos.registrando_retencion', 'on', true);
    FOREACH v_tipo IN ARRAY ARRAY['iva', 'islr'] LOOP
        IF (v_tipo = 'iva' AND NOT COALESCE(p_aplicar_iva, false))
           OR (v_tipo = 'islr' AND NOT COALESCE(p_aplicar_islr, false)) THEN
            CONTINUE;
        END IF;
        IF v_tipo = 'iva' THEN
            IF NOT v_prov.retiene_iva OR v_prov.pct_retencion_iva IS NULL THEN
                RAISE EXCEPTION 'El proveedor % no está marcado para retención de IVA', v_prov.nombre;
            END IF;
            v_pct := v_prov.pct_retencion_iva; v_calc := v_iva;
        ELSE
            IF NOT v_prov.retiene_islr OR v_prov.pct_retencion_islr IS NULL THEN
                RAISE EXCEPTION 'El proveedor % no está marcado para retención de ISLR', v_prov.nombre;
            END IF;
            v_pct := v_prov.pct_retencion_islr; v_calc := v_base;
        END IF;
        IF EXISTS (SELECT 1 FROM retenciones WHERE origen_tipo = p_origen_tipo AND origen_id = p_origen_id
                     AND tipo = v_tipo AND estado = 'vigente') THEN
            RAISE EXCEPTION '% ya tiene retención de % registrada', v_numero, upper(v_tipo);
        END IF;
        v_monto := round(v_calc * v_pct / 100, 2);
        IF v_monto <= 0 THEN CONTINUE; END IF;
        IF v_monto > v_saldo + 0.01 THEN
            RAISE EXCEPTION 'La retención de % ($%) supera el saldo de % ($%)', upper(v_tipo),
                to_char(v_monto, 'FM999999990.00'), v_numero, to_char(GREATEST(v_saldo, 0), 'FM999999990.00');
        END IF;

        INSERT INTO retenciones (empresa_id, tipo, origen_tipo, origen_id, proveedor_id, fecha,
                                 base_calculo, porcentaje, monto_usd, tasa_cambio, tipo_tasa, monto_bs, usuario_id)
        VALUES (v_empresa, v_tipo, p_origen_tipo, p_origen_id, v_proveedor, p_fecha,
                round(v_calc, 2), v_pct, v_monto, v_tasa, p_tipo_tasa, round(v_monto * v_tasa, 2), auth.uid())
        RETURNING id INTO v_ret_id;

        IF p_origen_tipo = 'compra' THEN
            INSERT INTO pagos_proveedor (compra_id, usuario_id, fecha_pago, monto_usd, monto_bs, tasa_cambio,
                                         tipo_tasa, metodo_usd, nota, empresa_id, retencion_id)
            VALUES (p_origen_id, auth.uid(), (p_fecha + time '12:00') AT TIME ZONE 'America/Caracas',
                    v_monto, 0, v_tasa, p_tipo_tasa, 'retencion_' || v_tipo,
                    'Retención ' || upper(v_tipo) || ' ' || to_char(v_pct, 'FM990.##') || '%', v_empresa, v_ret_id);
        ELSE
            INSERT INTO pagos (empresa_id, origen_tipo, origen_id, fecha, monto_usd, monto_bs, tasa_cambio,
                               tipo_tasa, metodo_usd, nota, usuario_id, retencion_id)
            VALUES (v_empresa, 'gasto', p_origen_id, p_fecha, v_monto, 0, v_tasa, p_tipo_tasa,
                    'retencion_' || v_tipo, 'Retención ' || upper(v_tipo) || ' ' || to_char(v_pct, 'FM990.##') || '%',
                    auth.uid(), v_ret_id);
        END IF;

        v_saldo := v_saldo - v_monto;
        v_out := v_out || jsonb_build_object(v_tipo, jsonb_build_object('id', v_ret_id, 'monto', v_monto, 'porcentaje', v_pct));
    END LOOP;
    PERFORM set_config('mipos.registrando_retencion', 'off', true);

    IF p_origen_tipo = 'compra' THEN PERFORM _recalcular_estado_cobro_compra(p_origen_id);
    ELSE PERFORM _recalcular_estado_gasto(p_origen_id); END IF;
    RETURN v_out;
END $$;

-- ── anular_retencion ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION anular_retencion(p_retencion_id uuid, p_motivo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_r retenciones%ROWTYPE; v_rol text;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo de anulación es obligatorio'; END IF;
    SELECT rol INTO v_rol FROM usuarios WHERE id = auth.uid();
    IF NOT is_superadmin() AND (v_rol IS NULL OR v_rol NOT IN ('admin', 'finanzas')) THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden anular retenciones';
    END IF;
    SELECT * INTO v_r FROM retenciones WHERE id = p_retencion_id FOR UPDATE;
    IF v_r.id IS NULL OR (v_r.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Retención no encontrada';
    END IF;
    IF v_r.estado = 'anulada' THEN RAISE EXCEPTION 'La retención ya está anulada'; END IF;

    UPDATE retenciones SET estado = 'anulada', anulado_por = auth.uid(), fecha_anulacion = now(),
                           motivo_anulacion = btrim(p_motivo)
     WHERE id = v_r.id;

    IF v_r.origen_tipo = 'compra' THEN
        UPDATE pagos_proveedor SET anulado = true, motivo_anulacion = btrim(p_motivo),
                                   anulado_por = auth.uid(), fecha_anulacion = now()
         WHERE retencion_id = v_r.id AND NOT anulado;
        RETURN _recalcular_estado_cobro_compra(v_r.origen_id);
    ELSE
        -- `pagos` no tiene anulación lógica: el rastro queda en `retenciones`
        DELETE FROM pagos WHERE retencion_id = v_r.id;
        RETURN _recalcular_estado_gasto(v_r.origen_id);
    END IF;
END $$;

-- ── anular_pago_proveedor: anular el abono de una retención anula la retención
-- (misma función de anular_pago_proveedor.sql + el bloque de retención)
CREATE OR REPLACE FUNCTION public.anular_pago_proveedor(p_pago_id uuid, p_motivo text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  IF v_pago.anticipo_id IS NOT NULL THEN
    PERFORM 1 FROM anticipos_proveedor WHERE id = v_pago.anticipo_id FOR UPDATE;
  END IF;

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

  IF v_pago.anticipo_id IS NOT NULL THEN
    PERFORM recalcular_anticipo(v_pago.anticipo_id);
  END IF;

  -- El abono era una retención: la retención queda anulada con el mismo motivo
  IF v_pago.retencion_id IS NOT NULL THEN
    UPDATE retenciones SET estado = 'anulada', anulado_por = auth.uid(), fecha_anulacion = now(),
                           motivo_anulacion = btrim(p_motivo)
     WHERE id = v_pago.retencion_id AND estado = 'vigente';
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

-- Las funciones internas no se exponen por la API
REVOKE EXECUTE ON FUNCTION _retencion_puede_operar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _recalcular_estado_gasto(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION registrar_retenciones(text, uuid, date, numeric, text, boolean, boolean, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION anular_retencion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_retenciones(text, uuid, date, numeric, text, boolean, boolean, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION anular_retencion(uuid, text) TO authenticated;
