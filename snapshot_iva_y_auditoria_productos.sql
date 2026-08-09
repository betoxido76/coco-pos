-- ============================================================================
-- 1) Congelar aplica_iva en pedido_items
-- 2) Auditoría de cambios en productos_terminados
--
-- Origen: PED-000816 mostraba productos exentos con el precio dividido entre
-- 1.16. El diagnóstico descartó un bug de código (407 líneas exentas se
-- trataron bien en el mismo período): la casilla `aplica_iva` de esos productos
-- se cambió DESPUÉS de tomarse el pedido.
--
-- Eso destapó dos huecos:
--   · `pedido_items` no guarda su propio `aplica_iva`, así que lee el ACTUAL del
--     producto → cambiar la casilla recalcula los totales de todos los pedidos
--     históricos. `venta_items` sí lo congela desde siempre.
--   · `productos_terminados` no registra cuándo ni quién modificó, así que la
--     pregunta "¿esto lo cambió alguien?" requiere una investigación.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Snapshot de aplica_iva en la línea del pedido.
-- Nullable a propósito: NULL = línea anterior a este cambio, y el front cae al
-- valor actual del producto (comportamiento de hoy). No usar DEFAULT true:
-- afirmaría que las líneas viejas gravan IVA cuando no se sabe.
-- ----------------------------------------------------------------------------
ALTER TABLE pedido_items
    ADD COLUMN IF NOT EXISTS aplica_iva boolean;

COMMENT ON COLUMN pedido_items.aplica_iva IS
    'Snapshot de productos_terminados.aplica_iva al crear la línea. NULL = línea previa al snapshot; el cálculo cae al valor actual del producto.';


-- ----------------------------------------------------------------------------
-- PASO 2 — Auditoría en productos_terminados.
-- El trigger cubre TODA actualización, venga del app o del SQL Editor.
-- `actualizado_por` lo escribe el app; queda NULL en cambios hechos por SQL.
-- ----------------------------------------------------------------------------
ALTER TABLE productos_terminados
    ADD COLUMN IF NOT EXISTS updated_at     timestamptz,
    ADD COLUMN IF NOT EXISTS actualizado_por uuid;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_productos_terminados_updated_at ON productos_terminados;
CREATE TRIGGER trg_productos_terminados_updated_at
    BEFORE UPDATE ON productos_terminados
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN productos_terminados.updated_at IS
    'Última modificación, puesta por trigger en cualquier UPDATE.';
COMMENT ON COLUMN productos_terminados.actualizado_por IS
    'Usuario que guardó desde la aplicación. NULL si el cambio vino por SQL.';


-- ----------------------------------------------------------------------------
-- PASO 3 — Backfill del snapshot para pedidos ABIERTOS.
-- Solo los que aún no se facturaron: en esos el valor actual del producto sigue
-- siendo el que corresponde aplicar. Los ya facturados NO se tocan: su venta ya
-- congeló el aplica_iva que se usó, y escribir el valor de hoy inventaría un
-- dato histórico que no conocemos.
-- ----------------------------------------------------------------------------
UPDATE pedido_items pi
SET aplica_iva = pt.aplica_iva
FROM pedidos p, productos_terminados pt
WHERE p.id = pi.pedido_id
  AND pt.id = pi.producto_id
  AND pi.aplica_iva IS NULL
  AND p.estado IN ('pendiente', 'aprobado', 'alistado');


-- ----------------------------------------------------------------------------
-- PASO 4 — Verificar
-- ----------------------------------------------------------------------------
SELECT p.estado,
       count(*)                          AS lineas,
       count(pi.aplica_iva)              AS con_snapshot,
       count(*) - count(pi.aplica_iva)   AS sin_snapshot
FROM pedido_items pi
JOIN pedidos p ON p.id = pi.pedido_id
GROUP BY p.estado
ORDER BY p.estado;
