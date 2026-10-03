-- ============================================================================
-- Precios sin IVA — Fase 4: costos de insumos a base imponible (Grupo Meraki).
-- Plan: docs/plan-iva-base-imponible.md (decisión 0.7, alternativa A).
-- Respaldo de revisión: Meraki_Costos_Insumos_IVA.xlsx (raíz, fuera de git).
--
-- Los costos se cargaron con la convención vieja (IVA incluido); Inventario
-- los dividía entre 1,16 al valorar. Desde el corte el costo ES la base y la
-- pantalla deja de dividir: el valor que muestra Inventario no cambia.
-- Ningún total de documento depende del costo.
-- ============================================================================

-- Respaldo de los costos actuales de todo lo que se toca
CREATE TABLE IF NOT EXISTS backup_costos_iva_20261002 AS
SELECT 'materias_primas'::text tabla, id, codigo, nombre, costo_compra_promedio costo FROM materias_primas
 WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744' AND aplica_iva
UNION ALL SELECT 'materiales_empaque', id, codigo, nombre, costo_compra_promedio FROM materiales_empaque
 WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744' AND aplica_iva
UNION ALL SELECT 'consumibles', id, codigo, nombre, costo_compra_promedio FROM consumibles
 WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744' AND aplica_iva
UNION ALL SELECT 'productos_terminados', id, sku, nombre, costo_promedio FROM productos_terminados
 WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744' AND aplica_iva;
-- Sin políticas: solo accesible desde el SQL editor / service role
ALTER TABLE backup_costos_iva_20261002 ENABLE ROW LEVEL SECURITY;

-- Errores de carga, corregidos con la evidencia de sus compras
UPDATE consumibles SET costo_compra_promedio = 17.5690          -- recepción REC-000016: $20,38 ÷ 1,16
 WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744' AND nombre = 'Botas PVC' AND costo_compra_promedio = 2038;
UPDATE materiales_empaque SET costo_compra_promedio = 0.25       -- OC-000049 (precio sin IVA)
 WHERE empresa_id = 'bee65e82-665d-460b-b0b6-7006d3524744' AND codigo = '40017' AND costo_compra_promedio = 0.0267;

-- Todos los demás con IVA: ÷ 1,16. Se excluyen Agua Potable (ya era base) y los
-- dos corregidos arriba (se comparan contra el respaldo, no contra el valor nuevo).
UPDATE materias_primas t SET costo_compra_promedio = round(t.costo_compra_promedio / 1.16, 4)
  FROM backup_costos_iva_20261002 b
 WHERE b.tabla = 'materias_primas' AND b.id = t.id AND t.costo_compra_promedio = b.costo AND b.costo IS NOT NULL;
UPDATE materiales_empaque t SET costo_compra_promedio = round(t.costo_compra_promedio / 1.16, 4)
  FROM backup_costos_iva_20261002 b
 WHERE b.tabla = 'materiales_empaque' AND b.id = t.id AND t.costo_compra_promedio = b.costo AND b.costo IS NOT NULL
   AND t.codigo IS DISTINCT FROM '40017';
UPDATE consumibles t SET costo_compra_promedio = round(t.costo_compra_promedio / 1.16, 4)
  FROM backup_costos_iva_20261002 b
 WHERE b.tabla = 'consumibles' AND b.id = t.id AND t.costo_compra_promedio = b.costo AND b.costo IS NOT NULL
   AND t.nombre NOT IN ('Agua Potable', 'Botas PVC');
UPDATE productos_terminados t SET costo_promedio = round(t.costo_promedio / 1.16, 4)
  FROM backup_costos_iva_20261002 b
 WHERE b.tabla = 'productos_terminados' AND b.id = t.id AND t.costo_promedio = b.costo AND b.costo IS NOT NULL;
