-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN: Proveedor preferido en insumos y productos
-- Ejecutar en SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════

ALTER TABLE materias_primas ADD COLUMN IF NOT EXISTS proveedor_preferido_id uuid REFERENCES proveedores(id);
ALTER TABLE materiales_empaque ADD COLUMN IF NOT EXISTS proveedor_preferido_id uuid REFERENCES proveedores(id);
ALTER TABLE productos_terminados ADD COLUMN IF NOT EXISTS proveedor_preferido_id uuid REFERENCES proveedores(id);
