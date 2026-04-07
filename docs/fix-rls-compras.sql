-- ═══════════════════════════════════════════════════════════
-- FIX: Políticas RLS para módulo de Compras y Órdenes
-- Ejecutar en el SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════

-- 1. Asegurar que RLS está habilitado
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_compra_items ENABLE ROW LEVEL SECURITY;

-- 2. Políticas para tabla compras
DROP POLICY IF EXISTS "Usuarios autenticados gestionan compras" ON compras;
CREATE POLICY "Usuarios autenticados gestionan compras" ON compras
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 3. Políticas para tabla compra_items
DROP POLICY IF EXISTS "Usuarios autenticados gestionan items de compra" ON compra_items;
CREATE POLICY "Usuarios autenticados gestionan items de compra" ON compra_items
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 4. Políticas para tabla ordenes_compra
DROP POLICY IF EXISTS "Usuarios autenticados gestionan ordenes" ON ordenes_compra;
CREATE POLICY "Usuarios autenticados gestionan ordenes" ON ordenes_compra
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 5. Políticas para tabla orden_compra_items
DROP POLICY IF EXISTS "Usuarios autenticados gestionan items de orden" ON orden_compra_items;
CREATE POLICY "Usuarios autenticados gestionan items de orden" ON orden_compra_items
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
