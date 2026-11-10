-- Asistente de IA — subfase 2: herramientas de solo lectura (docs/plan-asistente-ia.md)
-- Cada herramienta es una función SECURITY INVOKER (el RLS sigue aplicando) que
-- recibe la empresa explícita, devuelve jsonb ya agregado y acotado (máx. 200
-- filas, con "recortado") y nunca escribe. Fuente: vistas v_export_* del exportador.
-- Montos en USD. Fechas en hora de Caracas.

-- ── Acceso: la empresa del usuario, o cualquiera para el superadmin ──
create or replace function public._asistente_empresa(p_empresa uuid)
returns void language plpgsql stable security invoker set search_path = public as $$
begin
    if p_empresa is null then raise exception 'Falta la empresa'; end if;
    if not is_superadmin() and p_empresa is distinct from get_empresa_id() then
        raise exception 'Sin acceso a esa empresa';
    end if;
end $$;

create or replace function public._asistente_norm(t text)
returns text language sql immutable as $$
    select translate(lower(coalesce(t, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou')
$$;

-- Todas las palabras del texto aparecen en el campo (sin acentos ni mayúsculas)
create or replace function public._asistente_coincide(campo text, texto text)
returns boolean language sql immutable as $$
    select not exists (
        select 1 from unnest(string_to_array(_asistente_norm(texto), ' ')) w
        where w <> '' and _asistente_norm(campo) not like '%' || w || '%')
$$;

create or replace function public._asistente_hoy()
returns date language sql stable as $$ select (now() at time zone 'America/Caracas')::date $$;

create or replace function public._asistente_tramo(dias_vencida integer)
returns text language sql immutable as $$
    select case when coalesce(dias_vencida, 0) <= 0 then '0 por vencer'
                when dias_vencida <= 30 then '1 vencido 1–30 días'
                when dias_vencida <= 60 then '2 vencido 31–60 días'
                when dias_vencida <= 90 then '3 vencido 61–90 días'
                else '4 vencido más de 90 días' end
$$;

-- ── 1. buscar: resolver un nombre a su id ──
create or replace function public.asistente_buscar(p_empresa uuid, p_tipo text, p_texto text)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare r jsonb;
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
            select id, nombre, sku, categoria_1, categoria_2, unidad_medida, activo from productos_terminados
            where empresa_id = p_empresa and (_asistente_coincide(nombre, p_texto) or sku ilike '%' || trim(p_texto) || '%')
            order by activo desc, nombre limit 15) x;
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
    else
        raise exception 'Tipo no válido: use cliente, producto, proveedor o vendedor';
    end if;
    return jsonb_build_object('tipo', p_tipo, 'texto', p_texto, 'resultados', r);
end $$;

-- ── 2. ventas_resumen: notas de entrega emitidas (sin anuladas) ──
create or replace function public.asistente_ventas_resumen(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_agrupar text default 'ninguno',
    p_cliente_id uuid default null, p_producto_id uuid default null, p_vendedor_id uuid default null,
    p_canal text default null, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    v_lineas boolean := p_producto_id is not null or p_agrupar in ('producto', 'categoria_producto');
    v_tiempo boolean := p_agrupar in ('dia', 'semana', 'mes');
    tot jsonb; grupos jsonb; n_grupos integer;
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
           v.venta_id,
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
      and (p_producto_id is null or l.producto_id = p_producto_id);

    select jsonb_build_object('notas', count(distinct venta_id), 'base_imponible', round(coalesce(sum(base), 0), 2),
                              'total_con_iva', round(coalesce(sum(total), 0), 2), 'unidades', round(coalesce(sum(unidades), 0), 2))
      into tot from _av;

    select count(distinct grupo) into n_grupos from _av where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g order by case when v_tiempo then g->>'grupo' end, (g->>'base_imponible')::numeric desc), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'notas', count(distinct venta_id), 'base_imponible', round(sum(base), 2),
                                  'total_con_iva', round(sum(total), 2), 'unidades', round(sum(unidades), 2)) g
        from _av where p_agrupar <> 'ninguno' group by grupo
        order by case when v_tiempo then grupo end, sum(base) desc limit v_lim) x;

    return jsonb_build_object(
        'fuente', 'Ventas (notas de entrega emitidas, sin anuladas)', 'desde', v_desde, 'hasta', v_hasta,
        'nivel', case when v_lineas then 'líneas de producto' else 'notas' end,
        'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos,
        'grupos_totales', n_grupos, 'recortado', coalesce(n_grupos, 0) > v_lim,
        'nota', 'Montos en USD. base_imponible = sin IVA. Unidades en la unidad primaria del producto.');
