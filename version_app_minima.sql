-- Candado contra versiones viejas de la app (2026-10-20)
--
-- Una pestaña o PWA que no se recarga sigue con el código viejo: PED-001426 se
-- tomó desde una PC con la versión anterior al IVA en base (02/10) y el helado
-- quedó a $3,38 + IVA en vez de $3,92 + IVA. El front ahora se actualiza solo
-- (AvisoNuevaVersion), pero una pestaña anterior a ese cambio no se entera.
--
-- Cada llamada del front lleva el encabezado x-app-version (fecha UTC del build,
-- AAAAMMDDHHmm; src/lib/supabaseClient.js). Este trigger rechaza escrituras
-- desde el navegador cuya versión sea menor que app_version_minima, o que no
-- traigan versión.
--
-- ORDEN: 1) correr este script (la mínima queda vacía = candado apagado),
-- 2) publicar la app y comprobar que los pedidos nuevos traen app_version,
-- 3) fijar la mínima:
--      update sistema_parametros set valor = '<versión>', actualizado_at = now()
--       where clave = 'app_version_minima';
-- Para apagarlo: valor = null.
--
-- Solo se controla al rol del navegador (authenticated/anon). SQL Editor,
-- service_role (Edge Functions) y las RPC SECURITY DEFINER no se ven afectados.

create table if not exists public.sistema_parametros (
    clave          text primary key,
    valor          text,
    actualizado_at timestamptz not null default now()
);
alter table public.sistema_parametros enable row level security;
drop policy if exists sistema_parametros_lectura on public.sistema_parametros;
create policy sistema_parametros_lectura on public.sistema_parametros
    for select to authenticated using (true);
insert into public.sistema_parametros (clave, valor) values ('app_version_minima', null)
    on conflict (clave) do nothing;

-- Versión que envió el navegador en esta petición (NULL fuera de PostgREST)
create or replace function public.version_app_cliente() returns text
language sql stable as $$
    select nullif(current_setting('request.headers', true), '')::json ->> 'x-app-version'
$$;

-- SECURITY DEFINER solo para leer el parámetro sin depender de RLS
create or replace function public.app_version_minima() returns text
language sql stable security definer set search_path = public as $$
    select valor from public.sistema_parametros where clave = 'app_version_minima'
$$;

-- SECURITY INVOKER a propósito: current_user debe ser el rol de quien escribe
create or replace function public._exigir_version_app() returns trigger
language plpgsql as $$
declare
    v_min text;
    v_app text;
begin
    if current_user not in ('authenticated', 'anon') then return null; end if;
    v_min := public.app_version_minima();
    if v_min is null or v_min = '' then return null; end if;
    v_app := public.version_app_cliente();
    if v_app is null or v_app < v_min then
        raise exception 'MiPOS está desactualizado (versión %). Recarga la página con Ctrl+Shift+R o cierra y vuelve a abrir la app.',
            coalesce(v_app, 'anterior al 20/10/2026')
            using errcode = 'P0001', hint = 'Versión mínima: ' || v_min;
    end if;
    return null;
end $$;

-- Tablas de dinero, stock y documentos: toda escritura desde el navegador
do $$
declare t text;
begin
    foreach t in array array[
        'pedidos', 'pedido_items', 'ventas', 'venta_items', 'cobros',
        'devoluciones', 'devolucion_items', 'solicitudes_devolucion', 'solicitud_devolucion_items',
        'compras', 'compra_items', 'ordenes_compra', 'orden_compra_items',
        'pagos_proveedor', 'pagos', 'gastos', 'devoluciones_proveedor', 'devolucion_proveedor_items',
        'movimientos_inventario', 'stock_ubicacion', 'ordenes_produccion', 'lote_consumos', 'lotes_produccion',
        'mermas', 'cambios_mano_mano', 'stock_reproceso', 'requisiciones', 'requisicion_items',
        'movimientos_financieros', 'productos_terminados', 'materias_primas', 'materiales_empaque',
        'consumibles', 'producto_precios', 'tasas_cambio', 'configuracion'
    ] loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('drop trigger if exists exigir_version_app on public.%I', t);
        execute format('create trigger exigir_version_app before insert or update or delete on public.%I
                        for each statement execute function public._exigir_version_app()', t);
    end loop;
end $$;

-- Diagnóstico: con qué versión se creó cada pedido y cada nota
alter table public.pedidos add column if not exists app_version text;
alter table public.ventas  add column if not exists app_version text;

create or replace function public._sellar_version_app() returns trigger
language plpgsql as $$
begin
    new.app_version := coalesce(new.app_version, public.version_app_cliente());
    return new;
end $$;

drop trigger if exists sellar_version_app on public.pedidos;
create trigger sellar_version_app before insert on public.pedidos
    for each row execute function public._sellar_version_app();
drop trigger if exists sellar_version_app on public.ventas;
create trigger sellar_version_app before insert on public.ventas
    for each row execute function public._sellar_version_app();
