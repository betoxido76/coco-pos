-- ============================================================================
-- Cambios mano a mano multi-SKU: tabla de items (cabecera + lineas)
-- ============================================================================
-- cambios_mano_mano pasa a ser la CABECERA del documento (cliente, despachador,
-- fecha, numero, estado, almacen origen). Cada SKU del documento vive en
-- cambio_items, con su propio motivo y destino (reprocesar/desechar).
--
-- Las columnas de linea en la cabecera (producto_id, cantidad, motivo, destino)
-- se conservan para compatibilidad con filas viejas pero se vuelven nullable;
-- el backfill copia cada cambio existente a una linea en cambio_items para que
-- toda la app lea de forma uniforme desde cambio_items.
--
-- COMO USARLO: ejecutar este bloque completo en el SQL Editor de Supabase.
-- ============================================================================

BEGIN;

-- 1. Tabla de items
CREATE TABLE IF NOT EXISTS public.cambio_items (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cambio_id            uuid NOT NULL REFERENCES public.cambios_mano_mano(id) ON DELETE CASCADE,
    empresa_id           uuid NOT NULL REFERENCES public.empresas(id),
    producto_id          uuid NOT NULL REFERENCES public.productos_terminados(id),
    cantidad             numeric NOT NULL CHECK (cantidad > 0),
    motivo               text NOT NULL,
    destino              text CHECK (destino IS NULL OR destino IN ('reprocesar','desechar')),
    almacen_reproceso_id uuid REFERENCES public.almacenes(id),
    created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cambio_items_cambio  ON public.cambio_items(cambio_id);
CREATE INDEX IF NOT EXISTS ix_cambio_items_empresa ON public.cambio_items(empresa_id);

-- 2. RLS: aislar por empresa (igual que el resto de tablas)
ALTER TABLE public.cambio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cambio_items_select ON public.cambio_items;
DROP POLICY IF EXISTS cambio_items_insert ON public.cambio_items;
DROP POLICY IF EXISTS cambio_items_update ON public.cambio_items;
DROP POLICY IF EXISTS cambio_items_delete ON public.cambio_items;

CREATE POLICY cambio_items_select ON public.cambio_items
    FOR SELECT USING (empresa_id = get_empresa_id() OR is_superadmin());
CREATE POLICY cambio_items_insert ON public.cambio_items
    FOR INSERT WITH CHECK (empresa_id = get_empresa_id() OR is_superadmin());
CREATE POLICY cambio_items_update ON public.cambio_items
    FOR UPDATE USING (empresa_id = get_empresa_id() OR is_superadmin());
CREATE POLICY cambio_items_delete ON public.cambio_items
    FOR DELETE USING (empresa_id = get_empresa_id() OR is_superadmin());

-- 3. Backfill: una linea por cada cambio existente con producto_id
INSERT INTO public.cambio_items (cambio_id, empresa_id, producto_id, cantidad, motivo, destino, created_at)
SELECT c.id, c.empresa_id, c.producto_id, c.cantidad, c.motivo, c.destino, c.created_at
FROM public.cambios_mano_mano c
WHERE c.producto_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.cambio_items ci WHERE ci.cambio_id = c.id);

-- 4. Columnas de linea en la cabecera dejan de ser obligatorias
ALTER TABLE public.cambios_mano_mano ALTER COLUMN producto_id DROP NOT NULL;
ALTER TABLE public.cambios_mano_mano ALTER COLUMN cantidad    DROP NOT NULL;
ALTER TABLE public.cambios_mano_mano ALTER COLUMN motivo      DROP NOT NULL;

COMMIT;

-- ----------------------------------------------------------------------------
-- VERIFICACION (solo lectura): cada cambio con producto_id debe tener >=1 item
-- ----------------------------------------------------------------------------
SELECT c.id, c.numero_cambio, COUNT(ci.id) AS items
FROM public.cambios_mano_mano c
LEFT JOIN public.cambio_items ci ON ci.cambio_id = c.id
WHERE c.producto_id IS NOT NULL
GROUP BY c.id, c.numero_cambio
HAVING COUNT(ci.id) = 0;