end $$;

-- ── 3. cartera_cxc: lo que deben los clientes hoy ──
create or replace function public.asistente_cartera_cxc(
    p_empresa uuid, p_agrupar text default 'cliente', p_cliente_id uuid default null,
    p_vendedor_id uuid default null, p_solo_vencidas boolean default false, p_detalle boolean default false,
    p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    tot jsonb; grupos jsonb; docs jsonb; n_grupos integer; n_docs integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'cliente', 'tramo', 'vendedor', 'canal') then raise exception 'agrupar no válido'; end if;

    drop table if exists _ac; create temp table _ac on commit drop as
    select c.*, case p_agrupar when 'cliente' then c.cliente when 'tramo' then _asistente_tramo(c.dias_vencida)
                               when 'vendedor' then coalesce(c.vendedor, '(sin vendedor)')
                               when 'canal' then coalesce(c.canal, '(sin canal)') end as grupo
    from v_export_cartera_cxc c
    where c.empresa_id = p_empresa and c.saldo > 0.005
      and (p_cliente_id is null or c.cliente_id = p_cliente_id)
      and (p_vendedor_id is null or c.vendedor_id = p_vendedor_id)
      and (not p_solo_vencidas or c.dias_vencida > 0);

    select jsonb_build_object('notas', count(*), 'clientes', count(distinct cliente_id),
        'saldo', round(coalesce(sum(saldo), 0), 2),
        'vencido', round(coalesce(sum(saldo) filter (where dias_vencida > 0), 0), 2),
        'por_vencer', round(coalesce(sum(saldo) filter (where dias_vencida <= 0), 0), 2),
        'dias_calle_ponderado', round(coalesce(sum(antiguedad_dias * saldo) / nullif(sum(saldo), 0), 0), 1))
      into tot from _ac;

    select count(distinct grupo) into n_grupos from _ac where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'notas', count(*), 'saldo', round(sum(saldo), 2),
            'vencido', round(coalesce(sum(saldo) filter (where dias_vencida > 0), 0), 2),
            'max_dias_vencida', max(dias_vencida)) g
        from _ac where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar = 'tramo' then grupo end, sum(saldo) desc limit v_lim) x;

    if p_detalle then
        select count(*) into n_docs from _ac;
        select coalesce(jsonb_agg(d), '[]') into docs from (
            select jsonb_build_object('nota', numero_factura, 'factura', nro_referencia, 'cliente', cliente, 'emision', fecha,
                'vencimiento', vencimiento, 'dias_vencida', dias_vencida, 'total', total, 'cobrado', cobrado, 'saldo', saldo,
                'vendedor', vendedor) d
            from _ac order by dias_vencida desc, saldo desc limit v_lim) x;
    end if;

    return jsonb_build_object(
        'fuente', 'Cuentas por cobrar (notas pendientes y parciales)', 'al', _asistente_hoy(),
        'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos, 'grupos_totales', n_grupos,
        'documentos', docs, 'documentos_totales', n_docs,
        'recortado', coalesce(n_grupos, 0) > v_lim or coalesce(n_docs, 0) > v_lim,
        'nota', 'Montos en USD. Saldo antes de las retenciones de IVA/ISLR aún por registrar (la pantalla de CxC las descuenta). dias_calle_ponderado = días desde la emisión ponderados por saldo.');
end $$;

