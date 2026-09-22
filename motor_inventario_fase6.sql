-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 6 — Barreras de integridad de inventario.  APLICADO EN PRODUCCIÓN
-- (migración `barreras_integridad_inventario`). Este archivo es el registro.
--
-- Lo que el código no garantice, que lo garantice Postgres. Las cuatro
-- restricciones se verificaron contra los datos antes de aplicarse: 0 filas
-- violaban cualquiera de ellas.
--
-- Deliberadamente NO hay un trigger que fuerce stock_actual = SUM(ubicaciones).
-- Eso convertiría cualquier bug futuro en corrupción silenciosa en vez de un
-- error visible — que es exactamente lo que hace sincronizarStockActual() hoy
-- y es parte del problema. Se prefiere detectar el descuadre, no autocorregirlo.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE stock_ubicacion ALTER COLUMN cantidad SET DEFAULT 0;
ALTER TABLE stock_ubicacion ALTER COLUMN cantidad SET NOT NULL;

ALTER TABLE stock_ubicacion ADD CONSTRAINT stock_ubicacion_cantidad_no_negativa
    CHECK (cantidad >= 0);

ALTER TABLE stock_ubicacion ADD CONSTRAINT stock_ubicacion_tipo_item_valido
    CHECK (tipo_item IN ('producto_terminado','materia_prima','material_empaque','consumible'));

-- En un AJUSTE, `cantidad` es la cantidad NUEVA, no un delta: un ajuste a cero
-- es legítimo y hay 13 en la base. Una entrada o salida de cero no significa nada.
ALTER TABLE movimientos_inventario ADD CONSTRAINT movimientos_cantidad_coherente
    CHECK (cantidad >= 0 AND (tipo_movimiento NOT IN ('entrada','salida') OR cantidad > 0));

ALTER TABLE movimientos_inventario ADD CONSTRAINT movimientos_tipo_item_valido
    CHECK (tipo_item IN ('producto_terminado','materia_prima','material_empaque','consumible'));

-- ── La invariante, como vista permanente ───────────────────────────────────
-- security_invoker = true para que apliquen las políticas RLS del usuario que
-- consulta: cada empresa ve solo sus ítems.
--   v_inventario_invariante  -> todos los ítems, con catálogo vs almacenes
--   v_inventario_descuadre   -> solo los rotos. Vacía = inventario sano.
--
-- (Definición completa en la migración; se consulta así:)
--   SELECT * FROM v_inventario_descuadre ORDER BY abs(diferencia) DESC;
