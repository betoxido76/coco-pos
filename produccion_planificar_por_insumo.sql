-- ============================================================================
-- Producción: planificar una orden por INSUMO a procesar (no por cantidad a producir)
--
-- Caso de origen: Meraki, MP intermedia 30001 "Agua de coco". No se planifica
-- "voy a producir X litros", sino "voy a procesar Y cocos de agua"; los litros
-- salen como consecuencia. Es una propiedad de la RECETA (cómo se fabrica), no
-- del producto, y sirve para cualquier proceso donde manda la materia prima.
--
-- La orden sigue guardando cantidad_planificada (en la unidad de salida, como
-- estimado), así que el resto de Producción funciona igual. Además guarda qué
-- insumo y cuánto escribió el usuario: con eso el factor de la receta se
-- calcula exacto (cantidad_insumo_base / cantidad del insumo en la receta) y no
-- desde cantidad_planificada, que tiene 2 decimales y reintroduciría error.
--
-- El insumo base se referencia por (tipo, id) y no por receta_items.id: el
-- editor de recetas borra y reinserta los ítems en cada guardado.
-- ============================================================================

ALTER TABLE recetas
    ADD COLUMN IF NOT EXISTS planificar_por text NOT NULL DEFAULT 'salida',
    ADD COLUMN IF NOT EXISTS insumo_base_tipo text,
    ADD COLUMN IF NOT EXISTS insumo_base_id uuid;

ALTER TABLE recetas DROP CONSTRAINT IF EXISTS recetas_planificar_por_valido;
ALTER TABLE recetas ADD CONSTRAINT recetas_planificar_por_valido CHECK (
    planificar_por IN ('salida', 'insumo')
    AND (planificar_por = 'salida' OR (insumo_base_tipo IS NOT NULL AND insumo_base_id IS NOT NULL))
);

COMMENT ON COLUMN recetas.planificar_por IS
    '''salida'' = la orden se planifica por cantidad a producir (default). ''insumo'' = por cantidad del insumo base a procesar; la salida es un estimado.';
COMMENT ON COLUMN recetas.insumo_base_id IS
    'Insumo que manda cuando planificar_por = ''insumo''. Debe estar en receta_items (tipo_insumo, insumo_id).';

-- Foto de cómo se planificó la orden (la receta puede cambiar después)
ALTER TABLE ordenes_produccion
    ADD COLUMN IF NOT EXISTS planificada_por text NOT NULL DEFAULT 'salida',
    ADD COLUMN IF NOT EXISTS insumo_base_tipo text,
    ADD COLUMN IF NOT EXISTS insumo_base_id uuid,
    ADD COLUMN IF NOT EXISTS cantidad_insumo_base numeric(14,4);

ALTER TABLE ordenes_produccion DROP CONSTRAINT IF EXISTS ordenes_produccion_planificada_por_valido;
ALTER TABLE ordenes_produccion ADD CONSTRAINT ordenes_produccion_planificada_por_valido CHECK (
    planificada_por IN ('salida', 'insumo')
    AND (planificada_por = 'salida'
         OR (insumo_base_tipo IS NOT NULL AND insumo_base_id IS NOT NULL AND cantidad_insumo_base > 0))
);

COMMENT ON COLUMN ordenes_produccion.cantidad_insumo_base IS
    'Cantidad del insumo base que el usuario decidió procesar (planificada_por = ''insumo''). cantidad_planificada es el rinde estimado.';
