-- ============================================================================
-- ¿Por qué el paso 2 del backfill no devolvió clientes especiales?
--
-- Hipótesis: sí están marcados, pero sus pagos nunca generaron filas en
-- `cobros` (ventas de contado antes del arreglo, o ventas migradas del POS
-- anterior). El paso 2 partía de `cobros`, así que no podía verlos.
--
-- CORRECCIÓN: la primera versión no filtraba por empresa, así que sus cifras
-- (386 false / 51 true, 2.101 ventas) abarcaban TODA la base. Si hay más de una
-- empresa, esos números estaban inflados. Ahora se acota a la empresa indicada.
-- ============================================================================

-- Empresa bajo análisis: bee65e82-665d-460b-b0b6-7006d3524744


-- ----------------------------------------------------------------------------
-- A) ¿El campo está poblado? Si no aparece ningún TRUE, el checkbox nunca se usó.
-- ----------------------------------------------------------------------------
SELECT contribuyente_especial, count(*) AS clientes
FROM clientes
WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
GROUP BY 1
ORDER BY 1;


-- ----------------------------------------------------------------------------
-- B) Los marcados como especiales: ¿tienen facturas? ¿y cobros registrados?
--    ventas > 0 con cobros = 0 confirma la hipótesis.
-- ----------------------------------------------------------------------------
SELECT cl.nombre, cl.rif,
       count(DISTINCT v.id)  AS ventas,
       count(DISTINCT c.id)  AS cobros,
       count(DISTINCT v.id) FILTER (WHERE v.estado_cobro = 'pagado')  AS ventas_pagadas,
       sum(v.total) FILTER (WHERE v.id IS NOT NULL)                   AS facturado
FROM clientes cl
LEFT JOIN ventas v ON v.cliente_id = cl.id
LEFT JOIN cobros c ON c.venta_id  = v.id
WHERE cl.contribuyente_especial IS TRUE
  AND cl.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
GROUP BY cl.nombre, cl.rif
ORDER BY ventas DESC;


-- ----------------------------------------------------------------------------
-- C) Cobertura global: cuántas ventas tienen respaldo en `cobros` y cuántas no.
--    Dimensiona el hueco real del histórico.
-- ----------------------------------------------------------------------------
SELECT cl.contribuyente_especial,
       count(*)                                                    AS ventas,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id)) AS con_cobros,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM cobros c WHERE c.venta_id = v.id)) AS sin_cobros
FROM ventas v
JOIN clientes cl ON cl.id = v.cliente_id
WHERE v.empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744'
GROUP BY 1
ORDER BY 1;
