-- Laboratorio VIN (prueba, solo superadmin). Guarda las lecturas del serial de
-- carrocería hechas desde el teléfono: código de barras o foto leída por IA
-- (Edge Function leer-vin). No es de ninguna empresa: no lleva empresa_id.
-- Si el piloto se confirma, la app definitiva va aparte de MiPOS.

CREATE TABLE IF NOT EXISTS public.lab_vin_escaneos (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
    vin           text NOT NULL,                 -- el que confirmó el usuario
    vin_leido     text,                          -- el que devolvió la lectura (antes de corregir)
    fuente        text NOT NULL CHECK (fuente IN ('ia', 'codigo_barras', 'manual')),
    corregido     boolean NOT NULL DEFAULT false, -- el usuario cambió la lectura
    valido        boolean,                       -- 17 caracteres, sin I/O/Q
    digito_ok     boolean,                       -- dígito verificador (NULL = no aplica)
    ubicacion     text,                          -- dónde lo vio la IA: parabrisas, puerta, documento...
    legibilidad   text,
    notas_lectura text,
    decodificado  jsonb,                         -- marca, modelo, año... (NHTSA vPIC)
    observaciones text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lab_vin_escaneos_created_idx ON public.lab_vin_escaneos (created_at DESC);

ALTER TABLE public.lab_vin_escaneos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_vin_superadmin ON public.lab_vin_escaneos;
CREATE POLICY lab_vin_superadmin ON public.lab_vin_escaneos
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- Desde 2026-10-30 Supabase no da estos permisos solo (CLAUDE.md §15)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_vin_escaneos TO authenticated, service_role;
