-- Asistente de IA — consulta analítica flexible ("tabla dinámica"), docs/plan-asistente-ia.md
-- Una fuente (ventas, pedidos, cobros, compras, gastos, cartera), hasta 3 dimensiones, las medidas
-- y filtros que se quieran. Todo nombre de dimensión, medida o fuente sale de listas fijas (nunca
-- SQL del modelo); los valores de filtro y las fechas van como literales. SECURITY INVOKER + empresa
-- validada, solo lectura. Ventas, pedidos y compras se leen por línea (montos de líneas = documento).

create or replace function public.asistente_analisis(
    p_empresa uuid, p_fuente text, p_dimensiones text[] default null, p_medidas text[] default null,
    p_filtros jsonb default null, p_excluir jsonb default null, p_desde date default null, p_hasta date default null,
    p_orden text default null, p_limite integer default 100)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
    v_desde date := coalesce(p_desde, date_trunc('month', _asistente_hoy())::date);
    v_hasta date := coalesce(p_hasta, _asistente_hoy());
    v_lim integer := least(greatest(coalesce(p_limite, 100), 1), 200);
    v_tiempo text[] := array['dia', 'semana', 'mes', 'trimestre', 'anio', 'mes_entrega', 'dia_entrega'];
    v_base text; v_dims_ok text[]; v_meds_ok text[]; v_meds_def text[]; v_nota text;
    v_dims text[] := coalesce(p_dimensiones, '{}'); v_meds text[];
    v_sel text := ''; v_grp text := ''; v_medsql text := ''; v_tot text := ''; v_where text := 'true';
    v_ord text; v_orden text; k text; v jsonb; d text; m text; i integer;
    v_costos text[] := array['costo', 'margen', 'margen_pct', 'costo_unitario']; v_con_costo boolean;
    filas jsonb; n integer; tot jsonb;
