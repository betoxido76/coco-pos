-- ═══════════════════════════════════════════════════════════════════════════
-- Notas de crédito de proveedores — Fase 1: base de datos
-- docs/plan-nc-proveedores.md
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE devoluciones_proveedor
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'devolucion' CHECK (origen IN ('devolucion', 'manual')),
  ADD COLUMN IF NOT EXISTS nro_doc_proveedor text,
  ADD COLUMN IF NOT EXISTS fecha_emision date,
  ADD COLUMN IF NOT EXISTS tasa_cambio numeric,
  ADD COLUMN IF NOT EXISTS tipo_tasa text,
  ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulado_por uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS fecha_anulacion timestamptz;
UPDATE devoluciones_proveedor SET fecha_emision = (created_at AT TIME ZONE 'America/Caracas')::date WHERE fecha_emision IS NULL;

ALTER TABLE devoluciones_proveedor DROP CONSTRAINT IF EXISTS devoluciones_proveedor_estado_nd_check;
ALTER TABLE devoluciones_proveedor ADD CONSTRAINT devoluciones_proveedor_estado_nd_check
  CHECK (estado_nd IN ('pendiente', 'parcial', 'aplicada', 'reembolsada', 'anulada'));
COMMENT ON TABLE devoluciones_proveedor IS
  'Notas de crédito de proveedor: de devolución física (ND-, Compras) o manuales (NCP-, CxP). Saldo = monto_total - aplicaciones (pagos_proveedor/pagos con devolucion_proveedor_id). docs/plan-nc-proveedores.md';

-- Líneas de valor (sin insumo) para las manuales
ALTER TABLE devolucion_proveedor_items
  ADD COLUMN IF NOT EXISTS tipo_linea text NOT NULL DEFAULT 'insumo' CHECK (tipo_linea IN ('insumo', 'valor')),
  ADD COLUMN IF NOT EXISTS concepto text;
ALTER TABLE devolucion_proveedor_items ALTER COLUMN insumo_id DROP NOT NULL;
ALTER TABLE devolucion_proveedor_items ALTER COLUMN tipo_insumo DROP NOT NULL;

-- Aplicación a gastos
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS devolucion_proveedor_id uuid REFERENCES devoluciones_proveedor(id);

-- Numeración: ND- (devoluciones) y NCP- (manuales) por separado, por máximo
CREATE OR REPLACE FUNCTION public.obtener_siguiente_nd_numero(p_empresa_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
    SELECT COALESCE(MAX(NULLIF(SPLIT_PART(numero_nd, '-', 2), '')::int), 0) INTO n
      FROM devoluciones_proveedor WHERE empresa_id = p_empresa_id AND numero_nd LIKE 'ND-%';
    RETURN 'ND-' || LPAD((n + 1)::text, 6, '0');
END $$;

CREATE OR REPLACE FUNCTION _siguiente_ncp_numero(p_empresa_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
    SELECT COALESCE(MAX(NULLIF(SPLIT_PART(numero_nd, '-', 2), '')::int), 0) INTO n
      FROM devoluciones_proveedor WHERE empresa_id = p_empresa_id AND numero_nd LIKE 'NCP-%';
    RETURN 'NCP-' || LPAD((n + 1)::text, 6, '0');
END $$;

-- Saldo y estado de una NC: derivados de sus aplicaciones vigentes
CREATE OR REPLACE FUNCTION saldo_credito_proveedor(p_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT round(COALESCE(d.monto_total, 0)
        - COALESCE((SELECT SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)) FROM pagos_proveedor
                     WHERE devolucion_proveedor_id = d.id AND NOT anulado), 0)
        - COALESCE((SELECT SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)) FROM pagos
                     WHERE devolucion_proveedor_id = d.id), 0), 2)
    FROM devoluciones_proveedor d WHERE d.id = p_id;
$$;