-- ── 4. cobros_resumen: dinero cobrado (sin retenciones, NC ni diferencial) ──
create or replace function public.asistente_cobros_resumen(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_agrupar text default 'ninguno',
    p_cliente_id uuid default null, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    tot jsonb; grupos jsonb; n_grupos integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'dia', 'semana', 'mes', 'cliente', 'metodo', 'cuenta', 'vendedor') then raise exception 'agrupar no válido'; end if;

    drop table if exists _ab; create temp table _ab on commit drop as
    select case p_agrupar
               when 'dia' then to_char(fecha, 'YYYY-MM-DD')
               when 'semana' then 'semana del ' || to_char(date_trunc('week', fecha), 'YYYY-MM-DD')
               when 'mes' then to_char(fecha, 'YYYY-MM')
               when 'cliente' then cliente
               when 'metodo' then concat_ws(' + ', case when monto_usd > 0 then coalesce(metodo_usd, 'USD') end,
                                                  case when monto_bs > 0 then coalesce(metodo_bs, 'Bs.') end)
               when 'cuenta' then coalesce(cuenta, '(sin cuenta)')
               when 'vendedor' then coalesce(vendedor, '(sin vendedor)')
           end as grupo, *
    from v_export_cobros
    where empresa_id = p_empresa and not anulado and not es_retencion and not es_nota_credito
      and not coalesce(es_diferencial_cambiario, false)
      and fecha between v_desde and v_hasta
      and (p_cliente_id is null or cliente_id = p_cliente_id);

    select jsonb_build_object('cobros', count(*), 'total_equiv_usd', round(coalesce(sum(monto_equiv_usd), 0), 2),
        'en_usd', round(coalesce(sum(monto_usd), 0), 2), 'en_bs', round(coalesce(sum(monto_bs), 0), 2))
      into tot from _ab;
    select count(distinct grupo) into n_grupos from _ab where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'cobros', count(*), 'total_equiv_usd', round(sum(monto_equiv_usd), 2),
            'en_usd', round(sum(monto_usd), 2), 'en_bs', round(sum(monto_bs), 2)) g
        from _ab where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar in ('dia', 'semana', 'mes') then grupo end, sum(monto_equiv_usd) desc limit v_lim) x;

    return jsonb_build_object(
        'fuente', 'Cobros de clientes (solo dinero: sin retenciones, notas de crédito ni diferencial cambiario)',
        'desde', v_desde, 'hasta', v_hasta, 'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos,
        'grupos_totales', n_grupos, 'recortado', coalesce(n_grupos, 0) > v_lim,
        'nota', 'Fecha = fecha real del pago. total_equiv_usd = USD + Bs. convertidos a la tasa de ese día.');
end $$;

