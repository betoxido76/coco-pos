-- ═══════════════════════════════════════════════════════════════════════════
-- Retenciones que nos hacen los clientes (CxC) — Fase 1: base de datos
-- Plan: docs/plan-retenciones-clientes.md
--
-- Espejo de retenciones_fase1.sql (CxP). El cliente contribuyente especial le
-- retiene a la empresa al pagar; los % son de la EMPRESA, no del cliente. La
-- retención es un abono sin caja a la nota: fila en `cobros` con retencion_id y
-- sin cuenta bancaria (como la aplicación de una NC). Escritura solo por RPC.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Configuración ───────────────────────────────────────────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS ret_clientes_pct_iva numeric
    CHECK (ret_clientes_pct_iva IS NULL OR (ret_clientes_pct_iva >= 0 AND ret_clientes_pct_iva <= 100)),
  ADD COLUMN IF NOT EXISTS ret_clientes_pct_islr numeric
    CHECK (ret_clientes_pct_islr IS NULL OR (ret_clientes_pct_islr >= 0 AND ret_clientes_pct_islr <= 100));
COMMENT ON COLUMN empresas.ret_clientes_pct_iva IS
  '% del IVA de la nota que retienen los clientes contribuyentes especiales (docs/plan-retenciones-clientes.md). NULL/0 = no aplica.';
COMMENT ON COLUMN empresas.ret_clientes_pct_islr IS
  '% de la base imponible que retienen por ISLR los clientes contribuyentes especiales. NULL/0 = no aplica.';

-- ── Retenciones: origen 'venta' con cliente ─────────────────────────────────
ALTER TABLE retenciones ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes(id);
ALTER TABLE retenciones DROP CONSTRAINT IF EXISTS retenciones_origen_tipo_check;
ALTER TABLE retenciones ADD CONSTRAINT retenciones_origen_tipo_check
  CHECK (origen_tipo IN ('compra', 'gasto', 'venta'));
ALTER TABLE retenciones DROP CONSTRAINT IF EXISTS retenciones_venta_cliente;
ALTER TABLE retenciones ADD CONSTRAINT retenciones_venta_cliente
  CHECK (origen_tipo <> 'venta' OR (cliente_id IS NOT NULL AND proveedor_id IS NULL));
COMMENT ON COLUMN retenciones.cliente_id IS
  'Solo origen_tipo = venta: el cliente que retuvo. numero_comprobante = N° del comprobante que entrega el cliente.';

-- ── Abono de la retención en cobros ─────────────────────────────────────────
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS retencion_id uuid REFERENCES retenciones(id);
ALTER TABLE cobros DROP CONSTRAINT IF EXISTS cobros_retencion_sin_cuenta;
ALTER TABLE cobros ADD CONSTRAINT cobros_retencion_sin_cuenta
  CHECK (retencion_id IS NULL OR cuenta_bancaria_id IS NULL);
CREATE INDEX IF NOT EXISTS cobros_retencion_idx ON cobros (retencion_id) WHERE retencion_id IS NOT NULL;
COMMENT ON COLUMN cobros.retencion_id IS
  'Abono de una retención del cliente (metodo_usd retencion_iva/retencion_islr). Sin caja: Finanzas y Bancos lo excluyen.';

DROP TRIGGER IF EXISTS cobros_guarda_retencion ON cobros;
CREATE TRIGGER cobros_guarda_retencion BEFORE INSERT OR UPDATE OF retencion_id ON cobros
  FOR EACH ROW EXECUTE FUNCTION _guarda_retencion_id();

