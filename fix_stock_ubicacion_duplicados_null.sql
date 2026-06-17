-- ============================================================================
-- Fix: filas duplicadas en stock_ubicacion con almacen_ubicacion_id = NULL
-- ============================================================================
-- Contexto:
--   En Postgres NULL <> NULL para los indices unicos, por lo que pueden existir
--   varias filas con (empresa_id, almacen_id, tipo_item, item_id) iguales y
--   almacen_ubicacion_id = NULL. El patron .is(null).maybeSingle() en el codigo
--   falla cuando hay >1 fila e inserta otra mas, multiplicando los duplicados.
--
-- Este script:
--   1. Consolida los duplicados NULL en una sola fila por grupo (suma cantidades).
--   2. Crea un indice unico parcial para impedir que vuelvan a aparecer.
--
-- La invariante SUM(stock_ubicacion por item) = stock_actual se preserva: solo
-- se fusionan filas del mismo grupo, el total no cambia.
--
-- COMO USARLO:
--   1. Ejecuta primero el bloque "REVISION" para ver los duplicados (no modifica).
--   2. Si el resultado es razonable, ejecuta el bloque "APLICAR".
-- ============================================================================


-- ----------------------------------------------------------------------------
-- REVISION (solo lectura) — cuantos grupos duplicados hay y cuanto suman
-- ----------------------------------------------------------------------------
SELECT
    empresa_id,
    almacen_id,
    tipo_item,
    item_id,
    COUNT(*)        AS filas_duplicadas,
    SUM(cantidad)   AS cantidad_total
FROM stock_ubicacion
WHERE almacen_ubicacion_id IS NULL
GROUP BY empresa_id, almacen_id, tipo_item, item_id
HAVING COUNT(*) > 1
ORDER BY filas_duplicadas DESC, cantidad_total DESC;


-- ----------------------------------------------------------------------------
-- APLICAR (transaccional: todo o nada)
-- ----------------------------------------------------------------------------
BEGIN;

-- 1. Volcar el total del grupo en la fila superviviente (la de menor id)
WITH grupos AS (
    SELECT
        empresa_id, almacen_id, tipo_item, item_id,
        MIN(id::text)::uuid AS keep_id,
        SUM(cantidad)       AS total
    FROM stock_ubicacion
    WHERE almacen_ubicacion_id IS NULL
    GROUP BY empresa_id, almacen_id, tipo_item, item_id
    HAVING COUNT(*) > 1
)
UPDATE stock_ubicacion s
SET cantidad = g.total,
    updated_at = now()
FROM grupos g
WHERE s.id = g.keep_id;

-- 2. Eliminar las filas duplicadas restantes del grupo
WITH grupos AS (
    SELECT
        empresa_id, almacen_id, tipo_item, item_id,
        MIN(id::text)::uuid AS keep_id
    FROM stock_ubicacion
    WHERE almacen_ubicacion_id IS NULL
    GROUP BY empresa_id, almacen_id, tipo_item, item_id
    HAVING COUNT(*) > 1
)
DELETE FROM stock_ubicacion s
USING grupos g
WHERE s.almacen_ubicacion_id IS NULL
  AND s.empresa_id = g.empresa_id
  AND s.almacen_id = g.almacen_id
  AND s.tipo_item  = g.tipo_item
  AND s.item_id    = g.item_id
  AND s.id <> g.keep_id;

-- 3. Indice unico parcial: impide futuras filas NULL duplicadas por grupo
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_ubic_sin_ubicacion
ON stock_ubicacion (empresa_id, almacen_id, tipo_item, item_id)
WHERE almacen_ubicacion_id IS NULL;

COMMIT;


-- ----------------------------------------------------------------------------
-- VERIFICACION (solo lectura) — debe devolver 0 filas tras aplicar
-- ----------------------------------------------------------------------------
SELECT empresa_id, almacen_id, tipo_item, item_id, COUNT(*)
FROM stock_ubicacion
WHERE almacen_ubicacion_id IS NULL
GROUP BY empresa_id, almacen_id, tipo_item, item_id
HAVING COUNT(*) > 1;
