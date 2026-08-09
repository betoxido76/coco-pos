-- ============================================================================
-- Backfill de cobros.contribuyente_especial desde el estatus ACTUAL del cliente
--
-- ⚠️ LEER ANTES DE EJECUTAR
-- La columna guarda el estatus que el cliente tenía EN EL MOMENTO DEL PAGO.
-- Este script no puede saberlo para los cobros viejos, así que copia el estatus
-- que el cliente tiene HOY. Si algún cliente cambió de condición desde entonces,
-- esos pagos quedan clasificados con el estatus equivocado, y no hay manera de
-- detectarlo después: `clientes` no guarda historial de cambios.
--
-- Ejecutar SOLO si sabes que ningún cliente se reclasificó en el período.
-- Si no estás seguro, deja los NULL: un reporte los muestra como "sin
-- clasificar", que es la verdad, en vez de un dato inventado.
--
-- Los cobros registrados a partir del despliegue del 2026-08-08 ya traen su
-- snapshot real y NO son tocados por este script (la cláusula IS NULL los
-- excluye).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Vista previa: cómo quedarían repartidos los cobros sin estatus.
-- No modifica nada. Correr esto primero.
-- ----------------------------------------------------------------------------
SELECT COALESCE(cl.contribuyente_especial::text, 'sin dato en el cliente') AS quedaria_como,
       count(*)      AS cobros,
       count(DISTINCT cl.id) AS clientes,
       min(c.fecha_cobro)::date AS desde,
       max(c.fecha_cobro)::date AS hasta
FROM cobros c
JOIN ventas   v  ON v.id = c.venta_id
JOIN clientes cl ON cl.id = v.cliente_id
WHERE c.contribuyente_especial IS NULL
GROUP BY 1
ORDER BY 1;


-- ----------------------------------------------------------------------------
-- PASO 2 — Cuáles clientes están marcados como especiales hoy.
-- Sirve para validar con quien conozca la cartera si eso aplicaba antes.
-- ----------------------------------------------------------------------------
SELECT cl.nombre, cl.rif, count(c.id) AS cobros_a_reclasificar
FROM clientes cl
JOIN ventas   v ON v.cliente_id = cl.id
JOIN cobros   c ON c.venta_id = v.id AND c.contribuyente_especial IS NULL
WHERE cl.contribuyente_especial IS TRUE
GROUP BY cl.nombre, cl.rif
ORDER BY cobros_a_reclasificar DESC;


-- ----------------------------------------------------------------------------
-- PASO 3 — El backfill. Descomentar para ejecutar.
-- ----------------------------------------------------------------------------
-- UPDATE cobros c
-- SET contribuyente_especial = cl.contribuyente_especial
-- FROM ventas v
-- JOIN clientes cl ON cl.id = v.cliente_id
-- WHERE c.venta_id = v.id
--   AND c.contribuyente_especial IS NULL
--   AND cl.contribuyente_especial IS NOT NULL;


-- ----------------------------------------------------------------------------
-- PASO 4 — Verificar
-- ----------------------------------------------------------------------------
SELECT count(*) AS cobros_totales,
       count(contribuyente_especial) AS con_estatus,
       count(*) FILTER (WHERE contribuyente_especial IS TRUE)  AS especiales,
       count(*) FILTER (WHERE contribuyente_especial IS FALSE) AS ordinarios,
       count(*) - count(contribuyente_especial) AS sin_estatus
FROM cobros;