begin
    perform _asistente_empresa(p_empresa);

    -- ── Fuentes: columnas normalizadas para que dimensiones y medidas sean comunes ──
    if p_fuente = 'ventas' then
        v_base := $b$select fecha, cliente, canal, cliente_cat2 as cat_cliente_2, cliente_cat3 as cat_cliente_3,
            cliente_cat4 as cat_cliente_4, vendedor, direccion_ciudad as ciudad, sku, producto,
            producto_cat1 as cat_producto_1, producto_cat2 as cat_producto_2, producto_cat3 as cat_producto_3,
            producto_cat4 as cat_producto_4, tipo_producto, estado_cobro as estado, venta_id as doc_id, cliente_id,
            linea_producto_id as item_id, base_linea as base, total_linea as total, linea_unidades_primarias as unidades,
            coalesce(costo_linea, 0) as costo, coalesce(linea_costo_estimado, false) as costo_estimado
            from v_export_ventas_detalle where empresa_id = $1 and not anulada and fecha between $2 and $3$b$;
        v_dims_ok := array['dia', 'semana', 'mes', 'trimestre', 'anio', 'cliente', 'canal', 'categoria_cliente_2',
            'categoria_cliente_3', 'categoria_cliente_4', 'vendedor', 'ciudad', 'producto', 'categoria_producto_1',
            'categoria_producto_2', 'categoria_producto_3', 'categoria_producto_4', 'tipo_producto', 'estado'];
        v_meds_ok := array['base', 'total', 'unidades', 'notas', 'clientes', 'productos', 'precio_promedio', 'ticket_promedio',
            'costo', 'margen', 'margen_pct', 'costo_unitario'];
        v_meds_def := array['base', 'unidades', 'notas'];
        v_nota := 'Ventas facturadas (notas de entrega sin anular), leídas por línea. base = sin IVA; total = con IVA; '
               || 'unidades en la unidad primaria de cada producto; estado = estado de cobro de la nota. No descuenta notas de crédito.';
    elsif p_fuente = 'pedidos' then
        v_base := $b$select fecha, fecha_entrega, cliente, canal, cliente_cat2 as cat_cliente_2, vendedor,
            direccion_ciudad as ciudad, sku, producto, producto_cat1 as cat_producto_1, producto_cat2 as cat_producto_2,
            tipo_producto, estado, pedido_id as doc_id, cliente_id, linea_producto_id as item_id, base_linea as base,
            total_linea as total, linea_unidades_pedidas as unidades
            from v_export_pedidos_detalle where empresa_id = $1 and not anulado and fecha between $2 and $3$b$;
        v_dims_ok := array['dia', 'semana', 'mes', 'trimestre', 'anio', 'mes_entrega', 'dia_entrega', 'cliente', 'canal',
            'categoria_cliente_2', 'vendedor', 'ciudad', 'producto', 'categoria_producto_1', 'categoria_producto_2',
            'tipo_producto', 'estado'];
        v_meds_ok := array['base', 'total', 'unidades', 'pedidos', 'clientes', 'productos'];
        v_meds_def := array['base', 'pedidos'];
        v_nota := 'Pedidos sin anular, por fecha del pedido (mes_entrega/dia_entrega = fecha programada de entrega), leídos '
               || 'por línea. base = sin IVA; unidades pedidas en unidad primaria. Estados: pendiente, aprobado, alistado, '
               || 'rechazado, facturado, despachado.';
    elsif p_fuente = 'cobros' then
        v_base := $b$select fecha, cliente, canal, vendedor,
            concat_ws(' + ', case when monto_usd > 0 then coalesce(metodo_usd, 'USD') end,
                             case when monto_bs > 0 then coalesce(metodo_bs, 'Bs.') end) as metodo,
            cuenta, cobro_id as doc_id, cliente_id, monto_equiv_usd as base
            from v_export_cobros where empresa_id = $1 and not anulado and not es_retencion and not es_nota_credito
              and not coalesce(es_diferencial_cambiario, false) and fecha between $2 and $3$b$;
        v_dims_ok := array['dia', 'semana', 'mes', 'trimestre', 'anio', 'cliente', 'canal', 'vendedor', 'metodo', 'cuenta'];
        v_meds_ok := array['monto', 'cobros', 'clientes'];
        v_meds_def := array['monto', 'cobros'];
        v_nota := 'Cobros en dinero (sin retenciones, NC ni diferencial), por fecha real del pago. monto = USD + Bs. a la tasa del día.';
    elsif p_fuente = 'compras' then
        v_base := $b$select fecha, proveedor, insumo, unidad,
            case when tipo_insumo = 'empaque' then 'material_empaque' else tipo_insumo end as tipo_insumo,
            compra_id as doc_id, linea_insumo_id as item_id, base_linea as base, total_linea as total, cantidad as unidades
            from v_export_compras_detalle where empresa_id = $1 and not anulada and fecha between $2 and $3$b$;
        v_dims_ok := array['dia', 'semana', 'mes', 'trimestre', 'anio', 'proveedor', 'insumo', 'tipo_insumo'];
        v_meds_ok := array['base', 'total', 'cantidad', 'recepciones', 'proveedores', 'insumos', 'precio_promedio'];
        v_meds_def := array['base', 'recepciones'];
        v_nota := 'Compras recibidas (recepciones sin anular), por fecha de recepción, leídas por línea. base = sin IVA; '
               || 'cantidad en la unidad del insumo.';
    elsif p_fuente = 'gastos' then
        v_base := $b$select fecha, tipo_gasto, categoria as categoria_gasto, proveedor, gasto_id as doc_id,
            total_usd as base, saldo
            from v_export_gastos where empresa_id = $1 and not anulado and fecha between $2 and $3$b$;
        v_dims_ok := array['dia', 'semana', 'mes', 'trimestre', 'anio', 'tipo_gasto', 'categoria_gasto', 'proveedor'];
        v_meds_ok := array['monto', 'saldo', 'gastos'];
        v_meds_def := array['monto', 'gastos'];
        v_nota := 'Gastos sin anular, por fecha del gasto. monto = equivalente USD congelado al registrar; saldo = lo que falta pagar.';
    elsif p_fuente = 'cartera' then
        v_base := $b$select fecha, cliente, canal, cliente_cat2 as cat_cliente_2, cliente_cat3 as cat_cliente_3,
            cliente_cat4 as cat_cliente_4, vendedor, direccion_ciudad as ciudad, venta_id as doc_id, cliente_id,
            saldo, dias_vencida, _asistente_tramo(dias_vencida) as tramo
            from v_export_cartera_cxc where empresa_id = $1 and saldo > 0.005 and $2 is not null and $3 is not null$b$;
        v_dims_ok := array['mes', 'anio', 'cliente', 'canal', 'categoria_cliente_2', 'categoria_cliente_3',
            'categoria_cliente_4', 'vendedor', 'ciudad', 'tramo'];
        v_meds_ok := array['saldo', 'vencido', 'notas', 'clientes'];
        v_meds_def := array['saldo', 'vencido', 'notas'];
        v_nota := 'Cartera de clientes HOY (notas con saldo); desde/hasta no aplican. mes = mes de emisión de la nota. '
               || 'Saldo antes de retenciones por registrar.';
    else
        raise exception 'fuente no válida: ventas, pedidos, cobros, compras, gastos o cartera';
    end if;

    if cardinality(v_dims) > 3 then raise exception 'máximo 3 dimensiones'; end if;
    foreach d in array v_dims loop
        if not d = any (v_dims_ok) then
            raise exception 'dimensión no válida para %: % (válidas: %)', p_fuente, d, array_to_string(v_dims_ok, ', ');
        end if;
    end loop;
    v_meds := coalesce(nullif(p_medidas, '{}'), v_meds_def);
    foreach m in array v_meds loop
        if not m = any (v_meds_ok) then
            raise exception 'medida no válida para %: % (válidas: %)', p_fuente, m, array_to_string(v_meds_ok, ', ');
        end if;
    end loop;
    -- Costos y márgenes: solo administración o finanzas (como los montos de activos)
    v_con_costo := v_meds && v_costos;
    if v_con_costo and not _asistente_ve_costos() then
        raise exception 'Los costos y márgenes solo los pueden consultar usuarios de administración o finanzas';
    end if;

    -- ── Filtros: {"dimension": ["valor", ...]} — igualdad sin acentos ni mayúsculas ──
    for i in 1..2 loop
        v := case i when 1 then p_filtros else p_excluir end;
        continue when v is null or jsonb_typeof(v) <> 'object';
        for k in select jsonb_object_keys(v) loop
            if not k = any (v_dims_ok) then
                raise exception 'filtro no válido para %: % (válidos: %)', p_fuente, k, array_to_string(v_dims_ok, ', ');
            end if;
            v_where := v_where || format(' and %s(%s)', case i when 1 then '' else 'not ' end,
                format('_asistente_norm(%s) = any (%L::text[])', _asistente_dim_sql(k),
                    (select array_agg(_asistente_norm(x)) from jsonb_array_elements_text(
                        case jsonb_typeof(v -> k) when 'array' then v -> k else jsonb_build_array(v -> k) end) x))
                || case when k = 'producto' then format(' or _asistente_norm(producto) = any (%1$L::text[]) or _asistente_norm(sku) = any (%1$L::text[])',
                    (select array_agg(_asistente_norm(x)) from jsonb_array_elements_text(
                        case jsonb_typeof(v -> k) when 'array' then v -> k else jsonb_build_array(v -> k) end) x)) else '' end);
        end loop;
    end loop;

    -- ── SELECT: dimensiones y medidas desde las listas fijas ──
    for i in 1..cardinality(v_dims) loop
        v_sel := v_sel || format('%s as %I, ', _asistente_dim_sql(v_dims[i]), v_dims[i]);
        v_grp := v_grp || case when i > 1 then ', ' else '' end || i;
    end loop;
    foreach m in array v_meds loop
        v_medsql := v_medsql || case when v_medsql <> '' then ', ' else '' end
                  || format('%s as %I', _asistente_med_sql(m, true), m);
        v_tot := v_tot || case when v_tot <> '' then ', ' else '' end
              || format('%L, %s', m, _asistente_med_sql(m, true));
    end loop;

    if v_con_costo then
        v_tot := v_tot || ', ''base_con_costo_estimado'', round(coalesce(sum(base) filter (where costo_estimado), 0)::numeric, 2)';
        v_nota := v_nota || ' costo = costo promedio del producto al momento de la venta, guardado en cada línea desde el '
               || '2026-10-06; las ventas anteriores usan el costo promedio ACTUAL (estimado): base_con_costo_estimado dice '
               || 'cuánta venta del resultado tiene costo estimado. Los servicios no tienen costo. margen = base − costo; '
               || 'margen_pct = margen ÷ base × 100; costo_unitario = costo ÷ unidades. Es costo promedio de inventario, '
               || 'no un costeo de receta: depende de los costos de materia prima y producción cargados.';
    end if;

    execute format('with base as (%s) select jsonb_build_object(%s) from base where %s', v_base, v_tot, v_where)
        into tot using p_empresa, v_desde, v_hasta;

    if cardinality(v_dims) = 0 then
        filas := '[]'; n := 0;
    else
        v_orden := coalesce(p_orden, case when v_dims[1] = any (v_tiempo) then 'dimension' else 'mayor' end);
        if v_orden not in ('mayor', 'menor', 'dimension') then raise exception 'orden: mayor, menor o dimension'; end if;
        v_ord := case v_orden when 'dimension' then (select string_agg(_asistente_dim_sql(x), ', ') from unnest(v_dims) x)
                     else format('%s %s nulls last', _asistente_med_sql(v_meds[1], false),
                                 case v_orden when 'mayor' then 'desc' else 'asc' end) end;
        execute format($q$
            with base as (%1$s),
            g as (select %2$s %3$s, count(*) over () as _n, row_number() over (order by %4$s) as _rn
                  from base where %5$s group by %6$s order by %4$s limit %7$s)
            select coalesce(jsonb_agg(to_jsonb(g) - '_n' - '_rn' order by _rn), '[]'), max(_n) from g$q$,
            v_base, v_sel, v_medsql, v_ord, v_where, v_grp, v_lim)
        into filas, n using p_empresa, v_desde, v_hasta;
    end if;

    return jsonb_build_object(
        'fuente', p_fuente,
        'desde', case when p_fuente <> 'cartera' then v_desde end, 'hasta', case when p_fuente <> 'cartera' then v_hasta end,
        'al', case when p_fuente = 'cartera' then _asistente_hoy() end,
        'dimensiones', to_jsonb(v_dims), 'medidas', to_jsonb(v_meds),
        'filtros', p_filtros, 'excluidos', p_excluir, 'totales', tot, 'filas', filas,
        'filas_totales', coalesce(n, 0), 'recortado', coalesce(n, 0) > v_lim,
        'nota', v_nota || ' Montos en USD. precio_promedio = base ÷ unidades: solo tiene sentido dentro de un mismo producto o insumo.');
