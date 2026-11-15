-- Encabezados sin base imponible (base_gravada / base_exenta / iva en NULL): 14 notas de entrega,
-- 1 recepción (REC-000061) y 2 NC de Meraki, todas del 2026-10-05 (versión vieja de la app en caché).
-- La app los lee bien (totalesGuardados calcula desde el total), pero las vistas v_export_* y el
-- asistente suman NULL = 0. Se completan desde sus líneas; el total NO cambia (iva = total − base).
-- Solo toca filas con base_gravada NULL.

-- Notas de entrega: todas sus líneas son exentas → base_exenta = total
update ventas v set
    base_gravada = x.bg, base_exenta = x.be, iva = round(v.total - x.bg - x.be, 2)
from (select l.venta_id,
             round(coalesce(sum(l.base_linea) filter (where l.aplica_iva), 0), 2) as bg,
             round(coalesce(sum(l.base_linea) filter (where not l.aplica_iva), 0), 2) as be
      from v_export_ventas_lineas l group by l.venta_id) x
where x.venta_id = v.id and v.base_gravada is null;

-- REC-000061: líneas gravadas, base 2.210,34; IVA = 2.564,00 − 2.210,34
update compras c set
    base_gravada = x.bg, base_exenta = x.be, iva = round(c.total - x.bg - x.be, 2)
from (select l.compra_id,
             round(coalesce(sum(l.base_linea) filter (where l.aplica_iva), 0), 2) as bg,
             round(coalesce(sum(l.base_linea) filter (where not l.aplica_iva), 0), 2) as be
      from v_export_compras_lineas l group by l.compra_id) x
where x.compra_id = c.id and c.base_gravada is null;

-- 2 NC manuales con líneas exentas e IVA 0 → base_exenta = subtotal
update devoluciones set base_gravada = 0, base_exenta = subtotal
where base_gravada is null and coalesce(iva, 0) = 0 and subtotal = monto_devuelto;
