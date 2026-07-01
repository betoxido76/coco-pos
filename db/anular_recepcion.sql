-- Anulación de recepciones de compra (aplicado en Supabase prod 2026-07-01).
--
-- Habilita "Anular recepción" en Compras → Recepciones. La anulación revierte
-- el stock (stock_actual + stock_ubicacion + movimiento 'salida') y solo se
-- permite dentro de una ventana segura: sin pago asociado y con el stock
-- recibido aún íntegro en el almacén. El filtro de rol y las validaciones
-- viven en el frontend (Compras.jsx → anularRecepcion).

-- 1. Almacén de entrada de la recepción.
--    Hoy se pierde: el almacén solo queda en movimientos_inventario, sin enlace
--    de vuelta a la compra. Sin esta columna no se sabe de dónde revertir.
alter table compras add column if not exists almacen_id uuid references almacenes(id);

-- 2. Bitácora de anulación (quién, cuándo, por qué).
alter table compras add column if not exists motivo_anulacion text;
alter table compras add column if not exists anulada_por uuid references usuarios(id);
alter table compras add column if not exists fecha_anulacion timestamptz;

-- 3. Permitir estado 'anulada' en compras.estado.
--    Si existe un CHECK que restringe los valores, hay que recrearlo incluyendo
--    'anulada'. Verificar primero el constraint actual:
--      select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'compras'::regclass and contype = 'c';
--    Si aparece uno sobre `estado` sin 'anulada', dropearlo y recrearlo, p.ej.:
--      alter table compras drop constraint <nombre_constraint>;
--      alter table compras add constraint chk_compras_estado
--        check (estado in ('recibida','anulada'));
--    (compras.estado hoy solo usa 'recibida'.)