end $$;

-- ¿El usuario puede ver costos y márgenes? Administración o finanzas (y superadmin)
create or replace function public._asistente_ve_costos()
returns boolean language sql stable security definer set search_path = public as $$
    select is_superadmin()
        or exists (select 1 from usuarios where id = auth.uid() and rol in ('admin', 'finanzas'));
$$;
revoke all on function public._asistente_ve_costos() from public, anon;
grant execute on function public._asistente_ve_costos() to authenticated, service_role;

-- Expresión SQL de cada dimensión sobre las columnas normalizadas (lista cerrada)
create or replace function public._asistente_dim_sql(p_dim text)
returns text language sql immutable as $$
    select case p_dim
        when 'dia' then $x$to_char(fecha, 'YYYY-MM-DD')$x$
        when 'semana' then $x$to_char(date_trunc('week', fecha), 'YYYY-MM-DD')$x$
        when 'mes' then $x$to_char(fecha, 'YYYY-MM')$x$
        when 'trimestre' then $x$to_char(fecha, 'YYYY') || '-T' || to_char(fecha, 'Q')$x$
        when 'anio' then $x$to_char(fecha, 'YYYY')$x$
        when 'mes_entrega' then $x$coalesce(to_char(fecha_entrega, 'YYYY-MM'), '(sin fecha)')$x$
        when 'dia_entrega' then $x$coalesce(to_char(fecha_entrega, 'YYYY-MM-DD'), '(sin fecha)')$x$
        when 'cliente' then $x$coalesce(cliente, '(sin cliente)')$x$
        when 'canal' then $x$coalesce(canal, '(sin canal)')$x$
        when 'categoria_cliente_2' then $x$coalesce(cat_cliente_2, '(sin categoría)')$x$
        when 'categoria_cliente_3' then $x$coalesce(cat_cliente_3, '(sin categoría)')$x$
        when 'categoria_cliente_4' then $x$coalesce(cat_cliente_4, '(sin categoría)')$x$
        when 'vendedor' then $x$coalesce(vendedor, '(sin vendedor)')$x$
        when 'ciudad' then $x$coalesce(ciudad, '(sin ciudad)')$x$
        when 'producto' then $x$coalesce(sku || ' · ', '') || coalesce(producto, '(sin producto)')$x$
        when 'categoria_producto_1' then $x$coalesce(cat_producto_1, '(sin categoría)')$x$
        when 'categoria_producto_2' then $x$coalesce(cat_producto_2, '(sin categoría)')$x$
        when 'categoria_producto_3' then $x$coalesce(cat_producto_3, '(sin categoría)')$x$
        when 'categoria_producto_4' then $x$coalesce(cat_producto_4, '(sin categoría)')$x$
        when 'tipo_producto' then $x$coalesce(tipo_producto, '(sin tipo)')$x$
        when 'estado' then $x$coalesce(estado, '(sin estado)')$x$
        when 'metodo' then $x$coalesce(nullif(metodo, ''), '(sin método)')$x$
        when 'cuenta' then $x$coalesce(cuenta, '(sin cuenta)')$x$
        when 'proveedor' then $x$coalesce(proveedor, '(sin proveedor)')$x$
        when 'insumo' then $x$coalesce(insumo, '(sin insumo)') || coalesce(' (' || unidad || ')', '')$x$
        when 'tipo_insumo' then $x$coalesce(tipo_insumo, '(sin tipo)')$x$
        when 'tipo_gasto' then $x$coalesce(tipo_gasto, '(sin tipo)')$x$
        when 'categoria_gasto' then $x$coalesce(categoria_gasto, '(sin categoría)')$x$
        when 'tramo' then $x$tramo$x$
    end
