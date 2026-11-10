-- Asistente de IA — subfase 1: base de consumo (docs/plan-asistente-ia.md)
-- Todo uso de IA queda registrado por empresa con su costo, con límite mensual.
-- Escriben solo las Edge Functions (service role); no hay políticas de INSERT/UPDATE.

-- ── Configuración por empresa ──
alter table public.empresas
    add column if not exists ia_activa boolean not null default false,
    add column if not exists ia_limite_mensual_usd numeric(10,2),
    add column if not exists ia_modelo text;
comment on column public.empresas.ia_activa is 'Interruptor general de IA para la empresa (asistente y demás funciones)';
comment on column public.empresas.ia_limite_mensual_usd is 'Tope de gasto de IA por mes calendario (hora de Caracas). NULL = sin uso permitido salvo superadmin';
comment on column public.empresas.ia_modelo is 'haiku | sonnet | opus. NULL = el de la función por defecto';

-- ── Consumo: una fila por llamada a un modelo ──
create table if not exists public.ia_conversaciones (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid not null references public.empresas(id),
    usuario_id uuid not null references public.usuarios(id),
    titulo text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists ia_conversaciones_usuario_idx on public.ia_conversaciones (usuario_id, updated_at desc);

create table if not exists public.ia_mensajes (
    id uuid primary key default gen_random_uuid(),
    conversacion_id uuid not null references public.ia_conversaciones(id) on delete cascade,
    rol text not null check (rol in ('usuario', 'asistente')),
    contenido text not null,
    herramientas jsonb,          -- qué consultó: [{ nombre, argumentos, filas, recortado, error }]
    modelo text,
    costo_usd numeric(12,6),
    created_at timestamptz not null default now()
);
create index if not exists ia_mensajes_conv_idx on public.ia_mensajes (conversacion_id, created_at);

create table if not exists public.ia_consumo (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid not null references public.empresas(id),
    usuario_id uuid references public.usuarios(id),
    funcion text not null,       -- 'asistente' | 'lectura_vin' | …
    proveedor text not null,     -- 'openrouter' | 'anthropic'
    modelo text not null,
    tokens_entrada integer not null default 0,
    tokens_salida integer not null default 0,
    tokens_cache_lectura integer not null default 0,
    costo_usd numeric(12,6) not null default 0,
    conversacion_id uuid references public.ia_conversaciones(id) on delete set null,
    created_at timestamptz not null default now()
);
create index if not exists ia_consumo_empresa_fecha_idx on public.ia_consumo (empresa_id, created_at);

-- ── RLS: lectura del propio usuario o del superadmin; escritura solo service role ──
alter table public.ia_conversaciones enable row level security;
alter table public.ia_mensajes enable row level security;
alter table public.ia_consumo enable row level security;

drop policy if exists ia_conversaciones_select on public.ia_conversaciones;
create policy ia_conversaciones_select on public.ia_conversaciones for select to authenticated
    using (usuario_id = auth.uid() or is_superadmin());
drop policy if exists ia_mensajes_select on public.ia_mensajes;
create policy ia_mensajes_select on public.ia_mensajes for select to authenticated
    using (exists (select 1 from public.ia_conversaciones c where c.id = conversacion_id
                   and (c.usuario_id = auth.uid() or is_superadmin())));
drop policy if exists ia_consumo_select on public.ia_consumo;
create policy ia_consumo_select on public.ia_consumo for select to authenticated
    using (is_superadmin());

grant select on public.ia_conversaciones, public.ia_mensajes, public.ia_consumo to authenticated;
grant select, insert, update, delete on public.ia_conversaciones, public.ia_mensajes, public.ia_consumo to service_role;

-- Gasto del mes en curso (hora de Caracas) de una empresa
create or replace function public.ia_gasto_mes(p_empresa uuid)
returns numeric language sql stable security invoker set search_path = public as $$
    select coalesce(sum(costo_usd), 0) from public.ia_consumo
    where empresa_id = p_empresa
      and created_at >= (date_trunc('month', now() at time zone 'America/Caracas') at time zone 'America/Caracas')
$$;
grant execute on function public.ia_gasto_mes(uuid) to authenticated, service_role;

-- ── Módulo del asistente (lo asigna el superadmin por usuario) ──
insert into public.modulos (id, nombre, descripcion, icono, orden, activo)
select 'asistente', 'Asistente IA', 'Preguntas sobre la operación respondidas con datos del sistema', 'sparkles',
       coalesce(max(orden), 0) + 1, true
from public.modulos
on conflict (id) do nothing;
