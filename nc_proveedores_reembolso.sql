-- NC de proveedor: liquidar por reembolso y revertir la liquidación (2026-10-09)
-- NCP-000001 se marcó reembolsada por error un minuto después de crearla: el
-- botón se confundía con "aplicar" y no había forma de deshacerlo.
-- Ahora ambas acciones son RPC: solo admin/finanzas, referencia/motivo obligatorio.

-- ── liquidar_credito_proveedor ───────────────────────────────────────────────
-- El proveedor devolvió el saldo en dinero. Sin movimiento de caja (decisión
-- del usuario, docs/plan-nc-proveedores.md).
CREATE OR REPLACE FUNCTION liquidar_credito_proveedor(p_id uuid, p_referencia text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_d devoluciones_proveedor%ROWTYPE; v_rol text;
BEGIN
    IF p_referencia IS NULL OR btrim(p_referencia) = '' THEN
        RAISE EXCEPTION 'La referencia del reembolso es obligatoria';
    END IF;
    SELECT rol INTO v_rol FROM usuarios WHERE id = auth.uid();
    IF NOT is_superadmin() AND (v_rol IS NULL OR v_rol NOT IN ('admin', 'finanzas')) THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden liquidar notas de crédito';
    END IF;
    SELECT * INTO v_d FROM devoluciones_proveedor WHERE id = p_id FOR UPDATE;
    IF v_d.id IS NULL OR (v_d.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Nota de crédito no encontrada';
    END IF;
    IF v_d.estado_nd NOT IN ('pendiente', 'parcial') THEN
        RAISE EXCEPTION 'La nota está %: no se puede liquidar', v_d.estado_nd;
    END IF;
    IF saldo_credito_proveedor(p_id) <= 0.01 THEN RAISE EXCEPTION 'La nota no tiene saldo'; END IF;

    UPDATE devoluciones_proveedor SET estado_nd = 'reembolsada', nota_liquidacion = btrim(p_referencia),
           fecha_liquidacion = now() WHERE id = p_id;
    RETURN 'reembolsada';
END $$;

-- ── revertir_reembolso_credito_proveedor ─────────────────────────────────────
-- Deshace una liquidación por reembolso hecha por error: la nota vuelve a estar
-- disponible con el saldo que tenía (pendiente o parcial según sus aplicaciones).
CREATE OR REPLACE FUNCTION revertir_reembolso_credito_proveedor(p_id uuid, p_motivo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_d devoluciones_proveedor%ROWTYPE; v_rol text;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;
    SELECT rol INTO v_rol FROM usuarios WHERE id = auth.uid();
    IF NOT is_superadmin() AND (v_rol IS NULL OR v_rol NOT IN ('admin', 'finanzas')) THEN
        RAISE EXCEPTION 'Solo Finanzas o Administración pueden revertir un reembolso';
    END IF;
    SELECT * INTO v_d FROM devoluciones_proveedor WHERE id = p_id FOR UPDATE;
    IF v_d.id IS NULL OR (v_d.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Nota de crédito no encontrada';
    END IF;
    IF v_d.estado_nd <> 'reembolsada' THEN RAISE EXCEPTION 'La nota no está reembolsada'; END IF;

    -- 'pendiente' provisional para que el recálculo no la salte
    UPDATE devoluciones_proveedor SET estado_nd = 'pendiente', fecha_liquidacion = NULL,
           nota_liquidacion = 'Reembolso revertido: ' || btrim(p_motivo) WHERE id = p_id;
    RETURN _recalcular_credito_proveedor(p_id);
END $$;

REVOKE EXECUTE ON FUNCTION liquidar_credito_proveedor(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION revertir_reembolso_credito_proveedor(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION liquidar_credito_proveedor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION revertir_reembolso_credito_proveedor(uuid, text) TO authenticated;