$$;

-- Expresión SQL de cada medida (lista cerrada); redondeada para mostrar o cruda para ordenar
create or replace function public._asistente_med_sql(p_med text, p_redondear boolean)
returns text language sql immutable as $$
    select case when p_redondear and p_med in ('base', 'total', 'monto', 'saldo', 'vencido', 'ticket_promedio',
                                               'costo', 'margen', 'margen_pct')
                    then 'round((' || e || ')::numeric, 2)'
                when p_redondear and p_med in ('unidades', 'cantidad') then 'round((' || e || ')::numeric, 3)'
                when p_redondear and p_med in ('precio_promedio', 'costo_unitario') then 'round((' || e || ')::numeric, 4)'
                else e end
    from (select case p_med
        when 'base' then 'sum(base)' when 'monto' then 'sum(base)' when 'total' then 'sum(total)'
        when 'unidades' then 'sum(unidades)' when 'cantidad' then 'sum(unidades)'
        when 'notas' then 'count(distinct doc_id)' when 'pedidos' then 'count(distinct doc_id)'
        when 'cobros' then 'count(distinct doc_id)' when 'recepciones' then 'count(distinct doc_id)'
        when 'gastos' then 'count(distinct doc_id)'
        when 'clientes' then 'count(distinct cliente_id)'
        when 'productos' then 'count(distinct item_id)' when 'insumos' then 'count(distinct item_id)'
        when 'proveedores' then 'count(distinct proveedor)'
        when 'precio_promedio' then 'sum(base) / nullif(sum(unidades), 0)'
        when 'ticket_promedio' then 'sum(base) / nullif(count(distinct doc_id), 0)'
        when 'saldo' then 'sum(saldo)'
        when 'vencido' then 'coalesce(sum(saldo) filter (where dias_vencida > 0), 0)'
        when 'costo' then 'sum(costo)'
        when 'margen' then 'sum(base) - sum(costo)'
        when 'margen_pct' then '(sum(base) - sum(costo)) * 100 / nullif(sum(base), 0)'
        when 'costo_unitario' then 'sum(costo) / nullif(sum(unidades), 0)'
    end as e) t
$$;

revoke all on function public.asistente_analisis(uuid, text, text[], text[], jsonb, jsonb, date, date, text, integer) from public, anon;
grant execute on function public.asistente_analisis(uuid, text, text[], text[], jsonb, jsonb, date, date, text, integer) to authenticated, service_role;
revoke all on function public._asistente_dim_sql(text) from public, anon;
grant execute on function public._asistente_dim_sql(text) to authenticated, service_role;
revoke all on function public._asistente_med_sql(text, boolean) from public, anon;
grant execute on function public._asistente_med_sql(text, boolean) to authenticated, service_role;