-- ── Permisos ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _retencion_venta_puede_operar(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT is_superadmin()
        OR EXISTS (SELECT 1 FROM usuario_modulos
                    WHERE usuario_id = auth.uid() AND empresa_id = p_empresa
                      AND modulo_id IN ('cxc', 'ventas') AND activo);
$$;

-- ── Estado de cobro de una nota (cobros + pago directo de la venta) ─────────
-- Misma regla que anular_nota_credito. Una nota anulada no cambia.
CREATE OR REPLACE FUNCTION _recalcular_estado_cobro_venta(p_venta_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cobrado numeric; v_total numeric; v_estado text; v_actual text;
BEGIN
    SELECT COALESCE(SUM(c.monto_usd + COALESCE(c.monto_bs / NULLIF(c.tasa_cambio, 0), 0)), 0)
      INTO v_cobrado FROM cobros c WHERE c.venta_id = p_venta_id;
    SELECT v_cobrado + COALESCE(v.pago_usd, 0) + COALESCE(v.pago_bs / NULLIF(v.tasa_cambio, 0), 0),
           v.total, v.estado_cobro
      INTO v_cobrado, v_total, v_actual
      FROM ventas v WHERE v.id = p_venta_id;
    IF v_actual = 'anulado' THEN RETURN v_actual; END IF;
    v_estado := CASE WHEN v_cobrado >= COALESCE(v_total, 0) - 0.01 THEN 'pagado'
                     WHEN v_cobrado > 0.01 THEN 'parcial'
                     ELSE 'pendiente' END;
    UPDATE ventas SET estado_cobro = v_estado WHERE id = p_venta_id AND estado_cobro IS DISTINCT FROM v_estado;
    RETURN v_estado;
END $$;

-- ── Registrar las retenciones de una nota ───────────────────────────────────
-- Calcula en el servidor con los montos guardados de la nota (mismo criterio que
-- totalesGuardados en src/lib/iva.js) y el % vigente de la empresa, que queda
-- congelado en la retención.
CREATE OR REPLACE FUNCTION registrar_retenciones_venta(
    p_venta_id uuid, p_fecha date, p_tasa numeric, p_tipo_tasa text,
    p_aplicar_iva boolean, p_aplicar_islr boolean, p_numero_comprobante text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_v ventas%ROWTYPE; v_cli clientes%ROWTYPE; v_emp empresas%ROWTYPE;
    v_subtotal numeric; v_iva numeric; v_base numeric; v_cobrado numeric; v_saldo numeric;
    v_tipo text; v_pct numeric; v_calc numeric; v_monto numeric; v_ret_id uuid;
    v_out jsonb := '{}'::jsonb; v_tasa numeric; v_comp text;
BEGIN
    v_tasa := COALESCE(NULLIF(p_tasa, 0), 1);
    v_comp := NULLIF(btrim(COALESCE(p_numero_comprobante, '')), '');
    IF p_fecha IS NULL THEN RAISE EXCEPTION 'Falta la fecha del cobro'; END IF;

    SELECT * INTO v_v FROM ventas WHERE id = p_venta_id FOR UPDATE;
    IF v_v.id IS NULL OR (v_v.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Nota no encontrada';
    END IF;
    IF v_v.estado_cobro = 'anulado' OR v_v.motivo_anulacion IS NOT NULL THEN
        RAISE EXCEPTION 'La nota % está anulada', v_v.numero_factura;
    END IF;
    IF NOT _retencion_venta_puede_operar(v_v.empresa_id) THEN
        RAISE EXCEPTION 'Necesitas el módulo de Cuentas por Cobrar o Ventas para registrar retenciones';
    END IF;

    SELECT * INTO v_cli FROM clientes WHERE id = v_v.cliente_id;
    IF v_cli.id IS NULL THEN RAISE EXCEPTION 'La nota % no tiene cliente', v_v.numero_factura; END IF;
    IF NOT COALESCE(v_cli.contribuyente_especial, false) THEN
        RAISE EXCEPTION 'El cliente % no es contribuyente especial', v_cli.nombre;
    END IF;
    SELECT * INTO v_emp FROM empresas WHERE id = v_v.empresa_id;

    -- Montos de la nota (totalesGuardados)
    v_subtotal := COALESCE(v_v.subtotal,
                    CASE WHEN v_v.base_gravada IS NOT NULL
                         THEN v_v.base_gravada + COALESCE(v_v.base_exenta, 0) END,
                    v_v.total);
    v_iva  := COALESCE(v_v.iva, round(COALESCE(v_v.total, 0) - v_subtotal, 2));
    v_base := COALESCE(v_v.base_gravada + COALESCE(v_v.base_exenta, 0), v_subtotal);

    SELECT COALESCE(SUM(monto_usd + COALESCE(monto_bs / NULLIF(tasa_cambio, 0), 0)), 0)
      INTO v_cobrado FROM cobros WHERE venta_id = v_v.id;
    v_saldo := COALESCE(v_v.total, 0) - v_cobrado - COALESCE(v_v.pago_usd, 0)
               - COALESCE(v_v.pago_bs / NULLIF(v_v.tasa_cambio, 0), 0);

    PERFORM set_config('mipos.registrando_retencion', 'on', true);
    FOREACH v_tipo IN ARRAY ARRAY['iva', 'islr'] LOOP
        IF (v_tipo = 'iva' AND NOT COALESCE(p_aplicar_iva, false))
           OR (v_tipo = 'islr' AND NOT COALESCE(p_aplicar_islr, false)) THEN
            CONTINUE;
        END IF;
        IF v_tipo = 'iva' THEN v_pct := v_emp.ret_clientes_pct_iva;  v_calc := v_iva;
        ELSE                   v_pct := v_emp.ret_clientes_pct_islr; v_calc := v_base; END IF;
        IF COALESCE(v_pct, 0) <= 0 THEN
            RAISE EXCEPTION 'La empresa no tiene configurado el %% de retención de % de clientes', upper(v_tipo);
        END IF;
        IF EXISTS (SELECT 1 FROM retenciones WHERE origen_tipo = 'venta' AND origen_id = v_v.id
                     AND tipo = v_tipo AND estado = 'vigente') THEN
            RAISE EXCEPTION '% ya tiene retención de % registrada', v_v.numero_factura, upper(v_tipo);
        END IF;
        v_monto := round(v_calc * v_pct / 100, 2);
        IF v_monto <= 0 THEN CONTINUE; END IF;
        IF v_monto > v_saldo + 0.01 THEN
            RAISE EXCEPTION 'La retención de % ($%) supera el saldo de % ($%)', upper(v_tipo),
                to_char(v_monto, 'FM999999990.00'), v_v.numero_factura, to_char(GREATEST(v_saldo, 0), 'FM999999990.00');
        END IF;

        INSERT INTO retenciones (empresa_id, tipo, origen_tipo, origen_id, cliente_id, fecha,
                                 base_calculo, porcentaje, monto_usd, tasa_cambio, tipo_tasa, monto_bs,
                                 numero_comprobante, usuario_id)
        VALUES (v_v.empresa_id, v_tipo, 'venta', v_v.id, v_cli.id, p_fecha,
                round(v_calc, 2), v_pct, v_monto, v_tasa, p_tipo_tasa, round(v_monto * v_tasa, 2),
                v_comp, auth.uid())
        RETURNING id INTO v_ret_id;

        INSERT INTO cobros (venta_id, fecha_cobro, monto_usd, monto_bs, tasa_cambio, tipo_tasa,
                            metodo_usd, nota, usuario_id, empresa_id, contribuyente_especial, retencion_id)
        VALUES (v_v.id, (p_fecha + time '12:00') AT TIME ZONE 'America/Caracas', v_monto, 0, v_tasa, p_tipo_tasa,
                'retencion_' || v_tipo,
                'Retención ' || upper(v_tipo) || ' ' || to_char(v_pct, 'FM990.##') || '%'
                    || COALESCE(' · Comp. ' || v_comp, ''),
                auth.uid(), v_v.empresa_id, true, v_ret_id);

        v_saldo := v_saldo - v_monto;
        v_out := v_out || jsonb_build_object(v_tipo, jsonb_build_object('id', v_ret_id, 'monto', v_monto, 'porcentaje', v_pct));
    END LOOP;
    PERFORM set_config('mipos.registrando_retencion', 'off', true);

    PERFORM _recalcular_estado_cobro_venta(v_v.id);
    RETURN v_out;
END $$;

-- ── Completar o corregir el N° de comprobante después ───────────────────────
CREATE OR REPLACE FUNCTION actualizar_comprobante_retencion(p_retencion_id uuid, p_numero text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_r retenciones%ROWTYPE;
BEGIN
    SELECT * INTO v_r FROM retenciones WHERE id = p_retencion_id FOR UPDATE;
    IF v_r.id IS NULL OR (v_r.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Retención no encontrada';
    END IF;
    IF v_r.origen_tipo <> 'venta' THEN
        RAISE EXCEPTION 'Los comprobantes de retenciones a proveedores se llevan en Galac';
    END IF;
    IF v_r.estado = 'anulada' THEN RAISE EXCEPTION 'La retención está anulada'; END IF;
    IF NOT _retencion_venta_puede_operar(v_r.empresa_id) THEN
        RAISE EXCEPTION 'Necesitas el módulo de Cuentas por Cobrar o Ventas';
    END IF;
    UPDATE retenciones SET numero_comprobante = NULLIF(btrim(COALESCE(p_numero, '')), '') WHERE id = v_r.id;
END $$;

-- ── Anular: rama 'venta' ────────────────────────────────────────────────────
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
    ELSIF v_r.origen_tipo = 'venta' THEN
        -- cobros no tiene anulación lógica: el abono se borra (como al anular una NC)
        DELETE FROM cobros WHERE retencion_id = v_r.id;
        RETURN _recalcular_estado_cobro_venta(v_r.origen_id);
    ELSE
        DELETE FROM pagos WHERE retencion_id = v_r.id;
        RETURN _recalcular_estado_gasto(v_r.origen_id);
    END IF;
END $$;

-- ── Nota anulada → sus retenciones también ──────────────────────────────────
-- Cubre anular_nota_no_despachada y la devolución total (Ventas), sin tocarlas.
CREATE OR REPLACE FUNCTION _ventas_anula_retenciones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    IF NEW.estado_cobro = 'anulado' AND OLD.estado_cobro IS DISTINCT FROM 'anulado' THEN
        DELETE FROM cobros WHERE venta_id = NEW.id AND retencion_id IS NOT NULL;
        UPDATE retenciones SET estado = 'anulada', anulado_por = auth.uid(), fecha_anulacion = now(),
                               motivo_anulacion = 'Nota anulada' || COALESCE(': ' || NEW.motivo_anulacion, '')
         WHERE origen_tipo = 'venta' AND origen_id = NEW.id AND estado = 'vigente';
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS ventas_anula_retenciones ON ventas;
CREATE TRIGGER ventas_anula_retenciones AFTER UPDATE OF estado_cobro ON ventas
  FOR EACH ROW EXECUTE FUNCTION _ventas_anula_retenciones();

-- ── Exportador: marcar la retención ─────────────────────────────────────────
CREATE OR REPLACE VIEW v_export_cobros WITH (security_invoker = true) AS
 SELECT co.id AS cobro_id,
    co.empresa_id,
    co.fecha_cobro,
    ((co.fecha_cobro AT TIME ZONE 'America/Caracas'::text))::date AS fecha,
    ((co.created_at AT TIME ZONE 'America/Caracas'::text))::date AS registrado_el,
    v.numero_factura,
    ((v.created_at AT TIME ZONE 'America/Caracas'::text))::date AS fecha_nota,
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
    round((co.monto_usd + (co.monto_bs / NULLIF(co.tasa_cambio, (0)::numeric))), 2) AS monto_equiv_usd,
    co.metodo_usd,
    co.metodo_bs,
    cb.banco,
    cb.numero_cuenta,
    cb.nombre AS cuenta,
    co.nota,
    (co.devolucion_id IS NOT NULL) AS es_nota_credito,
    d.numero_nc,
    co.contribuyente_especial,
    ur.nombre AS registrado_por,
    ((v.estado_cobro = 'anulado'::text) OR (v.motivo_anulacion IS NOT NULL)) AS anulado,
    (co.retencion_id IS NOT NULL) AS es_retencion,
    rt.numero_comprobante AS comprobante_retencion
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
REVOKE EXECUTE ON FUNCTION _retencion_venta_puede_operar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _recalcular_estado_cobro_venta(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _ventas_anula_retenciones() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION registrar_retenciones_venta(uuid, date, numeric, text, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION actualizar_comprobante_retencion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_retenciones_venta(uuid, date, numeric, text, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION actualizar_comprobante_retencion(uuid, text) TO authenticated;