-- ── 5. pedidos_resumen ──
create or replace function public.asistente_pedidos_resumen(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_fecha_por text default 'pedido',
    p_estados text[] default null, p_agrupar text default 'estado', p_cliente_id uuid default null,
    p_detalle boolean default false, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    tot jsonb; grupos jsonb; docs jsonb; n_grupos integer; n_docs integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'estado', 'cliente', 'vendedor', 'dia_entrega', 'dia_pedido') then raise exception 'agrupar no válido'; end if;
    if p_fecha_por not in ('pedido', 'entrega') then raise exception 'fecha_por debe ser pedido o entrega'; end if;

    drop table if exists _ap; create temp table _ap on commit drop as
    select case p_agrupar when 'estado' then estado when 'cliente' then cliente
                          when 'vendedor' then coalesce(vendedor, '(sin vendedor)')
                          when 'dia_entrega' then coalesce(to_char(fecha_entrega, 'YYYY-MM-DD'), '(sin fecha)')
                          when 'dia_pedido' then to_char(fecha, 'YYYY-MM-DD') end as grupo, *
    from v_export_pedidos
    where empresa_id = p_empresa and not anulado
      and (case when p_fecha_por = 'entrega' then fecha_entrega else fecha end) between v_desde and v_hasta
      and (p_estados is null or estado = any (p_estados))
      and (p_cliente_id is null or cliente_id = p_cliente_id);

    select jsonb_build_object('pedidos', count(*), 'total', round(coalesce(sum(total), 0), 2),
        'unidades_pedidas', round(coalesce(sum(unidades_pedidas), 0), 2)) into tot from _ap;
    select count(distinct grupo) into n_grupos from _ap where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'pedidos', count(*), 'total', round(sum(total), 2)) g
        from _ap where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar like 'dia_%' then grupo end, sum(total) desc limit v_lim) x;
    if p_detalle then
        select count(*) into n_docs from _ap;
        select coalesce(jsonb_agg(d), '[]') into docs from (
            select jsonb_build_object('pedido', numero_pedido, 'fecha', fecha, 'entrega', fecha_entrega, 'estado', estado,
                'cliente', cliente, 'ciudad', direccion_ciudad, 'total', total, 'vendedor', vendedor, 'nota_entrega', nota_entrega) d
            from _ap order by fecha_entrega nulls last, fecha limit v_lim) x;
    end if;

    return jsonb_build_object(
        'fuente', 'Pedidos (sin anulados)', 'fecha_por', p_fecha_por, 'desde', v_desde, 'hasta', v_hasta,
        'estados', coalesce(to_jsonb(p_estados), '"todos"'), 'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos,
        'grupos_totales', n_grupos, 'documentos', docs, 'documentos_totales', n_docs,
        'recortado', coalesce(n_grupos, 0) > v_lim or coalesce(n_docs, 0) > v_lim,
        'nota', 'Estados: pendiente, aprobado, alistado, rechazado, facturado, despachado. Montos en USD sin IVA para pedidos abiertos.');
end $$;

-- ── 6. stock: existencias actuales ──
create or replace function public.asistente_stock(
    p_empresa uuid, p_tipo text default 'producto_terminado', p_texto text default null,
    p_bajo_minimo boolean default false, p_por_almacen boolean default false, p_limite integer default 100)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_lim integer := least(greatest(coalesce(p_limite, 100), 1), 200);
    v_tabla text; v_cod text; r jsonb; n integer;
begin
    perform _asistente_empresa(p_empresa);
    v_tabla := case p_tipo when 'producto_terminado' then 'productos_terminados' when 'materia_prima' then 'materias_primas'
                           when 'material_empaque' then 'materiales_empaque' when 'consumible' then 'consumibles' end;
    if v_tabla is null then raise exception 'tipo no válido: producto_terminado, materia_prima, material_empaque o consumible'; end if;
    v_cod := case when p_tipo = 'producto_terminado' then 'sku' else 'codigo' end;

    drop table if exists _as;
    execute format($q$
        create temp table _as on commit drop as
        select i.id, i.%2$I as codigo, i.nombre, i.categoria_1, i.unidad_medida, i.stock_actual, i.stock_minimo,
               (i.stock_minimo > 0 and i.stock_actual < i.stock_minimo) as bajo_minimo
        from %1$I i
        where i.empresa_id = $1 and i.activo is not false
          and ($2 is null or _asistente_coincide(i.nombre, $2) or i.%2$I ilike '%%' || $2 || '%%')
          and (not $3 or (i.stock_minimo > 0 and i.stock_actual < i.stock_minimo))$q$, v_tabla, v_cod)
    using p_empresa, nullif(trim(p_texto), ''), p_bajo_minimo;

    select count(*) into n from _as;
    select coalesce(jsonb_agg(x), '[]') into r from (
        select jsonb_build_object('codigo', s.codigo, 'nombre', s.nombre, 'categoria', s.categoria_1, 'unidad', s.unidad_medida,
            'stock', round(s.stock_actual, 3), 'stock_minimo', s.stock_minimo, 'bajo_minimo', s.bajo_minimo,
            'por_almacen', case when p_por_almacen then (
                select coalesce(jsonb_agg(jsonb_build_object('almacen', a.nombre, 'cantidad', round(t.cant, 3)) order by a.nombre), '[]')
                from (select almacen_id, sum(cantidad) cant from stock_ubicacion
                      where empresa_id = p_empresa and tipo_item = p_tipo and item_id = s.id group by almacen_id) t
                join almacenes a on a.id = t.almacen_id where t.cant <> 0) end) x
        from _as s order by s.bajo_minimo desc, s.nombre limit v_lim) y;

    return jsonb_build_object('fuente', 'Inventario (existencias actuales)', 'al', _asistente_hoy(), 'tipo', p_tipo,
        'items', r, 'items_totales', n, 'recortado', n > v_lim,
        'nota', 'Cantidades en la unidad de medida del ítem. stock_minimo 0 = sin mínimo configurado.');
