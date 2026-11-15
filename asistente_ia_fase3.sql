-- Asistente de IA — paquete 2 de consultas + límite por usuario (docs/plan-asistente-ia.md)
-- Mismas reglas que asistente_ia_fase2.sql: SECURITY INVOKER, empresa explícita validada,
-- jsonb agregado y acotado (máx. 200 filas, "recortado"), solo lectura. Montos en USD.

-- ════════════════════════════════════════════════════════════════════════════
-- Límite por usuario: preguntas por día (por empresa) + ritmo fijo en la función
-- ════════════════════════════════════════════════════════════════════════════
alter table public.empresas add column if not exists ia_preguntas_dia_usuario integer not null default 40
    check (ia_preguntas_dia_usuario >= 0);
comment on column public.empresas.ia_preguntas_dia_usuario is
    'Asistente IA: preguntas por usuario y día (hora de Caracas). El superadmin no tiene límite.';

-- Preguntas del usuario desde un instante (las cuenta la Edge Function con service role)
create or replace function public.ia_preguntas_usuario(p_usuario uuid, p_desde timestamptz)
returns integer language sql stable security invoker set search_path = public as $$
    select count(*)::integer from ia_mensajes m join ia_conversaciones c on c.id = m.conversacion_id
    where c.usuario_id = p_usuario and m.rol = 'usuario' and m.created_at >= p_desde
