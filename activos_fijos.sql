-- ============================================================================
-- ACTIVOS FIJOS — Fase 1 (docs/plan-activos-fijos.md)
--
-- Registro y control de equipos (no es inventario: no mueve stock ni costos).
-- Una ficha por unidad física (AF-000001), con ubicación, responsable (usuario
-- del sistema), estado e historial de movimientos que no se edita.
--
-- Montos aparte en activo_valores: solo los leen admin/finanzas (decisión 0.5).
-- Escritura de activos, valores y movimientos SOLO por RPC:
--   crear_activo · editar_activo · registrar_movimiento_activo
--   dar_baja_activo · reactivar_activo
-- Categorías y ubicaciones: editables desde la app (como areas_consumo).
-- ============================================================================

-- ── 0. Umbral de valor (decisión 0.1): por debajo, la app avisa que es gasto ─
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS activos_valor_minimo numeric(14,2) NOT NULL DEFAULT 100;

-- ── 1. Categorías ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activo_categorias (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       uuid NOT NULL REFERENCES empresas(id),
    nombre           text NOT NULL CHECK (btrim(nombre) <> ''),
    vida_util_meses  integer CHECK (vida_util_meses IS NULL OR vida_util_meses > 0),
    activa           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS activo_categorias_nombre_unico ON activo_categorias (empresa_id, lower(btrim(nombre)));

-- ── 2. Ubicaciones ──────────────────────────────────────────────────────────
-- Aparte de almacenes: un activo puede estar en una oficina, un vehículo o,
-- a futuro, en un cliente (comodato); y así no aparece en los selectores de stock.
CREATE TABLE IF NOT EXISTS activo_ubicaciones (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  uuid NOT NULL REFERENCES empresas(id),
    nombre      text NOT NULL CHECK (btrim(nombre) <> ''),
    activa      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS activo_ubicaciones_nombre_unico ON activo_ubicaciones (empresa_id, lower(btrim(nombre)));

ALTER TABLE activo_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE activo_ubicaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activo_categorias_tenant ON activo_categorias;
CREATE POLICY activo_categorias_tenant ON activo_categorias FOR ALL
    USING (empresa_id = get_empresa_id() OR is_superadmin())
    WITH CHECK (empresa_id = get_empresa_id() OR is_superadmin());
DROP POLICY IF EXISTS activo_ubicaciones_tenant ON activo_ubicaciones;
CREATE POLICY activo_ubicaciones_tenant ON activo_ubicaciones FOR ALL
    USING (empresa_id = get_empresa_id() OR is_superadmin())
    WITH CHECK (empresa_id = get_empresa_id() OR is_superadmin());
GRANT SELECT, INSERT, UPDATE ON activo_categorias, activo_ubicaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON activo_categorias, activo_ubicaciones TO service_role;

-- Siembra para todas las empresas (decisión 0.3)
INSERT INTO activo_categorias (empresa_id, nombre, vida_util_meses)
SELECT e.id, c.nombre, c.meses
FROM empresas e CROSS JOIN (VALUES
    ('Maquinaria y equipos de producción', 120),
    ('Equipos de refrigeración', 84),
    ('Vehículos', 60),
    ('Equipos de computación', 36),
    ('Mobiliario y equipos de oficina', 120),
    ('Herramientas', 60),
    ('Instalaciones y mejoras', 120)
) AS c(nombre, meses)
ON CONFLICT DO NOTHING;

INSERT INTO activo_ubicaciones (empresa_id, nombre)
SELECT e.id, 'Activos' FROM empresas e
ON CONFLICT DO NOTHING;

-- ── 3. Activos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activos (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id         uuid NOT NULL REFERENCES empresas(id),
    codigo             text NOT NULL,
    nombre             text NOT NULL CHECK (btrim(nombre) <> ''),
    categoria_id       uuid NOT NULL REFERENCES activo_categorias(id),
    marca              text,
    modelo             text,
    serial             text,
    ubicacion_id       uuid NOT NULL REFERENCES activo_ubicaciones(id),
    responsable_id     uuid REFERENCES usuarios(id),
    estado             text NOT NULL DEFAULT 'operativo'
                       CHECK (estado IN ('operativo', 'mantenimiento', 'danado', 'desuso', 'baja')),
    fecha_adquisicion  date NOT NULL,
    garantia_hasta     date,
    gasto_id           uuid REFERENCES gastos(id),
    compra_id          uuid REFERENCES compras(id),
    proveedor_id       uuid REFERENCES proveedores(id),
    observaciones      text,
    -- Baja
    fecha_baja         date,
    tipo_baja          text CHECK (tipo_baja IN ('venta', 'robo', 'dano', 'donacion', 'desecho', 'otro')),
    motivo_baja        text,
    baja_por           uuid REFERENCES usuarios(id),
    creado_por         uuid REFERENCES usuarios(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT activos_codigo_unico UNIQUE (empresa_id, codigo),
    CONSTRAINT activos_un_origen CHECK (gasto_id IS NULL OR compra_id IS NULL),
    CONSTRAINT activos_baja_completa CHECK ((estado = 'baja') = (fecha_baja IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS activos_empresa_idx ON activos (empresa_id, estado);
CREATE INDEX IF NOT EXISTS activos_gasto_idx ON activos (gasto_id) WHERE gasto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activos_compra_idx ON activos (compra_id) WHERE compra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activos_serial_idx ON activos (empresa_id, lower(btrim(serial))) WHERE serial IS NOT NULL;

-- Montos: tabla aparte para que la RLS los oculte a quien no es admin/finanzas
CREATE TABLE IF NOT EXISTS activo_valores (
    activo_id           uuid PRIMARY KEY REFERENCES activos(id) ON DELETE CASCADE,
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    valor_adquisicion   numeric(14,2) NOT NULL CHECK (valor_adquisicion >= 0),
    vida_util_meses     integer CHECK (vida_util_meses IS NULL OR vida_util_meses > 0),
    valor_residual      numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_residual >= 0),
    valor_recuperacion  numeric(14,2) CHECK (valor_recuperacion >= 0)   -- al dar de baja (venta, chatarra)
);

CREATE TABLE IF NOT EXISTS activo_movimientos (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id         uuid NOT NULL REFERENCES empresas(id),
    activo_id          uuid NOT NULL REFERENCES activos(id) ON DELETE CASCADE,
    tipo               text NOT NULL CHECK (tipo IN ('alta', 'edicion', 'traslado', 'responsable', 'estado',
                                                     'mantenimiento', 'baja', 'reactivacion')),
    fecha              date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Caracas')::date,
    ubicacion_ant      uuid REFERENCES activo_ubicaciones(id),
    ubicacion_nueva    uuid REFERENCES activo_ubicaciones(id),
    responsable_ant    uuid REFERENCES usuarios(id),
    responsable_nuevo  uuid REFERENCES usuarios(id),
    estado_ant         text,
    estado_nuevo       text,
    gasto_id           uuid REFERENCES gastos(id),       -- mantenimiento: el gasto que lo pagó
    nota               text,
    usuario_id         uuid REFERENCES usuarios(id),
    created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activo_movimientos_activo_idx ON activo_movimientos (activo_id, created_at DESC);

ALTER TABLE activos ENABLE ROW LEVEL SECURITY;
ALTER TABLE activo_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE activo_movimientos ENABLE ROW LEVEL SECURITY;

-- ── 4. Helpers ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _activos_ve_valores() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_superadmin()
        OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'finanzas'));
$$;
GRANT EXECUTE ON FUNCTION _activos_ve_valores() TO authenticated;

DROP POLICY IF EXISTS activos_select ON activos;
CREATE POLICY activos_select ON activos FOR SELECT USING (empresa_id = get_empresa_id() OR is_superadmin());
DROP POLICY IF EXISTS activo_movimientos_select ON activo_movimientos;
CREATE POLICY activo_movimientos_select ON activo_movimientos FOR SELECT USING (empresa_id = get_empresa_id() OR is_superadmin());
DROP POLICY IF EXISTS activo_valores_select ON activo_valores;
CREATE POLICY activo_valores_select ON activo_valores FOR SELECT
    USING ((empresa_id = get_empresa_id() AND _activos_ve_valores()) OR is_superadmin());
GRANT SELECT ON activos, activo_valores, activo_movimientos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON activos, activo_valores, activo_movimientos TO service_role;

-- Valida los datos comunes de alta/edición. Devuelve el proveedor que corresponde
-- al documento de origen (o el indicado si no hay documento).
CREATE OR REPLACE FUNCTION _activo_validar(p_empresa uuid, d jsonb) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prov uuid;
BEGIN
    IF btrim(COALESCE(d->>'nombre', '')) = '' THEN RAISE EXCEPTION 'El nombre es obligatorio'; END IF;
    IF NOT EXISTS (SELECT 1 FROM activo_categorias WHERE id = (d->>'categoria_id')::uuid AND empresa_id = p_empresa) THEN
        RAISE EXCEPTION 'Elige una categoría';
    END IF;
    IF (d->>'fecha_adquisicion') IS NULL THEN RAISE EXCEPTION 'La fecha de adquisición es obligatoria'; END IF;
    IF (d->>'fecha_adquisicion')::date > (now() AT TIME ZONE 'America/Caracas')::date THEN
        RAISE EXCEPTION 'La fecha de adquisición no puede ser futura';
    END IF;
    IF (d->>'gasto_id') IS NOT NULL AND (d->>'compra_id') IS NOT NULL THEN
        RAISE EXCEPTION 'El activo sale de un gasto o de una recepción, no de ambos';
    END IF;
    IF (d->>'gasto_id') IS NOT NULL THEN
        SELECT proveedor_id INTO v_prov FROM gastos
         WHERE id = (d->>'gasto_id')::uuid AND empresa_id = p_empresa AND COALESCE(estado, '') <> 'anulado';
        IF NOT FOUND THEN RAISE EXCEPTION 'Gasto no encontrado o anulado'; END IF;
    ELSIF (d->>'compra_id') IS NOT NULL THEN
        SELECT proveedor_id INTO v_prov FROM compras
         WHERE id = (d->>'compra_id')::uuid AND empresa_id = p_empresa AND COALESCE(estado, '') <> 'anulada';
        IF NOT FOUND THEN RAISE EXCEPTION 'Recepción no encontrada o anulada'; END IF;
    ELSE
        v_prov := (d->>'proveedor_id')::uuid;
        IF v_prov IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proveedores WHERE id = v_prov AND empresa_id = p_empresa) THEN
            RAISE EXCEPTION 'Proveedor no encontrado';
        END IF;
    END IF;
    RETURN v_prov;
END $$;

CREATE OR REPLACE FUNCTION _activo_validar_responsable(p_empresa uuid, p_usuario uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_usuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_usuario AND empresa_id = p_empresa) THEN
        RAISE EXCEPTION 'Responsable no encontrado en la empresa';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION _activo_validar_ubicacion(p_empresa uuid, p_ubicacion uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM activo_ubicaciones WHERE id = p_ubicacion AND empresa_id = p_empresa AND activa) THEN
        RAISE EXCEPTION 'Ubicación no encontrada o inactiva';
    END IF;
END $$;

-- Activo bloqueado y validado (empresa + módulo)
CREATE OR REPLACE FUNCTION _activo_para_operar(p_id uuid) RETURNS activos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v activos%ROWTYPE;
BEGIN
    SELECT * INTO v FROM activos WHERE id = p_id FOR UPDATE;
    IF v.id IS NULL OR (v.empresa_id <> get_empresa_id() AND NOT is_superadmin()) THEN
        RAISE EXCEPTION 'Activo no encontrado';
    END IF;
    IF NOT _usuario_tiene_modulo(v.empresa_id, 'activos') THEN
        RAISE EXCEPTION 'Necesitas el módulo de Activos';
    END IF;
    RETURN v;
END $$;

-- ── 5. Crear (1 o N unidades iguales) ───────────────────────────────────────
-- p_datos: { nombre, categoria_id, marca, modelo, serial, ubicacion_id, responsable_id,
--            estado, fecha_adquisicion, garantia_hasta, gasto_id | compra_id, proveedor_id,
--            observaciones, valor_adquisicion (por unidad), vida_util_meses, valor_residual }
-- Con p_cantidad > 1 el serial va vacío: se carga después en cada ficha.
CREATE OR REPLACE FUNCTION crear_activo(p_datos jsonb, p_cantidad integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_empresa uuid := get_empresa_id();
    v_prov uuid; v_ult int; v_id uuid; v_cod text; v_res jsonb := '[]'::jsonb;
    v_estado text := COALESCE(NULLIF(p_datos->>'estado', ''), 'operativo');
    v_valor numeric := (p_datos->>'valor_adquisicion')::numeric;
BEGIN
    IF v_empresa IS NULL THEN RAISE EXCEPTION 'Sesión sin empresa'; END IF;
    IF NOT _usuario_tiene_modulo(v_empresa, 'activos') THEN RAISE EXCEPTION 'Necesitas el módulo de Activos'; END IF;
    IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 50 THEN RAISE EXCEPTION 'Cantidad inválida (1 a 50)'; END IF;
    IF v_estado NOT IN ('operativo', 'mantenimiento', 'danado', 'desuso') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
    IF v_valor IS NULL OR v_valor < 0 THEN RAISE EXCEPTION 'El valor de adquisición es obligatorio'; END IF;
    IF p_cantidad > 1 AND NULLIF(btrim(p_datos->>'serial'), '') IS NOT NULL THEN
        RAISE EXCEPTION 'Con varias unidades el serial se carga después en cada ficha';
    END IF;
    v_prov := _activo_validar(v_empresa, p_datos);
    PERFORM _activo_validar_ubicacion(v_empresa, (p_datos->>'ubicacion_id')::uuid);
    PERFORM _activo_validar_responsable(v_empresa, (p_datos->>'responsable_id')::uuid);

    PERFORM pg_advisory_xact_lock(hashtext('activo_num_' || v_empresa::text));
    SELECT MAX(CAST(split_part(codigo, '-', 2) AS integer)) INTO v_ult
      FROM activos WHERE empresa_id = v_empresa AND codigo ~ '^AF-[0-9]+$';
    v_ult := COALESCE(v_ult, 0);

    FOR i IN 1..p_cantidad LOOP
        v_cod := 'AF-' || lpad((v_ult + i)::text, 6, '0');
        INSERT INTO activos (empresa_id, codigo, nombre, categoria_id, marca, modelo, serial, ubicacion_id, responsable_id,
                             estado, fecha_adquisicion, garantia_hasta, gasto_id, compra_id, proveedor_id, observaciones, creado_por)
        VALUES (v_empresa, v_cod, btrim(p_datos->>'nombre'), (p_datos->>'categoria_id')::uuid,
                NULLIF(btrim(p_datos->>'marca'), ''), NULLIF(btrim(p_datos->>'modelo'), ''), NULLIF(btrim(p_datos->>'serial'), ''),
                (p_datos->>'ubicacion_id')::uuid, (p_datos->>'responsable_id')::uuid, v_estado,
                (p_datos->>'fecha_adquisicion')::date, NULLIF(p_datos->>'garantia_hasta', '')::date,
                (p_datos->>'gasto_id')::uuid, (p_datos->>'compra_id')::uuid, v_prov,
                NULLIF(btrim(p_datos->>'observaciones'), ''), auth.uid())
        RETURNING id INTO v_id;

        INSERT INTO activo_valores (activo_id, empresa_id, valor_adquisicion, vida_util_meses, valor_residual)
        VALUES (v_id, v_empresa, round(v_valor, 2), NULLIF(p_datos->>'vida_util_meses', '')::integer,
                COALESCE(NULLIF(p_datos->>'valor_residual', '')::numeric, 0));

        INSERT INTO activo_movimientos (empresa_id, activo_id, tipo, fecha, ubicacion_nueva, responsable_nuevo, estado_nuevo, nota, usuario_id)
        VALUES (v_empresa, v_id, 'alta', (p_datos->>'fecha_adquisicion')::date, (p_datos->>'ubicacion_id')::uuid,
                (p_datos->>'responsable_id')::uuid, v_estado,
                CASE WHEN p_cantidad > 1 THEN format('Alta de %s unidades (%s de %s)', p_cantidad, i, p_cantidad) END, auth.uid());

        v_res := v_res || jsonb_build_object('id', v_id, 'codigo', v_cod);
    END LOOP;
    RETURN v_res;
END $$;

-- ── 6. Editar datos descriptivos (ubicación, responsable y estado van por movimiento)
CREATE OR REPLACE FUNCTION editar_activo(p_id uuid, p_datos jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v activos%ROWTYPE; v_prov uuid; v_cambios text[] := '{}';
    v_val activo_valores%ROWTYPE;
BEGIN
    v := _activo_para_operar(p_id);
    IF v.estado = 'baja' THEN RAISE EXCEPTION 'El activo % está dado de baja', v.codigo; END IF;
    v_prov := _activo_validar(v.empresa_id, p_datos);

    IF v.nombre IS DISTINCT FROM btrim(p_datos->>'nombre') THEN v_cambios := array_append(v_cambios, 'nombre'); END IF;
    IF v.categoria_id IS DISTINCT FROM (p_datos->>'categoria_id')::uuid THEN v_cambios := array_append(v_cambios, 'categoría'); END IF;
    IF v.marca IS DISTINCT FROM NULLIF(btrim(p_datos->>'marca'), '') THEN v_cambios := array_append(v_cambios, 'marca'); END IF;
    IF v.modelo IS DISTINCT FROM NULLIF(btrim(p_datos->>'modelo'), '') THEN v_cambios := array_append(v_cambios, 'modelo'); END IF;
    IF v.serial IS DISTINCT FROM NULLIF(btrim(p_datos->>'serial'), '') THEN v_cambios := array_append(v_cambios, 'serial'); END IF;
    IF v.fecha_adquisicion IS DISTINCT FROM (p_datos->>'fecha_adquisicion')::date THEN v_cambios := array_append(v_cambios, 'fecha de adquisición'); END IF;
    IF v.garantia_hasta IS DISTINCT FROM NULLIF(p_datos->>'garantia_hasta', '')::date THEN v_cambios := array_append(v_cambios, 'garantía'); END IF;
    IF v.gasto_id IS DISTINCT FROM (p_datos->>'gasto_id')::uuid OR v.compra_id IS DISTINCT FROM (p_datos->>'compra_id')::uuid
       OR v.proveedor_id IS DISTINCT FROM v_prov THEN v_cambios := array_append(v_cambios, 'documento de origen'); END IF;
    IF v.observaciones IS DISTINCT FROM NULLIF(btrim(p_datos->>'observaciones'), '') THEN v_cambios := array_append(v_cambios, 'observaciones'); END IF;

    UPDATE activos SET
        nombre = btrim(p_datos->>'nombre'), categoria_id = (p_datos->>'categoria_id')::uuid,
        marca = NULLIF(btrim(p_datos->>'marca'), ''), modelo = NULLIF(btrim(p_datos->>'modelo'), ''),
        serial = NULLIF(btrim(p_datos->>'serial'), ''),
        fecha_adquisicion = (p_datos->>'fecha_adquisicion')::date, garantia_hasta = NULLIF(p_datos->>'garantia_hasta', '')::date,
        gasto_id = (p_datos->>'gasto_id')::uuid, compra_id = (p_datos->>'compra_id')::uuid, proveedor_id = v_prov,
        observaciones = NULLIF(btrim(p_datos->>'observaciones'), ''), updated_at = now()
    WHERE id = v.id;

    -- Montos: solo admin/finanzas (los demás ni los ven); si no vienen, no se tocan
    IF p_datos ? 'valor_adquisicion' THEN
        IF NOT _activos_ve_valores() THEN RAISE EXCEPTION 'Solo administración o finanzas pueden cambiar los montos'; END IF;
        IF (p_datos->>'valor_adquisicion') IS NULL OR (p_datos->>'valor_adquisicion')::numeric < 0 THEN
            RAISE EXCEPTION 'El valor de adquisición es obligatorio';
        END IF;
        SELECT * INTO v_val FROM activo_valores WHERE activo_id = v.id;
        IF v_val.valor_adquisicion IS DISTINCT FROM round((p_datos->>'valor_adquisicion')::numeric, 2)
           OR v_val.vida_util_meses IS DISTINCT FROM NULLIF(p_datos->>'vida_util_meses', '')::integer
           OR v_val.valor_residual IS DISTINCT FROM COALESCE(NULLIF(p_datos->>'valor_residual', '')::numeric, 0) THEN
            v_cambios := array_append(v_cambios, 'montos');
        END IF;
        UPDATE activo_valores SET valor_adquisicion = round((p_datos->>'valor_adquisicion')::numeric, 2),
            vida_util_meses = NULLIF(p_datos->>'vida_util_meses', '')::integer,
            valor_residual = COALESCE(NULLIF(p_datos->>'valor_residual', '')::numeric, 0)
        WHERE activo_id = v.id;
    END IF;

    IF array_length(v_cambios, 1) > 0 THEN
        INSERT INTO activo_movimientos (empresa_id, activo_id, tipo, nota, usuario_id)
        VALUES (v.empresa_id, v.id, 'edicion', 'Cambió: ' || array_to_string(v_cambios, ', '), auth.uid());
    END IF;
END $$;

-- ── 7. Movimientos: traslado, responsable, estado, mantenimiento ───────────
-- p_datos: { fecha, ubicacion_id (traslado), responsable_id (responsable; null = sin
--            responsable), estado (estado), gasto_id (mantenimiento, opcional), nota }
CREATE OR REPLACE FUNCTION registrar_movimiento_activo(p_id uuid, p_tipo text, p_datos jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v activos%ROWTYPE;
    v_fecha date := COALESCE(NULLIF(p_datos->>'fecha', '')::date, (now() AT TIME ZONE 'America/Caracas')::date);
    v_nota text := NULLIF(btrim(p_datos->>'nota'), '');
    v_ubi uuid; v_resp uuid; v_est text; v_gasto uuid := (p_datos->>'gasto_id')::uuid;
BEGIN
    v := _activo_para_operar(p_id);
    IF v.estado = 'baja' THEN RAISE EXCEPTION 'El activo % está dado de baja', v.codigo; END IF;
    IF v_fecha > (now() AT TIME ZONE 'America/Caracas')::date THEN RAISE EXCEPTION 'La fecha no puede ser futura'; END IF;

    IF p_tipo = 'traslado' THEN
        v_ubi := (p_datos->>'ubicacion_id')::uuid;
        PERFORM _activo_validar_ubicacion(v.empresa_id, v_ubi);
        IF v_ubi = v.ubicacion_id THEN RAISE EXCEPTION 'El activo ya está en esa ubicación'; END IF;
        UPDATE activos SET ubicacion_id = v_ubi, updated_at = now() WHERE id = v.id;
        INSERT INTO activo_movimientos (empresa_id, activo_id, tipo, fecha, ubicacion_ant, ubicacion_nueva, nota, usuario_id)
        VALUES (v.empresa_id, v.id, 'traslado', v_fecha, v.ubicacion_id, v_ubi, v_nota, auth.uid());

    ELSIF p_tipo = 'responsable' THEN
        v_resp := (p_datos->>'responsable_id')::uuid;
        PERFORM _activo_validar_responsable(v.empresa_id, v_resp);
        IF v_resp IS NOT DISTINCT FROM v.responsable_id THEN RAISE EXCEPTION 'Ese ya es el responsable del activo'; END IF;
        UPDATE activos SET responsable_id = v_resp, updated_at = now() WHERE id = v.id;
        INSERT INTO activo_movimientos (empresa_id, activo_id, tipo, fecha, responsable_ant, responsable_nuevo, nota, usuario_id)
        VALUES (v.empresa_id, v.id, 'responsable', v_fecha, v.responsable_id, v_resp, v_nota, auth.uid());

    ELSIF p_tipo = 'estado' THEN
        v_est := p_datos->>'estado';
        IF v_est NOT IN ('operativo', 'mantenimiento', 'danado', 'desuso') THEN
            RAISE EXCEPTION 'Estado inválido (para dar de baja usa "Dar de baja")';
        END IF;
        IF v_est = v.estado THEN RAISE EXCEPTION 'El activo ya está en ese estado'; END IF;
        UPDATE activos SET estado = v_est, updated_at = now() WHERE id = v.id;
        INSERT INTO activo_movimientos (empresa_id, activo_id, tipo, fecha, estado_ant, estado_nuevo, nota, usuario_id)
        VALUES (v.empresa_id, v.id, 'estado', v_fecha, v.estado, v_est, v_nota, auth.uid());

    ELSIF p_tipo = 'mantenimiento' THEN
        IF v_nota IS NULL THEN RAISE EXCEPTION 'Describe el mantenimiento'; END IF;
        IF v_gasto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gastos WHERE id = v_gasto AND empresa_id = v.empresa_id) THEN
            RAISE EXCEPTION 'Gasto no encontrado';
        END IF;
        INSERT INTO activo_movimientos (empresa_id, activo_id, tipo, fecha, gasto_id, nota, usuario_id)
        VALUES (v.empresa_id, v.id, 'mantenimiento', v_fecha, v_gasto, v_nota, auth.uid());
    ELSE
        RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_tipo;
    END IF;
END $$;

-- ── 8. Baja y reactivación (admin/finanzas) ────────────────────────────────
CREATE OR REPLACE FUNCTION dar_baja_activo(p_id uuid, p_tipo_baja text, p_motivo text, p_fecha date, p_valor_recuperacion numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v activos%ROWTYPE;
BEGIN
    v := _activo_para_operar(p_id);
    IF NOT _activos_ve_valores() THEN RAISE EXCEPTION 'Solo administración o finanzas pueden dar de baja un activo'; END IF;
    IF v.estado = 'baja' THEN RAISE EXCEPTION 'El activo % ya está dado de baja', v.codigo; END IF;
    IF p_tipo_baja NOT IN ('venta', 'robo', 'dano', 'donacion', 'desecho', 'otro') THEN RAISE EXCEPTION 'Tipo de baja inválido'; END IF;
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo de la baja es obligatorio'; END IF;
    IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/Caracas')::date THEN RAISE EXCEPTION 'Fecha de baja inválida'; END IF;
    IF p_fecha < v.fecha_adquisicion THEN RAISE EXCEPTION 'La baja no puede ser anterior a la adquisición'; END IF;
    IF p_valor_recuperacion < 0 THEN RAISE EXCEPTION 'Valor de recuperación inválido'; END IF;

    UPDATE activos SET estado = 'baja', fecha_baja = p_fecha, tipo_baja = p_tipo_baja, motivo_baja = btrim(p_motivo),
        baja_por = auth.uid(), updated_at = now()
    WHERE id = v.id;
    UPDATE activo_valores SET valor_recuperacion = round(p_valor_recuperacion, 2) WHERE activo_id = v.id;
    INSERT INTO activo_movimientos (empresa_id, activo_id, tipo, fecha, estado_ant, estado_nuevo, nota, usuario_id)
    VALUES (v.empresa_id, v.id, 'baja', p_fecha, v.estado, 'baja', btrim(p_motivo), auth.uid());
END $$;

-- Deshace una baja registrada por error: vuelve como operativo
CREATE OR REPLACE FUNCTION reactivar_activo(p_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v activos%ROWTYPE;
BEGIN
    v := _activo_para_operar(p_id);
    IF NOT _activos_ve_valores() THEN RAISE EXCEPTION 'Solo administración o finanzas pueden reactivar un activo'; END IF;
    IF v.estado <> 'baja' THEN RAISE EXCEPTION 'El activo % no está dado de baja', v.codigo; END IF;
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;

    UPDATE activos SET estado = 'operativo', fecha_baja = NULL, tipo_baja = NULL, motivo_baja = NULL, baja_por = NULL, updated_at = now()
    WHERE id = v.id;
    UPDATE activo_valores SET valor_recuperacion = NULL WHERE activo_id = v.id;
    INSERT INTO activo_movimientos (empresa_id, activo_id, tipo, estado_ant, estado_nuevo, nota, usuario_id)
    VALUES (v.empresa_id, v.id, 'reactivacion', 'baja', 'operativo', btrim(p_motivo), auth.uid());
END $$;

-- ── 9. Permisos de ejecución ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION _activo_validar(uuid, jsonb), _activo_validar_responsable(uuid, uuid),
    _activo_validar_ubicacion(uuid, uuid), _activo_para_operar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crear_activo(jsonb, integer), editar_activo(uuid, jsonb),
    registrar_movimiento_activo(uuid, text, jsonb), dar_baja_activo(uuid, text, text, date, numeric),
    reactivar_activo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crear_activo(jsonb, integer), editar_activo(uuid, jsonb),
    registrar_movimiento_activo(uuid, text, jsonb), dar_baja_activo(uuid, text, text, date, numeric),
    reactivar_activo(uuid, text) TO authenticated;

-- ── 10. Módulo (se activa por empresa desde SuperAdmin) ────────────────────
INSERT INTO modulos (id, nombre, descripcion, icono, orden, activo)
VALUES ('activos', 'Activos', 'Registro y control de activos fijos', 'Archive', 14, true)
ON CONFLICT (id) DO NOTHING;
