-- Nro. de factura del proveedor asociada a un gasto (opcional, texto libre)
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS numero_factura text;
