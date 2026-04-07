-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN: Tabla de Movimientos de Inventario
-- Ejecutar en SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════

-- 1. Crear tabla de movimientos
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha timestamptz DEFAULT now(),
  tipo_item text, -- 'producto_terminado', 'materia_prima', 'material_empaque'
  item_id uuid,
  item_nombre text,
  item_codigo text,
  tipo_movimiento text, -- 'entrada', 'salida', 'ajuste'
  cantidad numeric,
  stock_anterior numeric,
  stock_actual numeric,
  origen text, -- 'venta', 'compra', 'devolucion', 'produccion', 'ajuste_manual'
  referencia_id uuid,
  usuario_id uuid,
  notas text
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_mov_fecha ON movimientos_inventario(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_item ON movimientos_inventario(item_id);
CREATE INDEX IF NOT EXISTS idx_mov_tipo ON movimientos_inventario(tipo_item);

-- 2. Seed de datos mock (últimos 30 días)
-- Simula movimientos realistas para que puedas probar la UI inmediatamente
INSERT INTO movimientos_inventario (fecha, tipo_item, item_id, item_nombre, item_codigo, tipo_movimiento, cantidad, stock_anterior, stock_actual, origen, notas)
SELECT
  now() - (random() * interval '30 days') AS fecha,
  'producto_terminado' AS tipo_item,
  id AS item_id,
  nombre AS item_nombre,
  sku AS item_codigo,
  CASE WHEN random() > 0.5 THEN 'salida' ELSE 'entrada' END AS tipo_movimiento,
  floor(random() * 20 + 1)::numeric AS cantidad,
  floor(random() * 100)::numeric AS stock_anterior,
  floor(random() * 120)::numeric AS stock_actual,
  CASE WHEN random() > 0.5 THEN 'venta' ELSE 'compra' END AS origen,
  'Movimiento simulado para demo' AS notas
FROM productos_terminados
LIMIT 15;

INSERT INTO movimientos_inventario (fecha, tipo_item, item_id, item_nombre, item_codigo, tipo_movimiento, cantidad, stock_anterior, stock_actual, origen, notas)
SELECT
  now() - (random() * interval '30 days') AS fecha,
  'materia_prima' AS tipo_item,
  id AS item_id,
  nombre AS item_nombre,
  codigo AS item_codigo,
  CASE WHEN random() > 0.6 THEN 'salida' ELSE 'entrada' END AS tipo_movimiento,
  floor(random() * 50 + 5)::numeric AS cantidad,
  floor(random() * 200)::numeric AS stock_anterior,
  floor(random() * 250)::numeric AS stock_actual,
  CASE WHEN random() > 0.6 THEN 'produccion' ELSE 'compra' END AS origen,
  'Movimiento simulado para demo' AS notas
FROM materias_primas
LIMIT 15;

INSERT INTO movimientos_inventario (fecha, tipo_item, item_id, item_nombre, item_codigo, tipo_movimiento, cantidad, stock_anterior, stock_actual, origen, notas)
SELECT
  now() - (random() * interval '30 days') AS fecha,
  'material_empaque' AS tipo_item,
  id AS item_id,
  nombre AS item_nombre,
  codigo AS item_codigo,
  'entrada' AS tipo_movimiento,
  floor(random() * 100 + 10)::numeric AS cantidad,
  floor(random() * 500)::numeric AS stock_anterior,
  floor(random() * 600)::numeric AS stock_actual,
  'compra' AS origen,
  'Recepción de empaque simulada' AS notas
FROM materiales_empaque
LIMIT 10;