$$;
revoke all on function public.ia_preguntas_usuario(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ia_preguntas_usuario(uuid, timestamptz) to service_role;

create index if not exists ia_mensajes_conv_fecha_idx on public.ia_mensajes (conversacion_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- buscar: + categorías de cliente y de producto; productos con precios por lista
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistente_buscar(p_empresa uuid, p_tipo text, p_texto text)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare r jsonb; v_hoy date := _asistente_hoy();
begin
    perform _asistente_empresa(p_empresa);
    if coalesce(trim(p_texto), '') = '' then raise exception 'Falta el texto a buscar'; end if;
    if p_tipo = 'cliente' then
        select coalesce(jsonb_agg(x), '[]') into r from (
            select id, nombre, rif, codigo, activo from clientes
            where empresa_id = p_empresa and (_asistente_coincide(nombre, p_texto)
                  or rif ilike '%' || trim(p_texto) || '%' or codigo ilike trim(p_texto))
            order by activo desc, nombre limit 15) x;
    elsif p_tipo = 'producto' then
        select coalesce(jsonb_agg(x), '[]') into r from (
            select p.id, p.nombre, p.sku, p.categoria_1, p.categoria_2, p.unidad_medida, p.aplica_iva, p.activo,
                   (select coalesce(jsonb_agg(jsonb_build_object('lista', l.nombre, 'precio_sin_iva', pp.precio) order by l.es_default desc, l.nombre), '[]')
                    from producto_precios pp join listas_precio l on l.id = pp.lista_id
                    where pp.producto_id = p.id and pp.empresa_id = p_empresa and l.activo is not false
                      and (pp.aplica_desde is null or pp.aplica_desde <= v_hoy)
                      and (pp.aplica_hasta is null or pp.aplica_hasta >= v_hoy)) as precios
            from productos_terminados p
            where p.empresa_id = p_empresa and (_asistente_coincide(p.nombre, p_texto) or p.sku ilike '%' || trim(p_texto) || '%')
            order by p.activo desc, p.nombre limit 15) x;
    elsif p_tipo = 'proveedor' then
        select coalesce(jsonb_agg(x), '[]') into r from (
            select id, nombre, rif, codigo, activo from proveedores
            where empresa_id = p_empresa and (_asistente_coincide(nombre, p_texto) or rif ilike '%' || trim(p_texto) || '%')
            order by activo desc, nombre limit 15) x;
    elsif p_tipo = 'vendedor' then
        select coalesce(jsonb_agg(x), '[]') into r from (
            select id, nombre, rol from usuarios
            where empresa_id = p_empresa and _asistente_coincide(nombre, p_texto)
            order by nombre limit 15) x;
    elsif p_tipo = 'categoria_cliente' then
        select coalesce(jsonb_agg(x), '[]') into r from (
            select nombre, nivel from categorias_clientes
            where empresa_id = p_empresa and activo is not false and (trim(p_texto) = '*' or _asistente_coincide(nombre, p_texto))
            order by nivel, nombre limit 40) x;
    elsif p_tipo = 'categoria_producto' then
        select coalesce(jsonb_agg(x), '[]') into r from (
            select distinct cat as nombre, nivel from productos_terminados p
            cross join lateral (values (1, p.categoria_1), (2, p.categoria_2), (3, p.categoria_3), (4, p.categoria_4)) v(nivel, cat)
            where p.empresa_id = p_empresa and coalesce(cat, '') <> '' and (trim(p_texto) = '*' or _asistente_coincide(cat, p_texto))
            order by nivel, nombre limit 40) x;
    else
        raise exception 'Tipo no válido: cliente, producto, proveedor, vendedor, categoria_cliente o categoria_producto';
    end if;
    return jsonb_build_object('tipo', p_tipo, 'texto', p_texto, 'resultados', r,
        'nota', case when p_tipo = 'producto' then 'precios = listas vigentes hoy, sin IVA (aplica_iva dice si se le suma 16 %).'
                     when p_tipo like 'categoria%' then 'nivel 1 = canal. Texto "*" lista todas.' end);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ventas_resumen: + filtro por categoría de cliente (cualquier nivel) y de producto, + detalle de notas
-- ════════════════════════════════════════════════════════════════════════════
drop function if exists public.asistente_ventas_resumen(uuid, date, date, text, uuid, uuid, uuid, text, integer);
create or replace function public.asistente_ventas_resumen(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_agrupar text default 'ninguno',
    p_cliente_id uuid default null, p_producto_id uuid default null, p_vendedor_id uuid default null,
    p_canal text default null, p_categoria_cliente text default null, p_categoria_producto text default null,
    p_detalle boolean default false, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    v_lineas boolean := p_producto_id is not null or p_categoria_producto is not null
                        or p_agrupar in ('producto', 'categoria_producto');
    v_tiempo boolean := p_agrupar in ('dia', 'semana', 'mes');
    tot jsonb; grupos jsonb; docs jsonb; n_grupos integer; n_docs integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'dia', 'semana', 'mes', 'cliente', 'vendedor', 'canal', 'ciudad', 'producto', 'categoria_producto') then
        raise exception 'agrupar no válido';
    end if;

    drop table if exists _av; create temp table _av on commit drop as
    select case p_agrupar
               when 'dia' then to_char(v.fecha, 'YYYY-MM-DD')
               when 'semana' then 'semana del ' || to_char(date_trunc('week', v.fecha), 'YYYY-MM-DD')
               when 'mes' then to_char(v.fecha, 'YYYY-MM')
               when 'cliente' then v.cliente
               when 'vendedor' then coalesce(v.vendedor, '(sin vendedor)')
               when 'canal' then coalesce(v.canal, '(sin canal)')
               when 'ciudad' then coalesce(v.direccion_ciudad, '(sin ciudad)')
               when 'producto' then l.producto
               when 'categoria_producto' then coalesce(l.producto_cat1, '(sin categoría)')
           end as grupo,
           v.venta_id, v.numero_factura, v.fecha, v.cliente, v.vendedor, v.estado_cobro,
           case when v_lineas then l.base_linea else v.base_gravada + v.base_exenta end as base,
           case when v_lineas then l.total_linea else v.total end as total,
           case when v_lineas then l.unidades_primarias else v.unidades_primarias end as unidades
    from v_export_ventas v
    left join v_export_ventas_lineas l on v_lineas and l.venta_id = v.venta_id
    where v.empresa_id = p_empresa and not v.anulada
      and v.fecha between v_desde and v_hasta
      and (p_cliente_id is null or v.cliente_id = p_cliente_id)
      and (p_vendedor_id is null or v.vendedor_id = p_vendedor_id)
      and (p_canal is null or _asistente_norm(v.canal) = _asistente_norm(p_canal))
      and (p_categoria_cliente is null or _asistente_norm(p_categoria_cliente) in
           (_asistente_norm(v.canal), _asistente_norm(v.cliente_cat2), _asistente_norm(v.cliente_cat3), _asistente_norm(v.cliente_cat4)))
      and (p_producto_id is null or l.producto_id = p_producto_id)
      and (p_categoria_producto is null or _asistente_norm(p_categoria_producto) in
           (_asistente_norm(l.producto_cat1), _asistente_norm(l.producto_cat2), _asistente_norm(l.producto_cat3), _asistente_norm(l.producto_cat4)));

    select jsonb_build_object('notas', count(distinct venta_id), 'base_imponible', round(coalesce(sum(base), 0), 2),
                              'total_con_iva', round(coalesce(sum(total), 0), 2), 'unidades', round(coalesce(sum(unidades), 0), 2))
      into tot from _av;

    select count(distinct grupo) into n_grupos from _av where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g order by case when v_tiempo then g->>'grupo' end, (g->>'base_imponible')::numeric desc), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'notas', count(distinct venta_id), 'base_imponible', round(sum(base), 2),
                                  'total_con_iva', round(sum(total), 2), 'unidades', round(sum(unidades), 2)) g
        from _av where p_agrupar <> 'ninguno' group by grupo
        order by case when v_tiempo then grupo end, sum(base) desc limit v_lim) x;

    if p_detalle then
        select count(distinct venta_id) into n_docs from _av;
        select coalesce(jsonb_agg(d order by d->>'fecha', d->>'nota'), '[]') into docs from (
            select jsonb_build_object('nota', numero_factura, 'fecha', fecha, 'cliente', cliente, 'vendedor', vendedor,
                'estado_cobro', estado_cobro, 'base_imponible', round(sum(base), 2), 'total_con_iva', round(sum(total), 2)) d
            from _av group by venta_id, numero_factura, fecha, cliente, vendedor, estado_cobro
            order by fecha, numero_factura limit v_lim) x;
    end if;

    return jsonb_build_object(
        'fuente', 'Ventas (notas de entrega emitidas, sin anuladas)', 'desde', v_desde, 'hasta', v_hasta,
        'nivel', case when v_lineas then 'líneas de producto' else 'notas' end,
        'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos,
        'grupos_totales', n_grupos, 'documentos', docs, 'documentos_totales', n_docs,
        'recortado', coalesce(n_grupos, 0) > v_lim or coalesce(n_docs, 0) > v_lim,
        'nota', 'Montos en USD. base_imponible = sin IVA. Unidades en la unidad primaria del producto. '
             || 'Con filtro de producto o categoría de producto, los montos de cada nota son solo de esas líneas. '
             || 'No descuenta notas de crédito (ver notas_credito).');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- notas_credito: NC emitidas + diferencial cambiario, y su % sobre las ventas
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistente_notas_credito(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_agrupar text default 'ninguno',
    p_cliente_id uuid default null, p_canal text default null, p_detalle boolean default false, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    v_por_venta boolean := p_agrupar in ('cliente', 'canal', 'mes');   -- grupos donde el % se mide contra las ventas del mismo grupo
    v_ventas numeric; v_dif numeric; v_n_dif integer;
    tot jsonb; grupos jsonb; docs jsonb; n_grupos integer; n_docs integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'cliente', 'canal', 'motivo', 'tipo', 'mes') then raise exception 'agrupar no válido'; end if;

    drop table if exists _anc; create temp table _anc on commit drop as
    select d.id, d.numero_nc, d.fecha_emision as fecha, d.cliente_id, c.nombre as cliente, k.nombre as canal,
           v.numero_factura as nota_origen,
           coalesce(m.nombre, case when d.origen = 'devolucion' then 'Devolución de mercancía' end, '(sin motivo)') as motivo,
           case when d.origen = 'devolucion' then 'devolución de mercancía' else 'nota de crédito manual' end
             || case when d.genera_credito then ' · con crédito' else ' · sin crédito (reposición)' end as tipo,
           d.genera_credito, d.afecta_inventario,
           coalesce(d.base_gravada + d.base_exenta, d.subtotal, d.monto_devuelto) as base,
           d.monto_devuelto as total
    from devoluciones d
    left join clientes c on c.id = d.cliente_id
    left join categorias_clientes k on k.id = c.cat1_id
    left join motivos_nc m on m.id = d.motivo_tipo_id
    left join ventas v on v.id = d.venta_id
    where d.empresa_id = p_empresa and d.estado_nc <> 'anulada'
      and d.fecha_emision between v_desde and v_hasta
      and (p_cliente_id is null or d.cliente_id = p_cliente_id)
      and (p_canal is null or _asistente_norm(k.nombre) = _asistente_norm(p_canal));
    alter table _anc add column grupo text;
    update _anc set grupo = case p_agrupar when 'cliente' then coalesce(cliente, '(sin cliente)')
        when 'canal' then coalesce(canal, '(sin canal)') when 'motivo' then motivo when 'tipo' then tipo
        when 'mes' then to_char(fecha, 'YYYY-MM') end;

    -- Ventas del mismo período y filtros (base sin IVA), para el %
    drop table if exists _anv; create temp table _anv on commit drop as
    select case p_agrupar when 'cliente' then cliente when 'canal' then coalesce(canal, '(sin canal)')
                          when 'mes' then to_char(fecha, 'YYYY-MM') end as grupo,
           base_gravada + base_exenta as base
    from v_export_ventas
    where empresa_id = p_empresa and not anulada and fecha between v_desde and v_hasta
      and (p_cliente_id is null or cliente_id = p_cliente_id)
      and (p_canal is null or _asistente_norm(canal) = _asistente_norm(p_canal));
    select coalesce(sum(base), 0) into v_ventas from _anv;

    select coalesce(sum(dc.monto_usd), 0), count(*) into v_dif, v_n_dif
    from diferenciales_cambiarios dc
    left join clientes c on c.id = dc.cliente_id
    left join categorias_clientes k on k.id = c.cat1_id
    where dc.empresa_id = p_empresa and dc.estado = 'vigente' and dc.fecha between v_desde and v_hasta
      and (p_cliente_id is null or dc.cliente_id = p_cliente_id)
      and (p_canal is null or _asistente_norm(k.nombre) = _asistente_norm(p_canal));

    select jsonb_build_object('notas_credito', count(*), 'base_sin_iva', round(coalesce(sum(base), 0), 2),
        'total_con_iva', round(coalesce(sum(total), 0), 2),
        'con_credito_base', round(coalesce(sum(base) filter (where genera_credito), 0), 2),
        'sin_credito_base', round(coalesce(sum(base) filter (where not genera_credito), 0), 2),
        'ventas_base_sin_iva', round(v_ventas, 2),
        'pct_nc_sobre_ventas', case when v_ventas > 0 then round(coalesce(sum(base), 0) / v_ventas * 100, 2) end,
        'diferencial_cambiario_usd', round(v_dif, 2), 'diferenciales', v_n_dif)
      into tot from _anc;

    select count(distinct grupo) into n_grupos from _anc where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', n.grupo, 'notas_credito', count(*), 'base_sin_iva', round(sum(n.base), 2),
            'total_con_iva', round(sum(n.total), 2),
            'sin_credito_base', round(coalesce(sum(n.base) filter (where not n.genera_credito), 0), 2),
            'ventas_base_sin_iva', case when v_por_venta then round(max(vg.base), 2) end,
            'pct_sobre_ventas', case when v_por_venta and max(vg.base) > 0 then round(sum(n.base) / max(vg.base) * 100, 2)
                                     when not v_por_venta and v_ventas > 0 then round(sum(n.base) / v_ventas * 100, 2) end) g
        from _anc n
        left join (select grupo, sum(base) base from _anv group by grupo) vg on v_por_venta and vg.grupo = n.grupo
        where p_agrupar <> 'ninguno' group by n.grupo
        order by case when p_agrupar = 'mes' then n.grupo end, sum(n.base) desc limit v_lim) x;

    if p_detalle then
        select count(*) into n_docs from _anc;
        select coalesce(jsonb_agg(d), '[]') into docs from (
            select jsonb_build_object('nc', numero_nc, 'fecha', fecha, 'cliente', cliente, 'nota_origen', nota_origen,
                'motivo', motivo, 'tipo', tipo, 'base_sin_iva', round(base, 2), 'total_con_iva', round(total, 2)) d
            from _anc order by fecha, numero_nc limit v_lim) x;
    end if;

    return jsonb_build_object(
        'fuente', 'Notas de crédito a clientes (sin anuladas), por fecha de emisión', 'desde', v_desde, 'hasta', v_hasta,
        'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos, 'grupos_totales', n_grupos,
        'documentos', docs, 'documentos_totales', n_docs,
        'recortado', coalesce(n_grupos, 0) > v_lim or coalesce(n_docs, 0) > v_lim,
        'nota', 'Montos en USD. El % compara bases sin IVA: NC del período ÷ ventas del período con los mismos filtros '
             || '(agrupando por cliente, canal o mes, contra las ventas de ese grupo; por motivo o tipo, contra el total). '
             || '"sin crédito" = reposición de mercancía o acuerdo que no rebaja la deuda del cliente. '
             || 'El diferencial cambiario (saldo llevado a pérdida porque el cliente pagó Bs. sin indexar) va aparte y no entra en el %.');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- clientes: ficha, crédito disponible, última compra / inactivos, días de pago
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistente_clientes(
    p_empresa uuid, p_cliente_id uuid default null, p_canal text default null, p_vendedor_id uuid default null,
    p_inactivos_dias integer default null, p_orden text default 'saldo', p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    v_hoy date := _asistente_hoy();
    r jsonb; n integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_orden not in ('saldo', 'nombre', 'dias_sin_comprar', 'ventas_90d', 'dias_pago', 'credito_disponible') then
        raise exception 'orden no válido';
    end if;

    drop table if exists _acl; create temp table _acl on commit drop as
    with ven as (
        select cliente_id, max(fecha) as ultima_compra,
               sum(base_gravada + base_exenta) filter (where fecha > v_hoy - 90) as ventas_90d,
               (array_agg(vendedor order by fecha desc) filter (where vendedor is not null))[1] as vendedor,
               (array_agg(vendedor_id order by fecha desc) filter (where vendedor_id is not null))[1] as vendedor_id
        from v_export_ventas where empresa_id = p_empresa and not anulada group by cliente_id),
    cxc as (
        select cliente_id, sum(saldo) as saldo, sum(saldo) filter (where dias_vencida > 0) as vencido, max(dias_vencida) as max_dias_vencida
        from v_export_cartera_cxc where empresa_id = p_empresa and saldo > 0.005 group by cliente_id),
    dp as (
        select cliente_id, count(*) as notas_pagadas,
               sum(dias_pago * monto_dinero) / nullif(sum(monto_dinero), 0) as dias_pago,
               sum((dias_pago - plazo_dias) * monto_dinero) / nullif(sum(monto_dinero), 0) as atraso
        from v_cxc_dias_pago where empresa_id = p_empresa and monto_dinero > 0
          and (created_at at time zone 'America/Caracas')::date > (v_hoy - interval '12 months')::date
        group by cliente_id)
    select c.id, c.nombre, c.codigo, c.rif, k1.nombre as canal, k2.nombre as categoria_2, c.activo,
           c.condicion_pago, c.dias_credito, c.limite_credito, lp.nombre as lista_precio,
           c.paga_indexado, c.contribuyente_especial, c.contacto_comercial, c.telefono_comercial,
           ven.vendedor, ven.vendedor_id, ven.ultima_compra, v_hoy - ven.ultima_compra as dias_sin_comprar,
           coalesce(ven.ventas_90d, 0) as ventas_90d,
           coalesce(cxc.saldo, 0) as saldo, coalesce(cxc.vencido, 0) as vencido, cxc.max_dias_vencida,
           case when c.limite_credito > 0 then c.limite_credito - coalesce(cxc.saldo, 0) end as credito_disponible,
           dp.dias_pago, dp.atraso, dp.notas_pagadas
    from clientes c
    left join categorias_clientes k1 on k1.id = c.cat1_id
    left join categorias_clientes k2 on k2.id = c.cat2_id
    left join listas_precio lp on lp.id = c.lista_precio_id
    left join ven on ven.cliente_id = c.id
    left join cxc on cxc.cliente_id = c.id
    left join dp on dp.cliente_id = c.id
    where c.empresa_id = p_empresa
      and (p_cliente_id is not null or c.activo is not false)
      and (p_cliente_id is null or c.id = p_cliente_id)
      and (p_canal is null or _asistente_norm(p_canal) in (_asistente_norm(k1.nombre), _asistente_norm(k2.nombre)))
      and (p_vendedor_id is null or ven.vendedor_id = p_vendedor_id)
      and (p_inactivos_dias is null or (ven.ultima_compra is not null and v_hoy - ven.ultima_compra >= p_inactivos_dias));

    select count(*) into n from _acl;
    select coalesce(jsonb_agg(x), '[]') into r from (
        select jsonb_strip_nulls(jsonb_build_object('cliente', nombre, 'codigo', codigo, 'rif', rif, 'canal', canal,
            'categoria_2', categoria_2, 'activo', activo, 'condicion_pago', condicion_pago, 'dias_credito', dias_credito,
            'limite_credito', limite_credito, 'saldo_cxc', round(saldo, 2), 'vencido', round(vencido, 2),
            'max_dias_vencida', max_dias_vencida, 'credito_disponible', round(credito_disponible, 2),
            'lista_precio', lista_precio, 'paga_indexado', paga_indexado, 'contribuyente_especial', contribuyente_especial,
            'contacto', contacto_comercial, 'telefono', telefono_comercial, 'vendedor_ultima_venta', vendedor,
            'ultima_compra', ultima_compra, 'dias_sin_comprar', dias_sin_comprar, 'ventas_90d_sin_iva', round(ventas_90d, 2),
            'dias_pago_12m', round(dias_pago, 1), 'atraso_vs_plazo_12m', round(atraso, 1), 'notas_pagadas_12m', notas_pagadas)) x
        from _acl
        order by case p_orden when 'saldo' then -saldo when 'ventas_90d' then -ventas_90d
                              when 'dias_sin_comprar' then -dias_sin_comprar when 'dias_pago' then -dias_pago
                              when 'credito_disponible' then credito_disponible end nulls last, nombre
        limit v_lim) y;

    return jsonb_build_object('fuente', 'Clientes (ficha, CxC y ventas)', 'al', v_hoy, 'clientes', r,
        'clientes_totales', n, 'recortado', n > v_lim,
        'nota', 'Montos en USD. credito_disponible = límite − saldo de CxC (solo si tiene límite). '
             || 'Inactivos = clientes que compraron alguna vez y no compran hace N días (los que nunca compraron no aparecen). '
             || 'dias_pago_12m = días desde la emisión hasta cada pago en dinero, ponderado por monto, notas pagadas de los últimos 12 meses.');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- dias_pago: cuánto tardan en pagar (mismo cálculo que el tag de CxC)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistente_dias_pago(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_agrupar text default 'ninguno',
    p_cliente_id uuid default null, p_vendedor_id uuid default null, p_canal text default null, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_desde date := coalesce(p_desde, (_asistente_hoy() - interval '12 months')::date + 1);
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    tot jsonb; grupos jsonb; n_grupos integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'cliente', 'canal', 'vendedor', 'mes') then raise exception 'agrupar no válido'; end if;

    drop table if exists _adp; create temp table _adp on commit drop as
    select case p_agrupar when 'cliente' then d.cliente_nombre when 'canal' then coalesce(k.nombre, '(sin canal)')
                          when 'vendedor' then coalesce(u.nombre, '(sin vendedor)')
                          when 'mes' then to_char((d.created_at at time zone 'America/Caracas')::date, 'YYYY-MM') end as grupo,
           d.monto_dinero as monto, d.dias_pago as dias, d.plazo_dias as plazo
    from v_cxc_dias_pago d
    left join categorias_clientes k on k.id = d.cat1_id
    left join usuarios u on u.id = d.vendedor_id
    where d.empresa_id = p_empresa and d.monto_dinero > 0
      and (d.created_at at time zone 'America/Caracas')::date between v_desde and v_hasta
      and (p_cliente_id is null or d.cliente_id = p_cliente_id)
      and (p_vendedor_id is null or d.vendedor_id = p_vendedor_id)
      and (p_canal is null or _asistente_norm(k.nombre) = _asistente_norm(p_canal));

    select jsonb_build_object('notas_pagadas', count(*), 'monto_cobrado', round(coalesce(sum(monto), 0), 2),
        'dias_pago_ponderado', round(sum(dias * monto) / nullif(sum(monto), 0), 1), 'dias_pago_simple', round(avg(dias), 1),
        'plazo_ponderado', round(sum(plazo * monto) / nullif(sum(monto), 0), 1),
        'atraso_ponderado', round(sum((dias - plazo) * monto) / nullif(sum(monto), 0), 1),
        'atraso_simple', round(avg(dias - plazo), 1)) into tot from _adp;

    select count(distinct grupo) into n_grupos from _adp where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'notas_pagadas', count(*), 'monto_cobrado', round(sum(monto), 2),
            'dias_pago_ponderado', round(sum(dias * monto) / nullif(sum(monto), 0), 1), 'dias_pago_simple', round(avg(dias), 1),
            'plazo_ponderado', round(sum(plazo * monto) / nullif(sum(monto), 0), 1),
            'atraso_ponderado', round(sum((dias - plazo) * monto) / nullif(sum(monto), 0), 1)) g
        from _adp where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar = 'mes' then grupo end, sum(monto) desc limit v_lim) x;

    return jsonb_build_object('fuente', 'Días promedio de pago (notas ya pagadas), por fecha de emisión de la nota',
        'desde', v_desde, 'hasta', v_hasta, 'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos,
        'grupos_totales', n_grupos, 'recortado', coalesce(n_grupos, 0) > v_lim,
        'nota', 'Mismo cálculo que el tag de CxC: solo pagos en dinero (sin retenciones, NC ni diferencial), cada pago '
             || 'ponderado por su monto; el ponderado pesa más las notas grandes, el simple trata igual a todas. '
             || 'Plazo = vencimiento − emisión (contado = 0). Atraso = días de pago − plazo. Sin fechas: últimos 12 meses. '
             || 'Lo que aún se debe se mide con los días calle de cartera_cxc.');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- compras_resumen: recepciones por proveedor, insumo y período, con precio promedio
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistente_compras_resumen(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_agrupar text default 'proveedor',
    p_proveedor_id uuid default null, p_insumo text default null, p_tipo_insumo text default null,
    p_detalle boolean default false, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    v_lineas boolean := p_insumo is not null or p_tipo_insumo is not null or p_agrupar in ('insumo', 'tipo_insumo');
    tot jsonb; grupos jsonb; docs jsonb; n_grupos integer; n_docs integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'proveedor', 'insumo', 'tipo_insumo', 'mes') then raise exception 'agrupar no válido'; end if;

    drop table if exists _acp; create temp table _acp on commit drop as
    select case p_agrupar when 'proveedor' then coalesce(c.proveedor, '(sin proveedor)')
                          when 'insumo' then l.insumo || coalesce(' (' || l.unidad || ')', '')
                          when 'tipo_insumo' then l.tipo_insumo when 'mes' then to_char(c.fecha, 'YYYY-MM') end as grupo,
           c.compra_id, c.numero_doc, c.nro_doc_proveedor, c.fecha, c.proveedor, c.estado_factura, c.saldo,
           l.insumo, l.unidad, l.cantidad,
           case when v_lineas then l.base_linea else c.base_gravada + c.base_exenta end as base,
           case when v_lineas then l.total_linea else c.total end as total
    from v_export_compras c
    left join v_export_compras_lineas l on v_lineas and l.compra_id = c.compra_id
    where c.empresa_id = p_empresa and not c.anulada and c.fecha between v_desde and v_hasta
      and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
      and (p_insumo is null or _asistente_coincide(l.insumo, p_insumo) or l.insumo_codigo ilike trim(p_insumo))
      and (p_tipo_insumo is null or l.tipo_insumo = p_tipo_insumo
           or (p_tipo_insumo = 'material_empaque' and l.tipo_insumo = 'empaque'));

    select jsonb_build_object('recepciones', count(distinct compra_id), 'base_sin_iva', round(coalesce(sum(base), 0), 2),
        'total_con_iva', round(coalesce(sum(total), 0), 2),
        'sin_factura', count(distinct compra_id) filter (where estado_factura = 'pendiente')) into tot from _acp;

    select count(distinct grupo) into n_grupos from _acp where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_strip_nulls(jsonb_build_object('grupo', grupo, 'recepciones', count(distinct compra_id),
            'base_sin_iva', round(sum(base), 2), 'total_con_iva', round(sum(total), 2),
            'cantidad', case when p_agrupar = 'insumo' then round(sum(cantidad), 3) end,
            'precio_promedio_sin_iva', case when p_agrupar = 'insumo' and sum(cantidad) > 0 then round(sum(base) / sum(cantidad), 4) end,
            'precio_min', case when p_agrupar = 'insumo' then round(min(base / nullif(cantidad, 0)), 4) end,
            'precio_max', case when p_agrupar = 'insumo' then round(max(base / nullif(cantidad, 0)), 4) end)) g
        from _acp where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar = 'mes' then grupo end, sum(base) desc limit v_lim) x;

    if p_detalle then
        select count(distinct compra_id) into n_docs from _acp;
        select coalesce(jsonb_agg(d order by d->>'fecha', d->>'recepcion'), '[]') into docs from (
            select jsonb_build_object('recepcion', numero_doc, 'factura_proveedor', nro_doc_proveedor, 'fecha', fecha,
                'proveedor', proveedor, 'sin_factura', estado_factura = 'pendiente', 'base_sin_iva', round(sum(base), 2),
                'total_con_iva', round(sum(total), 2), 'saldo_por_pagar', round(max(saldo), 2)) d
            from _acp group by compra_id, numero_doc, nro_doc_proveedor, fecha, proveedor, estado_factura
            order by fecha, numero_doc limit v_lim) x;
    end if;

    return jsonb_build_object('fuente', 'Compras (recepciones sin anular), por fecha de recepción',
        'desde', v_desde, 'hasta', v_hasta, 'nivel', case when v_lineas then 'líneas de insumo' else 'recepciones' end,
        'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos, 'grupos_totales', n_grupos,
        'documentos', docs, 'documentos_totales', n_docs,
        'recortado', coalesce(n_grupos, 0) > v_lim or coalesce(n_docs, 0) > v_lim,
        'nota', 'Montos en USD. Precio promedio = base sin IVA ÷ cantidad, en la unidad del insumo. '
             || 'Recepciones "sin factura" llevan precios estimados de la orden de compra. tipo_insumo: materia_prima, '
             || 'material_empaque, consumible, producto_terminado.');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- pagos_proveedor: dinero que salió a proveedores (recepciones, anticipos y gastos)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistente_pagos_proveedor(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_agrupar text default 'proveedor',
    p_proveedor_id uuid default null, p_origen text default 'todos', p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    tot jsonb; grupos jsonb; n_grupos integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'proveedor', 'dia', 'semana', 'mes', 'metodo', 'cuenta', 'origen') then raise exception 'agrupar no válido'; end if;
    if p_origen not in ('todos', 'compras', 'gastos') then raise exception 'origen debe ser todos, compras o gastos'; end if;

    drop table if exists _app; create temp table _app on commit drop as
    select * from (
        select case when tipo = 'anticipo pagado' then 'anticipo' else 'compra' end as origen, fecha, proveedor_id,
               proveedor, monto_usd, monto_bs, monto_equiv_usd, metodo_usd, metodo_bs, cuenta
        from v_export_pagos_proveedor
        where empresa_id = p_empresa and sale_de_caja and not anulado and p_origen in ('todos', 'compras')
        union all
        select 'gasto', p.fecha, g.proveedor_id, coalesce(g.proveedor, g.tipo_gasto), p.monto_usd, p.monto_bs,
               round(p.monto_usd + p.monto_bs / nullif(p.tasa_cambio, 0), 2), p.metodo_usd, p.metodo_bs, cb.nombre
        from pagos p
        join v_export_gastos g on g.gasto_id = p.origen_id
        left join cuentas_bancarias cb on cb.id = p.cuenta_bancaria_id
        where p.empresa_id = p_empresa and p.origen_tipo = 'gasto' and not g.anulado
          and p.retencion_id is null and p.devolucion_proveedor_id is null and p.devolucion_id is null
          and p_origen in ('todos', 'gastos')
        union all   -- gastos de contado anteriores a 2026-10-05: pagados sin abonos
        select 'gasto', g.fecha, g.proveedor_id, coalesce(g.proveedor, g.tipo_gasto), g.monto_usd, g.monto_bs, g.total_usd,
               g.metodo_pago, null, g.cuenta
        from v_export_gastos g
        where g.empresa_id = p_empresa and not g.anulado and g.estado = 'pagado' and p_origen in ('todos', 'gastos')
          and not exists (select 1 from pagos p where p.origen_tipo = 'gasto' and p.origen_id = g.gasto_id)
    ) t
    where fecha between v_desde and v_hasta and (p_proveedor_id is null or proveedor_id = p_proveedor_id);

    alter table _app add column grupo text;
    update _app set grupo = case p_agrupar when 'proveedor' then coalesce(proveedor, '(sin proveedor)')
        when 'dia' then to_char(fecha, 'YYYY-MM-DD') when 'semana' then 'semana del ' || to_char(date_trunc('week', fecha), 'YYYY-MM-DD')
        when 'mes' then to_char(fecha, 'YYYY-MM') when 'cuenta' then coalesce(cuenta, '(sin cuenta)') when 'origen' then origen
        when 'metodo' then concat_ws(' + ', case when monto_usd > 0 then coalesce(metodo_usd, 'USD') end,
                                            case when monto_bs > 0 then coalesce(metodo_bs, 'Bs.') end) end;

    select jsonb_build_object('pagos', count(*), 'total_equiv_usd', round(coalesce(sum(monto_equiv_usd), 0), 2),
        'en_usd', round(coalesce(sum(monto_usd), 0), 2), 'en_bs', round(coalesce(sum(monto_bs), 0), 2),
        'a_compras', round(coalesce(sum(monto_equiv_usd) filter (where origen = 'compra'), 0), 2),
        'anticipos', round(coalesce(sum(monto_equiv_usd) filter (where origen = 'anticipo'), 0), 2),
        'a_gastos', round(coalesce(sum(monto_equiv_usd) filter (where origen = 'gasto'), 0), 2)) into tot from _app;
    select count(distinct grupo) into n_grupos from _app where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'pagos', count(*), 'total_equiv_usd', round(sum(monto_equiv_usd), 2),
            'en_usd', round(sum(monto_usd), 2), 'en_bs', round(sum(monto_bs), 2)) g
        from _app where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar in ('dia', 'semana', 'mes') then grupo end, sum(monto_equiv_usd) desc limit v_lim) x;

    return jsonb_build_object('fuente', 'Pagos a proveedores (solo dinero: sin retenciones, notas de crédito ni aplicación de anticipos)',
        'desde', v_desde, 'hasta', v_hasta, 'origen', p_origen, 'totales', tot, 'agrupado_por', p_agrupar,
        'grupos', grupos, 'grupos_totales', n_grupos, 'recortado', coalesce(n_grupos, 0) > v_lim,
        'nota', 'Fecha = fecha real del pago. total_equiv_usd = USD + Bs. a la tasa de ese día. Un anticipo cuenta '
             || 'cuando se pagó (su aplicación posterior a una recepción no es dinero).');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- movimientos: entradas y salidas de inventario
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistente_movimientos(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_tipo_item text default null,
    p_texto text default null, p_origen text default null, p_agrupar text default 'item',
    p_detalle boolean default false, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_desde date := coalesce(p_desde, _asistente_hoy() - 6);
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    tot jsonb; grupos jsonb; docs jsonb; n_grupos integer; n_docs integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'item', 'origen', 'dia', 'almacen', 'tipo_item') then raise exception 'agrupar no válido'; end if;

    drop table if exists _amv; create temp table _amv on commit drop as
    select m.*,
           case when m.tipo_movimiento in ('entrada', 'ajuste_positivo') then abs(m.cantidad)
                when m.tipo_movimiento in ('salida', 'ajuste_negativo') then -abs(m.cantidad)
                else m.stock_actual - m.stock_anterior end as delta
    from v_export_movimientos m
    where m.empresa_id = p_empresa and m.fecha between v_desde and v_hasta
      and (p_tipo_item is null or m.tipo_item = p_tipo_item)
      and (p_texto is null or _asistente_coincide(m.item_nombre, p_texto) or m.item_codigo ilike trim(p_texto))
      and (p_origen is null or m.origen = p_origen);
    alter table _amv add column grupo text;
    update _amv set grupo = case p_agrupar
        when 'item' then coalesce(item_codigo || ' · ', '') || item_nombre
        when 'origen' then origen when 'dia' then to_char(fecha, 'YYYY-MM-DD')
        when 'almacen' then coalesce(almacen, '(sin almacén)') when 'tipo_item' then tipo_item end;

    select jsonb_build_object('movimientos', count(*), 'items', count(distinct item_id),
        'entradas', round(coalesce(sum(delta) filter (where delta > 0), 0), 3),
        'salidas', round(coalesce(-sum(delta) filter (where delta < 0), 0), 3),
        'neto', round(coalesce(sum(delta), 0), 3)) into tot from _amv;
    select count(distinct grupo) into n_grupos from _amv where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'movimientos', count(*),
            'entradas', round(coalesce(sum(delta) filter (where delta > 0), 0), 3),
            'salidas', round(coalesce(-sum(delta) filter (where delta < 0), 0), 3),
            'neto', round(sum(delta), 3)) g
        from _amv where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar = 'dia' then grupo end, sum(abs(delta)) desc limit v_lim) x;
    if p_detalle then
        select count(*) into n_docs from _amv;
        select coalesce(jsonb_agg(d), '[]') into docs from (
            select jsonb_build_object('fecha', fecha, 'hora', hora, 'item', item_nombre, 'codigo', item_codigo,
                'movimiento', round(delta, 3), 'stock_despues', round(stock_actual, 3), 'origen', origen,
                'almacen', almacen, 'usuario', usuario, 'notas', notas) d
            from _amv order by fecha_hora desc limit v_lim) x;
    end if;

    return jsonb_build_object('fuente', 'Movimientos de inventario', 'desde', v_desde, 'hasta', v_hasta,
        'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos, 'grupos_totales', n_grupos,
        'documentos', docs, 'documentos_totales', n_docs,
        'recortado', coalesce(n_grupos, 0) > v_lim or coalesce(n_docs, 0) > v_lim,
        'nota', 'Cantidades en la unidad de cada ítem (no sumar ítems distintos entre sí). Sin fechas: últimos 7 días. '
             || 'stock_despues es el stock total del ítem tras el movimiento. Orígenes frecuentes: pedido_facturado y venta '
             || '(ventas), recepcion_compra, produccion_consumo, produccion_cierre, transferencia, ajuste_manual, '
             || 'cambio_mano_mano, devolucion, merma, requisicion. tipo_item: producto_terminado, materia_prima, '
             || 'material_empaque, consumible.');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- tasas: BCV, euro y Binance de una fecha o un rango
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistente_tasas(
    p_empresa uuid, p_fecha date default null, p_desde date default null, p_hasta date default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare r jsonb; v_fecha date; n integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_desde is not null or p_hasta is not null then
        select count(*) into n from tasas_cambio where empresa_id = p_empresa
          and fecha between coalesce(p_desde, '1900-01-01') and coalesce(p_hasta, _asistente_hoy());
        select coalesce(jsonb_agg(jsonb_build_object('fecha', fecha, 'bcv', tasa_bcv, 'euro', tasa_euro, 'binance', tasa_binance) order by fecha), '[]')
          into r from (select * from tasas_cambio where empresa_id = p_empresa
                       and fecha between coalesce(p_desde, '1900-01-01') and coalesce(p_hasta, _asistente_hoy())
                       order by fecha desc limit 200) t;
        return jsonb_build_object('fuente', 'Tasas de cambio (histórico)', 'desde', p_desde, 'hasta', coalesce(p_hasta, _asistente_hoy()),
            'tasas', r, 'dias_con_tasa', n, 'recortado', n > 200, 'nota', 'Bs. por 1 USD (euro: Bs. por 1 EUR). Solo días cargados.');
    end if;
    v_fecha := coalesce(p_fecha, _asistente_hoy());
    select jsonb_build_object('fecha_pedida', v_fecha, 'fecha_tasa', fecha, 'bcv', tasa_bcv, 'euro', tasa_euro, 'binance', tasa_binance)
      into r from tasas_cambio where empresa_id = p_empresa and fecha <= v_fecha order by fecha desc limit 1;
    return jsonb_build_object('fuente', 'Tasas de cambio', 'al', v_fecha, 'tasa', r,
        'nota', 'Bs. por 1 USD (euro: Bs. por 1 EUR). Si fecha_tasa es anterior a fecha_pedida, ese día no se cargó tasa y '
             || 'se muestra la última anterior: dilo.');
end $$;

-- Solo usuarios con sesión
do $$
declare f text;
begin
    foreach f in array array[
        'asistente_buscar(uuid,text,text)',
        'asistente_ventas_resumen(uuid,date,date,text,uuid,uuid,uuid,text,text,text,boolean,integer)',
        'asistente_notas_credito(uuid,date,date,text,uuid,text,boolean,integer)',
        'asistente_clientes(uuid,uuid,text,uuid,integer,text,integer)',
        'asistente_dias_pago(uuid,date,date,text,uuid,uuid,text,integer)',
        'asistente_compras_resumen(uuid,date,date,text,uuid,text,text,boolean,integer)',
        'asistente_pagos_proveedor(uuid,date,date,text,uuid,text,integer)',
        'asistente_movimientos(uuid,date,date,text,text,text,text,boolean,integer)',
        'asistente_tasas(uuid,date,date,date)']
    loop
        execute format('revoke all on function public.%s from public, anon', f);
        execute format('grant execute on function public.%s to authenticated, service_role', f);
    end loop;
end $$;
