-- Días promedio de pago (CxC): una fila por nota PAGADA con los días que tardó en
-- cobrarse, ponderados por el dinero de cada abono, y el plazo que tenía.
-- docs/plan-dias-pago.md
--
-- · Solo dinero: no cuentan retenciones, NC aplicadas ni diferencial cambiario.
-- · Cada abono pesa por su monto en USD: días = Σ(días_abono × monto) / Σ monto.
-- · Días por día calendario en hora de Venezuela; un abono anterior a la nota cuenta 0.
-- · Ventas de contado sin registro de cobro (pagadas en el acto) o con el pago en la
--   propia venta (pago_usd/pago_bs, migradas): 0 días.
-- · Plazo = vencimiento − emisión; sin vencimiento, los días de crédito del cliente
--   si es a crédito, si no 0.
-- · Notas en $0 fuera.
create or replace view public.v_cxc_dias_pago
with (security_invoker = true) as
with dinero as (
    select c.venta_id,
           sum(c.monto_usd_eq) as monto,
           sum(c.monto_usd_eq * c.dias) as dias_x_monto
    from (
        select c.venta_id,
               coalesce(c.monto_usd, 0) + coalesce(c.monto_bs, 0) / nullif(c.tasa_cambio, 0) as monto_usd_eq,
               greatest(0, (coalesce(c.fecha_cobro, c.created_at) at time zone 'America/Caracas')::date
                         - (v.created_at at time zone 'America/Caracas')::date) as dias
        from public.cobros c
        join public.ventas v on v.id = c.venta_id
        where c.retencion_id is null and c.devolucion_id is null and c.diferencial_id is null
    ) c
    group by c.venta_id
),
otros as (
    select venta_id,
           bool_or(retencion_id is not null) as tiene_retencion,
           coalesce(sum(monto_usd) filter (where diferencial_id is not null), 0) as monto_diferencial
    from public.cobros
    group by venta_id
)
select v.id,
       v.empresa_id,
       v.cliente_id,
       v.created_at,
       v.fecha_vencimiento_pago,
       v.numero_factura,
       v.nro_referencia,
       v.oc_cliente,
       v.usuario_id,
       p.vendedor_id,
       v.total,
       cl.nombre as cliente_nombre,
       cl.rif as cliente_rif,
       cl.condicion_pago,
       cl.dias_credito,
       cl.contribuyente_especial,
       cl.paga_indexado,
       cl.cat1_id, cl.cat2_id, cl.cat3_id, cl.cat4_id,
       coalesce(o.tiene_retencion, false) as tiene_retencion,
       coalesce(o.monto_diferencial, 0) as monto_diferencial,
       -- Dinero cobrado y sus días ponderados
       case when coalesce(d.monto, 0) > 0 then d.monto
            when coalesce(v.pago_usd, 0) + coalesce(v.pago_bs, 0) / nullif(v.tasa_cambio, 0) > 0
                 then coalesce(v.pago_usd, 0) + coalesce(v.pago_bs, 0) / nullif(v.tasa_cambio, 0)
            when d.venta_id is null and o.venta_id is null then v.total
            else 0 end as monto_dinero,
       case when coalesce(d.monto, 0) > 0 then round(d.dias_x_monto / d.monto, 2) else 0 end as dias_pago,
       coalesce(v.fecha_vencimiento_pago - (v.created_at at time zone 'America/Caracas')::date,
                case when cl.condicion_pago = 'credito' then cl.dias_credito end, 0) as plazo_dias
from public.ventas v
left join public.clientes cl on cl.id = v.cliente_id
left join public.pedidos p on p.id = v.pedido_id
left join dinero d on d.venta_id = v.id
left join otros o on o.venta_id = v.id
where v.estado_cobro = 'pagado' and v.total > 0;

grant select on public.v_cxc_dias_pago to authenticated, service_role;