end $$;

-- ── 7. cartera_cxp: lo que se debe a proveedores (recepciones y gastos por pagar) ──
create or replace function public.asistente_cartera_cxp(
    p_empresa uuid, p_agrupar text default 'proveedor', p_proveedor_id uuid default null,
    p_solo_vencidas boolean default false, p_detalle boolean default false, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    v_hoy date := _asistente_hoy();
    tot jsonb; grupos jsonb; docs jsonb; n_grupos integer; n_docs integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'proveedor', 'tramo', 'origen') then raise exception 'agrupar no válido'; end if;

    drop table if exists _ap2; create temp table _ap2 on commit drop as
    select * from (
        select 'compra' as origen, numero_doc as documento, nro_doc_proveedor as doc_proveedor, proveedor_id,
               proveedor, fecha, vencimiento, total, saldo, coalesce(dias_vencida, 0) as dias_vencida
        from v_export_cartera_cxp
        where empresa_id = p_empresa and not anulada and saldo > 0.005
        union all
        select 'gasto', numero_gasto, numero_factura, proveedor_id, coalesce(proveedor, tipo_gasto), fecha, vencimiento,
               total_usd, saldo, greatest(0, v_hoy - vencimiento)
        from v_export_gastos
        where empresa_id = p_empresa and not anulado and saldo > 0.005
    ) d
    where (p_proveedor_id is null or proveedor_id = p_proveedor_id)
      and (not p_solo_vencidas or dias_vencida > 0);

    select jsonb_build_object('documentos', count(*), 'saldo', round(coalesce(sum(saldo), 0), 2),
        'vencido', round(coalesce(sum(saldo) filter (where dias_vencida > 0), 0), 2),
        'por_vencer', round(coalesce(sum(saldo) filter (where dias_vencida <= 0), 0), 2),
        'de_compras', round(coalesce(sum(saldo) filter (where origen = 'compra'), 0), 2),
        'de_gastos', round(coalesce(sum(saldo) filter (where origen = 'gasto'), 0), 2)) into tot from _ap2;
    select count(distinct case p_agrupar when 'proveedor' then proveedor when 'tramo' then _asistente_tramo(dias_vencida) else origen end)
      into n_grupos from _ap2 where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'documentos', count(*), 'saldo', round(sum(saldo), 2),
            'vencido', round(coalesce(sum(saldo) filter (where dias_vencida > 0), 0), 2)) g
        from (select *, case p_agrupar when 'proveedor' then coalesce(proveedor, '(sin proveedor)')
                                      when 'tramo' then _asistente_tramo(dias_vencida) else origen end grupo from _ap2) t
        where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar = 'tramo' then grupo end, sum(saldo) desc limit v_lim) x;
    if p_detalle then
        select count(*) into n_docs from _ap2;
        select coalesce(jsonb_agg(d), '[]') into docs from (
            select jsonb_build_object('origen', origen, 'documento', documento, 'doc_proveedor', doc_proveedor,
                'proveedor', proveedor, 'fecha', fecha, 'vencimiento', vencimiento, 'dias_vencida', dias_vencida,
                'total', total, 'saldo', saldo) d
            from _ap2 order by vencimiento nulls last limit v_lim) x;
    end if;

    return jsonb_build_object(
        'fuente', 'Cuentas por pagar (recepciones de compra y gastos con saldo)', 'al', v_hoy,
        'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos, 'grupos_totales', n_grupos,
        'documentos', docs, 'documentos_totales', n_docs,
        'recortado', coalesce(n_grupos, 0) > v_lim or coalesce(n_docs, 0) > v_lim,
        'nota', 'Montos en USD.');