CREATE OR REPLACE FUNCTION _recalcular_credito_proveedor(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_d devoluciones_proveedor%ROWTYPE; v_saldo numeric; v_estado text;
BEGIN
    SELECT * INTO v_d FROM devoluciones_proveedor WHERE id = p_id;
    IF v_d.estado_nd IN ('reembolsada', 'anulada') THEN RETURN v_d.estado_nd; END IF;
    v_saldo := saldo_credito_proveedor(p_id);
    v_estado := CASE
        WHEN v_saldo <= 0.01 THEN 'aplicada'
        WHEN v_saldo >= COALESCE(v_d.monto_total, 0) - 0.01 THEN 'pendiente'
        ELSE 'parcial' END;
    UPDATE devoluciones_proveedor SET estado_nd = v_estado WHERE id = p_id;
    RETURN v_estado;
END $$;

-- Saldo de un documento por pagar (recepción o gasto), con el mismo criterio de la app
CREATE OR REPLACE FUNCTION _saldo_documento_cxp(p_origen_tipo text, p_origen_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c compras%ROWTYPE; v_g gastos%ROWTYPE; v_pagado numeric;
BEGIN
    IF p_origen_tipo = 'compra' THEN
        SELECT * INTO v_c FROM compras WHERE id = p_origen_id;
        SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
          FROM pagos_proveedor WHERE compra_id = p_origen_id AND NOT anulado;
        RETURN COALESCE(v_c.total, 0) - COALESCE(v_c.descuento_pago, 0) - v_pagado
            - CASE WHEN v_c.condicion_pago = 'contado'
                   THEN COALESCE(v_c.pago_usd, 0) + COALESCE(v_c.pago_bs, 0) / NULLIF(v_c.tasa_cambio, 0) ELSE 0 END;
    ELSE
        SELECT * INTO v_g FROM gastos WHERE id = p_origen_id;
        SELECT COALESCE(SUM(monto_usd + monto_bs / NULLIF(tasa_cambio, 0)), 0) INTO v_pagado
          FROM pagos WHERE origen_tipo = 'gasto' AND origen_id = p_origen_id;
        RETURN _total_gasto_usd(v_g) - v_pagado;
    END IF;
END $$;

-- ── crear_nc_proveedor ──────────────────────────────────────────────────────
-- p_lineas: [{ "concepto": text, "monto": base sin IVA, "aplica_iva": bool }]
-- El IVA se calcula UNA vez sobre la base gravada total (16 %, IVA_PCT de src/lib/iva.js).
CREATE OR REPLACE FUNCTION crear_nc_proveedor(
    p_proveedor_id uuid, p_compra_id uuid, p_nro_doc_proveedor text, p_fecha date,
    p_tasa numeric, p_tipo_tasa text, p_motivo text, p_lineas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_empresa uuid; v_prov proveedores%ROWTYPE; v_c compras%ROWTYPE;
    v_l jsonb; v_grav numeric := 0; v_exe numeric := 0; v_iva numeric; v_total numeric;
    v_numero text; v_id uuid;
BEGIN
    SELECT * INTO v_prov FROM proveedores WHERE id = p_proveedor_id;
    IF v_prov.id IS NULL THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
    v_empresa := v_prov.empresa_id;
    IF v_empresa <> get_empresa_id() AND NOT is_superadmin() THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
    IF NOT _anticipo_puede_operar(v_empresa) THEN
        RAISE EXCEPTION 'Necesitas el módulo de Compras o de Cuentas por Pagar para registrar notas de crédito';
    END IF;
    IF p_fecha IS NULL THEN RAISE EXCEPTION 'Falta la fecha de la nota de crédito'; END IF;
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;
    IF p_compra_id IS NOT NULL THEN
        SELECT * INTO v_c FROM compras WHERE id = p_compra_id;
        IF v_c.id IS NULL OR v_c.empresa_id <> v_empresa THEN RAISE EXCEPTION 'Recepción no encontrada'; END IF;
        IF v_c.proveedor_id IS DISTINCT FROM p_proveedor_id THEN RAISE EXCEPTION 'La recepción % es de otro proveedor', v_c.numero_doc; END IF;
    END IF;
    IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN RAISE EXCEPTION 'Agrega al menos una línea'; END IF;

    FOR v_l IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
        IF COALESCE((v_l->>'monto')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Cada línea debe tener un monto mayor a cero'; END IF;
        IF COALESCE((v_l->>'aplica_iva')::boolean, true) THEN v_grav := v_grav + (v_l->>'monto')::numeric;
        ELSE v_exe := v_exe + (v_l->>'monto')::numeric; END IF;
    END LOOP;
    v_grav := round(v_grav, 2); v_exe := round(v_exe, 2);
    v_iva := round(v_grav * 16 / 100, 2);
    v_total := round(v_grav + v_exe + v_iva, 2);

    v_numero := _siguiente_ncp_numero(v_empresa);
    INSERT INTO devoluciones_proveedor (empresa_id, numero_nd, proveedor_id, compra_id, motivo, estado_nd,
        monto_total, subtotal, iva, base_gravada, base_exenta, origen, nro_doc_proveedor, fecha_emision,
        tasa_cambio, tipo_tasa, usuario_id)
    VALUES (v_empresa, v_numero, p_proveedor_id, p_compra_id, btrim(p_motivo), 'pendiente',
        v_total, v_grav + v_exe, v_iva, v_grav, v_exe, 'manual', NULLIF(btrim(COALESCE(p_nro_doc_proveedor, '')), ''),
        p_fecha, COALESCE(NULLIF(p_tasa, 0), 1), p_tipo_tasa, auth.uid())
    RETURNING id INTO v_id;

    INSERT INTO devolucion_proveedor_items (empresa_id, devolucion_proveedor_id, tipo_linea, concepto, nombre_insumo,
        cantidad, precio_unitario, aplica_iva, precio_incluye_iva, iva_pct)
    SELECT v_empresa, v_id, 'valor', btrim(l->>'concepto'), btrim(l->>'concepto'), 1, round((l->>'monto')::numeric, 2),
           COALESCE((l->>'aplica_iva')::boolean, true), false,
           CASE WHEN COALESCE((l->>'aplica_iva')::boolean, true) THEN 16 ELSE 0 END
      FROM jsonb_array_elements(p_lineas) l;

    RETURN jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total);
END $$;

-- ── aplicar_credito_proveedor ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION aplicar_credito_proveedor(
    p_credito_id uuid, p_origen_tipo text, p_origen_id uuid, p_monto numeric, p_fecha date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_d devoluciones_proveedor%ROWTYPE; v_monto numeric; v_saldo_nc numeric; v_saldo_doc numeric;
    v_prov uuid; v_emp uuid; v_numero text; v_estado_doc text;
BEGIN
    v_monto := round(COALESCE(p_monto, 0), 2);
    IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto a aplicar debe ser mayor a cero'; END IF;
    SELECT * INTO v_d FROM devoluciones_proveedor WHERE id = p_credito_id FOR UPDATE;
    IF v_d.id IS NULL OR (v_d.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Nota de crédito no encontrada';
    END IF;
    IF NOT (_anticipo_puede_operar(v_d.empresa_id) OR _retencion_puede_operar(v_d.empresa_id)) THEN
        RAISE EXCEPTION 'Necesitas el módulo de Compras, Cuentas por Pagar o Gastos para aplicar notas de crédito';
    END IF;
    IF v_d.estado_nd NOT IN ('pendiente', 'parcial') THEN
        RAISE EXCEPTION 'La nota % no está disponible (%)', v_d.numero_nd, v_d.estado_nd;
    END IF;

    IF p_origen_tipo = 'compra' THEN
        SELECT proveedor_id, empresa_id, numero_doc INTO v_prov, v_emp, v_numero FROM compras WHERE id = p_origen_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM compras WHERE id = p_origen_id AND estado = 'anulada') THEN RAISE EXCEPTION 'La recepción está anulada'; END IF;
    ELSIF p_origen_tipo = 'gasto' THEN
        SELECT proveedor_id, empresa_id, numero_gasto INTO v_prov, v_emp, v_numero FROM gastos WHERE id = p_origen_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM gastos WHERE id = p_origen_id AND estado = 'anulado') THEN RAISE EXCEPTION 'El gasto está anulado'; END IF;
    ELSE RAISE EXCEPTION 'Origen inválido: %', p_origen_tipo; END IF;
    IF v_emp IS NULL OR v_emp <> v_d.empresa_id THEN RAISE EXCEPTION 'Documento no encontrado'; END IF;
    IF v_prov IS DISTINCT FROM v_d.proveedor_id THEN RAISE EXCEPTION 'La nota % es de otro proveedor', v_d.numero_nd; END IF;

    v_saldo_nc := saldo_credito_proveedor(v_d.id);
    IF v_monto > v_saldo_nc + 0.01 THEN
        RAISE EXCEPTION 'La nota % solo tiene $% disponibles', v_d.numero_nd, to_char(GREATEST(v_saldo_nc, 0), 'FM999999990.00');
    END IF;
    v_saldo_doc := _saldo_documento_cxp(p_origen_tipo, p_origen_id);
    IF v_monto > v_saldo_doc + 0.01 THEN
        RAISE EXCEPTION '% solo debe $%', v_numero, to_char(GREATEST(v_saldo_doc, 0), 'FM999999990.00');
    END IF;

    PERFORM set_config('mipos.aplicando_credito', 'on', true);
    IF p_origen_tipo = 'compra' THEN
        INSERT INTO pagos_proveedor (compra_id, usuario_id, fecha_pago, monto_usd, monto_bs, tasa_cambio, tipo_tasa,
                                     metodo_usd, nota, empresa_id, devolucion_proveedor_id)
        VALUES (p_origen_id, auth.uid(), (COALESCE(p_fecha, (now() AT TIME ZONE 'America/Caracas')::date) + time '12:00') AT TIME ZONE 'America/Caracas',
                v_monto, 0, 1, NULL, 'nota_credito', 'Aplicación ' || v_d.numero_nd, v_d.empresa_id, v_d.id);
        v_estado_doc := _recalcular_estado_cobro_compra(p_origen_id);
    ELSE
        INSERT INTO pagos (empresa_id, origen_tipo, origen_id, fecha, monto_usd, monto_bs, tasa_cambio, tipo_tasa,
                           metodo_usd, nota, usuario_id, devolucion_proveedor_id)
        VALUES (v_d.empresa_id, 'gasto', p_origen_id, COALESCE(p_fecha, (now() AT TIME ZONE 'America/Caracas')::date),
                v_monto, 0, 1, NULL, 'nota_credito', 'Aplicación ' || v_d.numero_nd, auth.uid(), v_d.id);
        v_estado_doc := _recalcular_estado_gasto(p_origen_id);
    END IF;
    PERFORM set_config('mipos.aplicando_credito', 'off', true);

    RETURN jsonb_build_object('estado_documento', v_estado_doc,
        'estado_nota', _recalcular_credito_proveedor(v_d.id), 'saldo_nota', saldo_credito_proveedor(v_d.id));
END $$;

-- ── anular_credito_proveedor ────────────────────────────────────────────────
-- Revierte sus aplicaciones (vuelven al saldo de cada documento) y la anula.
-- No mueve inventario: la mercancía de una devolución ya salió con el proveedor.
CREATE OR REPLACE FUNCTION anular_credito_proveedor(p_id uuid, p_motivo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_d devoluciones_proveedor%ROWTYPE; v_rol text; r record;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo de anulación es obligatorio'; END IF;
    SELECT rol INTO v_rol FROM usuarios WHERE id = auth.uid();
    IF NOT is_superadmin() AND (v_rol IS NULL OR v_rol NOT IN ('admin', 'finanzas')) THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden anular notas de crédito';
    END IF;
    SELECT * INTO v_d FROM devoluciones_proveedor WHERE id = p_id FOR UPDATE;
    IF v_d.id IS NULL OR (v_d.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Nota de crédito no encontrada';
    END IF;
    IF v_d.estado_nd IN ('anulada', 'reembolsada') THEN RAISE EXCEPTION 'La nota ya está %', v_d.estado_nd; END IF;

    FOR r IN SELECT id, compra_id FROM pagos_proveedor WHERE devolucion_proveedor_id = p_id AND NOT anulado LOOP
        UPDATE pagos_proveedor SET anulado = true, motivo_anulacion = 'Anulación de ' || v_d.numero_nd || ': ' || btrim(p_motivo),
                                   anulado_por = auth.uid(), fecha_anulacion = now() WHERE id = r.id;
        PERFORM _recalcular_estado_cobro_compra(r.compra_id);
    END LOOP;
    FOR r IN SELECT id, origen_id FROM pagos WHERE devolucion_proveedor_id = p_id LOOP
        DELETE FROM pagos WHERE id = r.id;      -- `pagos` no tiene anulación lógica
        PERFORM _recalcular_estado_gasto(r.origen_id);
    END LOOP;

    UPDATE devoluciones_proveedor SET estado_nd = 'anulada', motivo_anulacion = btrim(p_motivo),
           anulado_por = auth.uid(), fecha_anulacion = now() WHERE id = p_id;
    RETURN 'anulada';
END $$;

-- ── anular_pago_proveedor: el abono de una NC recalcula su estado (antes la
-- devolvía a 'pendiente' entera, sin contar aplicaciones parciales)
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
    PERFORM _recalcular_credito_proveedor(v_pago.devolucion_proveedor_id);
  END IF;

  IF v_pago.anticipo_id IS NOT NULL THEN
    PERFORM recalcular_anticipo(v_pago.anticipo_id);
  END IF;

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

REVOKE EXECUTE ON FUNCTION _siguiente_ncp_numero(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _recalcular_credito_proveedor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _saldo_documento_cxp(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION crear_nc_proveedor(uuid, uuid, text, date, numeric, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION aplicar_credito_proveedor(uuid, text, uuid, numeric, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION anular_credito_proveedor(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crear_nc_proveedor(uuid, uuid, text, date, numeric, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION aplicar_credito_proveedor(uuid, text, uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION anular_credito_proveedor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION saldo_credito_proveedor(uuid) TO authenticated;
