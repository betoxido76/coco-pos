-- Asistente IA: dimensión "sucursal" (dirección de entrega) — 2026-11-26
-- Caso Meraki: "¿Cuáles son las principales sucursales de Gama entre julio y agosto?"
-- Las vistas v_export_* ya traen direccion_entrega_nombre; faltaba exponerla en las herramientas.
--
-- Se aplican reemplazos puntuales sobre la definición VIGENTE de cada función (no se reescriben de
-- memoria) y cada reemplazo verifica cuántas veces calza; si no, aborta sin tocar nada.

-- 1) Expresión SQL de la dimensión
CREATE OR REPLACE FUNCTION public._asistente_dim_sql(p_dim text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
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
        when 'sucursal' then $x$coalesce(sucursal, '(sin dirección de entrega)')$x$
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
$function$;

-- 2) asistente_analisis (ventas, pedidos y cartera) y 3) asistente_ventas_resumen
CREATE OR REPLACE FUNCTION pg_temp._reemplazar(p_def text, p_viejo text, p_nuevo text, p_veces int)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
BEGIN
    IF n <> p_veces THEN
        RAISE EXCEPTION 'Reemplazo no calza (% de % veces): %', n, p_veces, p_viejo;
    END IF;
    RETURN replace(p_def, p_viejo, p_nuevo);
END $f$;

DO $mig$
DECLARE v_def text;
BEGIN
    -- asistente_analisis
    v_def := pg_get_functiondef('public.asistente_analisis(uuid,text,text[],text[],jsonb,jsonb,date,date,text,integer)'::regprocedure);
    IF position('sucursal' in v_def) > 0 THEN RAISE EXCEPTION 'asistente_analisis ya tiene sucursal'; END IF;
    -- columna en las fuentes ventas, pedidos y cartera
    v_def := pg_temp._reemplazar(v_def, 'direccion_ciudad as ciudad,',
                                 'direccion_ciudad as ciudad, direccion_entrega_nombre as sucursal,', 3);
    -- dimensión válida en esas tres fuentes
    v_def := pg_temp._reemplazar(v_def, '''vendedor'', ''ciudad''', '''vendedor'', ''ciudad'', ''sucursal''', 3);
    EXECUTE v_def;

    -- asistente_ventas_resumen
    v_def := pg_get_functiondef('public.asistente_ventas_resumen(uuid,date,date,text,uuid,uuid,uuid,text,text,text,boolean,integer)'::regprocedure);
    IF position('sucursal' in v_def) > 0 THEN RAISE EXCEPTION 'asistente_ventas_resumen ya tiene sucursal'; END IF;
    v_def := pg_temp._reemplazar(v_def, '''canal'', ''ciudad'', ''producto''', '''canal'', ''ciudad'', ''sucursal'', ''producto''', 1);
    v_def := pg_temp._reemplazar(v_def,
        'when ''ciudad'' then coalesce(v.direccion_ciudad, ''(sin ciudad)'')',
        'when ''ciudad'' then coalesce(v.direccion_ciudad, ''(sin ciudad)'')
               when ''sucursal'' then coalesce(v.direccion_entrega_nombre, ''(sin dirección de entrega)'')', 1);
    -- la sucursal también en el detalle de notas
    v_def := pg_temp._reemplazar(v_def, 'v.vendedor, v.estado_cobro,',
                                 'v.vendedor, v.estado_cobro, v.direccion_entrega_nombre as sucursal,', 1);
    v_def := pg_temp._reemplazar(v_def, '''vendedor'', vendedor,
                ''estado_cobro''', '''vendedor'', vendedor, ''sucursal'', sucursal,
                ''estado_cobro''', 1);
    v_def := pg_temp._reemplazar(v_def, 'group by venta_id, numero_factura, fecha, cliente, vendedor, estado_cobro',
                                 'group by venta_id, numero_factura, fecha, cliente, vendedor, sucursal, estado_cobro', 1);
    EXECUTE v_def;
END $mig$;
