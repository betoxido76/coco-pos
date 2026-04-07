-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN: Órdenes de Compra y vinculación con Recepciones
-- Ejecutar en SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════

-- 1. Tabla de Órdenes de Compra
CREATE TABLE IF NOT EXISTS ordenes_compra (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id uuid REFERENCES proveedores(id),
  usuario_id uuid REFERENCES auth.users(id),
  numero_oc text UNIQUE,
  subtotal numeric DEFAULT 0,
  total numeric DEFAULT 0,
  estado text DEFAULT 'pendiente', -- pendiente, aprobada, recibida_parcial, recibida_total, cancelada
  fecha_emision timestamptz DEFAULT now(),
  fecha_entrega_esperada date,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- 2. Detalle de Ítems de la OC
CREATE TABLE IF NOT EXISTS orden_compra_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id uuid REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  tipo_insumo text, -- 'materias_primas', 'materiales_empaque', 'productos_terminados'
  insumo_id uuid,
  cantidad_solicitada numeric,
  cantidad_recibida numeric DEFAULT 0,
  precio_unitario_esperado numeric,
  created_at timestamptz DEFAULT now()
);

-- 3. Vincular recepción con OC (opcional)
ALTER TABLE compras 
ADD COLUMN IF NOT EXISTS orden_compra_id uuid REFERENCES ordenes_compra(id);

-- 4. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_oc_proveedor ON ordenes_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_oc_estado ON ordenes_compra(estado);
CREATE INDEX IF NOT EXISTS idx_oci_orden ON orden_compra_items(orden_id);
CREATE INDEX IF NOT EXISTS idx_compras_oc ON compras(orden_compra_id);
