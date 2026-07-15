-- ═══════════════════════════════════════════════════════════════
-- Anulación de gastos: nuevo estado 'anulado' + columnas de auditoría
-- Ejecutar en Supabase → SQL Editor (proyecto opndtxvomtlpgwyyloqd)
-- Idempotente: se puede correr más de una vez sin error.
-- ═══════════════════════════════════════════════════════════════

-- 1. Ampliar el CHECK de gastos.estado para admitir 'parcial' y 'anulado'.
--    Se elimina dinámicamente cualquier check existente sobre la columna
--    'estado' (el nombre del constraint puede variar) y se recrea.
do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'gastos'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%estado%'
  loop
    execute format('alter table public.gastos drop constraint %I', c);
  end loop;
end $$;

alter table public.gastos
  add constraint gastos_estado_check
  check (estado in ('pagado', 'pendiente', 'parcial', 'anulado'));

-- 2. Columnas de auditoría de la anulación.
alter table public.gastos add column if not exists anulado_por uuid references public.usuarios(id);
alter table public.gastos add column if not exists fecha_anulacion timestamptz;
alter table public.gastos add column if not exists motivo_anulacion text;

-- Verificación (opcional):
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.gastos'::regclass and contype = 'c';