end $$;

-- ── 8. gastos_resumen: gastos registrados en un período ──
create or replace function public.asistente_gastos_resumen(
    p_empresa uuid, p_desde date default null, p_hasta date default null, p_agrupar text default 'tipo',
    p_proveedor_id uuid default null, p_solo_pendientes boolean default false, p_limite integer default 50)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
    tot jsonb; grupos jsonb; n_grupos integer;
begin
    perform _asistente_empresa(p_empresa);
    if p_agrupar not in ('ninguno', 'mes', 'tipo', 'categoria', 'proveedor') then raise exception 'agrupar no válido'; end if;

    drop table if exists _ag; create temp table _ag on commit drop as
    select case p_agrupar when 'mes' then to_char(fecha, 'YYYY-MM') when 'tipo' then coalesce(tipo_gasto, '(sin tipo)')
                          when 'categoria' then coalesce(categoria, '(sin categoría)')
                          when 'proveedor' then coalesce(proveedor, '(sin proveedor)') end as grupo, *
    from v_export_gastos
    where empresa_id = p_empresa and not anulado and fecha between v_desde and v_hasta
      and (p_proveedor_id is null or proveedor_id = p_proveedor_id)
      and (not p_solo_pendientes or saldo > 0.005);

    select jsonb_build_object('gastos', count(*), 'total', round(coalesce(sum(total_usd), 0), 2),
        'pagado', round(coalesce(sum(abonado), 0), 2), 'saldo', round(coalesce(sum(saldo), 0), 2)) into tot from _ag;
    select count(distinct grupo) into n_grupos from _ag where p_agrupar <> 'ninguno';
    select coalesce(jsonb_agg(g), '[]') into grupos from (
        select jsonb_build_object('grupo', grupo, 'gastos', count(*), 'total', round(sum(total_usd), 2), 'saldo', round(sum(saldo), 2)) g
        from _ag where p_agrupar <> 'ninguno' group by grupo
        order by case when p_agrupar = 'mes' then grupo end, sum(total_usd) desc limit v_lim) x;

    return jsonb_build_object('fuente', 'Gastos (sin anulados), por fecha del gasto', 'desde', v_desde, 'hasta', v_hasta,
        'totales', tot, 'agrupado_por', p_agrupar, 'grupos', grupos, 'grupos_totales', n_grupos,
        'recortado', coalesce(n_grupos, 0) > v_lim, 'nota', 'Montos en USD (equivalente congelado al registrar).');
end $$;

-- Solo usuarios con sesión
do $$
declare f text;
begin
    foreach f in array array[
        '_asistente_empresa(uuid)', '_asistente_norm(text)', '_asistente_coincide(text,text)', '_asistente_hoy()',
        '_asistente_tramo(integer)', 'asistente_buscar(uuid,text,text)',
        'asistente_ventas_resumen(uuid,date,date,text,uuid,uuid,uuid,text,integer)',
        'asistente_cartera_cxc(uuid,text,uuid,uuid,boolean,boolean,integer)',
        'asistente_cobros_resumen(uuid,date,date,text,uuid,integer)',
        'asistente_pedidos_resumen(uuid,date,date,text,text[],text,uuid,boolean,integer)',
        'asistente_stock(uuid,text,text,boolean,boolean,integer)',
        'asistente_cartera_cxp(uuid,text,uuid,boolean,boolean,integer)',
        'asistente_gastos_resumen(uuid,date,date,text,uuid,boolean,integer)']
    loop
        execute format('revoke all on function public.%s from public, anon', f);
        execute format('grant execute on function public.%s to authenticated, service_role', f);
    end loop;
end $$;
