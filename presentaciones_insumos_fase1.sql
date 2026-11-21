-- =============================================================================
-- Presentaciones de insumos — Fase 1: base de datos
-- docs/plan-presentaciones-insumos.md
--
-- Todo es ADITIVO: un insumo sin presentaciones y una línea de compra sin
-- presentación funcionan exactamente como antes (Meraki y demás empresas).
--   1. Tabla insumo_presentaciones (formas de compra con factor a la unidad base)
--   2. Columnas opcionales de presentación en OC, recepción y devolución a proveedor
--   3. Trigger de cuadre: cantidad = cant. presentación × factor,
--      precio_unitario = precio presentación ÷ factor
--   4. Más decimales en costos y en el precio por unidad base de la recepción
--   5. Configuración de costeo por empresa + último costo + costo en movimientos
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Presentaciones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.insumo_presentaciones (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id    uuid NOT NULL REFERENCES public.empresas(id),
    tipo_insumo   text NOT NULL CHECK (tipo_insumo IN ('materia_prima', 'material_empaque', 'consumible')),
    insumo_id     uuid NOT NULL,
    nombre        text NOT NULL CHECK (btrim(nombre) <> ''),
    factor        numeric(18,6) NOT NULL CHECK (factor > 0),
    marca         text,
    proveedor_id  uuid REFERENCES public.proveedores(id),
    codigo_barras text,
    activa        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    creado_por    uuid REFERENCES public.usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS insumo_presentaciones_nombre_uq
    ON public.insumo_presentaciones (insumo_id, lower(btrim(nombre)));
CREATE INDEX IF NOT EXISTS insumo_presentaciones_empresa_idx
    ON public.insumo_presentaciones (empresa_id, tipo_insumo, insumo_id);

ALTER TABLE public.insumo_presentaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insumo_presentaciones_tenant ON public.insumo_presentaciones;
CREATE POLICY insumo_presentaciones_tenant ON public.insumo_presentaciones
    FOR ALL USING (empresa_id = get_empresa_id() OR is_superadmin())
    WITH CHECK (empresa_id = get_empresa_id() OR is_superadmin());
REVOKE ALL ON public.insumo_presentaciones FROM anon, PUBLIC;  -- Supabase lo da por defecto
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insumo_presentaciones TO authenticated, service_role;

-- El insumo debe existir en su tabla y ser de la misma empresa.
-- El factor no se edita si la presentación ya se usó (las líneas guardan su foto,
-- pero un factor cambiado confundiría la lectura del historial).
CREATE OR REPLACE FUNCTION public._insumo_presentaciones_valida()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_empresa uuid;
BEGIN
    IF NEW.tipo_insumo = 'materia_prima' THEN
        SELECT empresa_id INTO v_empresa FROM public.materias_primas WHERE id = NEW.insumo_id;
    ELSIF NEW.tipo_insumo = 'material_empaque' THEN
        SELECT empresa_id INTO v_empresa FROM public.materiales_empaque WHERE id = NEW.insumo_id;
    ELSE
        SELECT empresa_id INTO v_empresa FROM public.consumibles WHERE id = NEW.insumo_id;
    END IF;
    IF v_empresa IS NULL OR v_empresa <> NEW.empresa_id THEN
        RAISE EXCEPTION 'El insumo de la presentación no existe en esta empresa';
    END IF;

    NEW.nombre := btrim(NEW.nombre);

    IF TG_OP = 'UPDATE' THEN
        IF NEW.insumo_id <> OLD.insumo_id OR NEW.tipo_insumo <> OLD.tipo_insumo THEN
            RAISE EXCEPTION 'Una presentación no se puede pasar a otro insumo';
        END IF;
        IF NEW.factor <> OLD.factor AND (
               EXISTS (SELECT 1 FROM public.compra_items WHERE presentacion_id = OLD.id)
            OR EXISTS (SELECT 1 FROM public.orden_compra_items WHERE presentacion_id = OLD.id)
            OR EXISTS (SELECT 1 FROM public.devolucion_proveedor_items WHERE presentacion_id = OLD.id)) THEN
            RAISE EXCEPTION 'La presentación "%" ya se usó en compras: no se puede cambiar su factor. Desactívela y cree una nueva.', OLD.nombre;
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS insumo_presentaciones_valida ON public.insumo_presentaciones;

-- -----------------------------------------------------------------------------
-- 2. Columnas de presentación en las líneas (todas NULL = línea como hoy)
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['orden_compra_items', 'compra_items', 'devolucion_proveedor_items'] LOOP
        EXECUTE format('ALTER TABLE public.%I
            ADD COLUMN IF NOT EXISTS presentacion_id uuid REFERENCES public.insumo_presentaciones(id),
            ADD COLUMN IF NOT EXISTS presentacion_nombre text,
            ADD COLUMN IF NOT EXISTS factor numeric(18,6),
            ADD COLUMN IF NOT EXISTS cantidad_presentacion numeric(14,4),
            ADD COLUMN IF NOT EXISTS precio_presentacion numeric(14,6)', t);
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (presentacion_id) WHERE presentacion_id IS NOT NULL',
                       t || '_presentacion_idx', t);
    END LOOP;
END $$;

-- Ahora que existen las columnas, el trigger de validación de la presentación
CREATE TRIGGER insumo_presentaciones_valida
    BEFORE INSERT OR UPDATE ON public.insumo_presentaciones
    FOR EACH ROW EXECUTE FUNCTION public._insumo_presentaciones_valida();

-- -----------------------------------------------------------------------------
-- 3. Trigger de cuadre (candado: aunque la pantalla calcule mal o sea una
--    versión vieja, la línea queda convertida a la unidad base)
-- -----------------------------------------------------------------------------
-- Regla: en una línea con presentación, (cantidad_presentacion, precio_presentacion)
-- y (cantidad, precio_unitario) siempre cuadran por el factor.
--  * INSERT: mandan los campos de presentación.
--  * UPDATE: manda el par que haya cambiado. Si un código que no sabe de
--    presentaciones cambia solo precio_unitario (p. ej. la corrección de
--    factura en CxP) o solo la cantidad, se recalcula el de presentación en
--    vez de pisar el cambio.
-- La cantidad en unidad base vive en cantidad_solicitada (OC) o cantidad
-- (recepción, devolución); el precio en precio_unitario_esperado o precio_unitario.
CREATE OR REPLACE FUNCTION public._linea_presentacion_cuadra()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    p public.insumo_presentaciones%ROWTYPE;
    es_oc boolean := TG_TABLE_NAME = 'orden_compra_items';
    j_new jsonb;
    j_old jsonb;
    v_cant_base numeric;
    v_precio_base numeric;
    cambio_base_cant boolean := false;
    cambio_base_precio boolean := false;
    cambio_pres_cant boolean := true;
    cambio_pres_precio boolean := true;
    c_cant text := CASE WHEN TG_TABLE_NAME = 'orden_compra_items' THEN 'cantidad_solicitada' ELSE 'cantidad' END;
    c_precio text := CASE WHEN TG_TABLE_NAME = 'orden_compra_items' THEN 'precio_unitario_esperado' ELSE 'precio_unitario' END;
BEGIN
    -- Línea sin presentación: no se toca (comportamiento de siempre)
    IF NEW.presentacion_id IS NULL AND NEW.cantidad_presentacion IS NULL
       AND NEW.precio_presentacion IS NULL AND NEW.factor IS NULL THEN
        RETURN NEW;
    END IF;

    j_new := to_jsonb(NEW);
    IF TG_OP = 'UPDATE' THEN
        j_old := to_jsonb(OLD);
        cambio_base_cant   := j_new -> c_cant   IS DISTINCT FROM j_old -> c_cant;
        cambio_base_precio := j_new -> c_precio IS DISTINCT FROM j_old -> c_precio;
        cambio_pres_cant   := NEW.cantidad_presentacion IS DISTINCT FROM OLD.cantidad_presentacion
                              OR NEW.factor IS DISTINCT FROM OLD.factor
                              OR NEW.presentacion_id IS DISTINCT FROM OLD.presentacion_id;
        cambio_pres_precio := NEW.precio_presentacion IS DISTINCT FROM OLD.precio_presentacion
                              OR NEW.factor IS DISTINCT FROM OLD.factor
                              OR NEW.presentacion_id IS DISTINCT FROM OLD.presentacion_id;
    END IF;

    IF NEW.presentacion_id IS NOT NULL THEN
        SELECT * INTO p FROM public.insumo_presentaciones WHERE id = NEW.presentacion_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La presentación indicada no existe';
        END IF;
        IF p.insumo_id <> NEW.insumo_id OR p.empresa_id <> NEW.empresa_id THEN
            RAISE EXCEPTION 'La presentación "%" no corresponde a este insumo', p.nombre;
        END IF;
        -- Foto: al crear la línea (o cambiarle la presentación) se toman factor y
        -- nombre; después se respeta la foto aunque la presentación cambie
        IF TG_OP = 'INSERT' THEN
            NEW.factor := p.factor;
            NEW.presentacion_nombre := p.nombre;
        ELSIF NEW.presentacion_id IS DISTINCT FROM OLD.presentacion_id THEN
            NEW.factor := p.factor;
            NEW.presentacion_nombre := p.nombre;
        END IF;
    END IF;

    IF NEW.factor IS NULL OR NEW.factor <= 0 THEN
        RAISE EXCEPTION 'Línea con presentación sin factor de conversión';
    END IF;

    -- Cantidad
    IF cambio_base_cant AND NOT cambio_pres_cant THEN
        NEW.cantidad_presentacion := round((j_new ->> c_cant)::numeric / NEW.factor, 4);
    ELSE
        IF NEW.cantidad_presentacion IS NULL THEN
            RAISE EXCEPTION 'Línea con presentación sin cantidad de presentaciones';
        END IF;
        v_cant_base := NEW.cantidad_presentacion * NEW.factor;
    END IF;

    -- Precio
    IF cambio_base_precio AND NOT cambio_pres_precio THEN
        IF (j_new ->> c_precio) IS NOT NULL THEN
            NEW.precio_presentacion := round((j_new ->> c_precio)::numeric * NEW.factor, 6);
        END IF;
    ELSIF NEW.precio_presentacion IS NOT NULL THEN
        v_precio_base := round(NEW.precio_presentacion / NEW.factor, 10);
    END IF;

    IF es_oc THEN
        IF v_cant_base IS NOT NULL THEN NEW.cantidad_solicitada := v_cant_base; END IF;
        IF v_precio_base IS NOT NULL THEN NEW.precio_unitario_esperado := v_precio_base; END IF;
    ELSE
        IF v_cant_base IS NOT NULL THEN NEW.cantidad := v_cant_base; END IF;
        IF v_precio_base IS NOT NULL THEN NEW.precio_unitario := v_precio_base; END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS linea_presentacion_cuadra ON public.orden_compra_items;
CREATE TRIGGER linea_presentacion_cuadra BEFORE INSERT OR UPDATE ON public.orden_compra_items
    FOR EACH ROW EXECUTE FUNCTION public._linea_presentacion_cuadra();
DROP TRIGGER IF EXISTS linea_presentacion_cuadra ON public.compra_items;
CREATE TRIGGER linea_presentacion_cuadra BEFORE INSERT OR UPDATE ON public.compra_items
    FOR EACH ROW EXECUTE FUNCTION public._linea_presentacion_cuadra();
DROP TRIGGER IF EXISTS linea_presentacion_cuadra ON public.devolucion_proveedor_items;
CREATE TRIGGER linea_presentacion_cuadra BEFORE INSERT OR UPDATE ON public.devolucion_proveedor_items
    FOR EACH ROW EXECUTE FUNCTION public._linea_presentacion_cuadra();

-- -----------------------------------------------------------------------------
-- 4. Decimales. Ampliar la escala no cambia ningún valor existente.
--    Las vistas del exportador que leen estas columnas se recrean idénticas.
-- -----------------------------------------------------------------------------
-- Se guardan definición, opciones (security_invoker) y permisos de TODAS las
-- vistas que dependen de esas columnas, directa o indirectamente
-- (v_export_compras_detalle depende de v_export_compras_lineas), se borran de
-- la más dependiente a la base y se recrean en orden inverso.
DO $$
DECLARE
    r record;
    g record;
BEGIN
    CREATE TEMP TABLE _vistas_dep ON COMMIT DROP AS
    WITH RECURSIVE dep AS (
        SELECT DISTINCT v.oid, 1 AS nivel
        FROM pg_depend d
        JOIN pg_rewrite rw ON rw.oid = d.objid
        JOIN pg_class v ON v.oid = rw.ev_class
        JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
        WHERE v.relkind = 'v' AND v.oid <> d.refobjid
          AND ((d.refobjid = 'public.materias_primas'::regclass    AND a.attname = 'costo_compra_promedio')
            OR (d.refobjid = 'public.materiales_empaque'::regclass AND a.attname = 'costo_compra_promedio')
            OR (d.refobjid = 'public.consumibles'::regclass        AND a.attname = 'costo_compra_promedio')
            OR (d.refobjid = 'public.compra_items'::regclass       AND a.attname IN ('precio_unitario', 'precio_recepcion')))
        UNION
        SELECT v.oid, dep.nivel + 1
        FROM dep
        JOIN pg_depend d ON d.refobjid = dep.oid
        JOIN pg_rewrite rw ON rw.oid = d.objid
        JOIN pg_class v ON v.oid = rw.ev_class
        WHERE v.relkind = 'v' AND v.oid <> dep.oid
    )
    SELECT c.oid, c.relname::text AS nombre, max(dep.nivel) AS nivel,
           pg_get_viewdef(c.oid, true) AS def, c.reloptions, c.relacl, c.relowner
    FROM dep JOIN pg_class c ON c.oid = dep.oid
    GROUP BY c.oid;

    FOR r IN SELECT * FROM _vistas_dep ORDER BY nivel DESC LOOP
        EXECUTE format('DROP VIEW public.%I', r.nombre);
    END LOOP;

    ALTER TABLE public.materias_primas    ALTER COLUMN costo_compra_promedio TYPE numeric(18,8);
    ALTER TABLE public.materiales_empaque ALTER COLUMN costo_compra_promedio TYPE numeric(18,8);
    ALTER TABLE public.consumibles        ALTER COLUMN costo_compra_promedio TYPE numeric(18,8);
    -- Precio por unidad base de la recepción (p. ej. $9,80 ÷ 18.000 ml)
    ALTER TABLE public.compra_items ALTER COLUMN precio_unitario  TYPE numeric(20,10);
    ALTER TABLE public.compra_items ALTER COLUMN precio_recepcion TYPE numeric(20,10);

    FOR r IN SELECT * FROM _vistas_dep ORDER BY nivel ASC LOOP
        EXECUTE format('CREATE VIEW public.%I %s AS %s', r.nombre,
            CASE WHEN r.reloptions IS NOT NULL THEN 'WITH (' || array_to_string(r.reloptions, ', ') || ')' ELSE '' END,
            r.def);
        -- Supabase da permisos por defecto a las vistas nuevas (incluido anon):
        -- se quitan y se restauran exactamente los que tenía
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', r.nombre);
        FOR g IN SELECT x.privilege_type, x.grantee FROM aclexplode(r.relacl) x WHERE x.grantee <> r.relowner LOOP
            EXECUTE format('GRANT %s ON public.%I TO %s', g.privilege_type, r.nombre,
                CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
        END LOOP;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Costeo
-- -----------------------------------------------------------------------------
ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS costeo_insumos text NOT NULL DEFAULT 'ultimo_precio';
DO $$ BEGIN
    ALTER TABLE public.empresas ADD CONSTRAINT empresas_costeo_insumos_chk
        CHECK (costeo_insumos IN ('ultimo_precio', 'promedio_ponderado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['materias_primas', 'materiales_empaque', 'consumibles'] LOOP
        EXECUTE format('ALTER TABLE public.%I
            ADD COLUMN IF NOT EXISTS costo_ultima_compra numeric(18,8),
            ADD COLUMN IF NOT EXISTS fecha_ultima_compra date', t);
    END LOOP;
END $$;

-- Costo vigente al momento de cada movimiento (kardex valorizado). Lo llena la fase 4.
ALTER TABLE public.movimientos_inventario ADD COLUMN IF NOT EXISTS costo_unitario numeric(18,8);

-- -----------------------------------------------------------------------------
-- 6. Versión mínima de la app también en la tabla nueva
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS exigir_version_app ON public.insumo_presentaciones;
CREATE TRIGGER exigir_version_app BEFORE INSERT OR UPDATE OR DELETE ON public.insumo_presentaciones
    FOR EACH STATEMENT EXECUTE FUNCTION public._exigir_version_app();

COMMIT;
