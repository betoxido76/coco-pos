-- ═══════════════════════════════════════════════════════════════════════════
-- Retenciones — Fase 6: el exportador distingue la retención (no es caja)
-- docs/plan-retenciones.md. Columnas nuevas siempre AL FINAL (CREATE OR REPLACE
-- VIEW no admite reordenar), mismas definiciones que exportador_fase3.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- Recepciones: + retenido (IVA + ISLR vigentes). `pagado` ya lo incluye.
CREATE OR REPLACE VIEW v_export_compras WITH (security_invoker = on) AS
 SELECT c.id AS compra_id,
    c.empresa_id,
    c.numero_doc,
    c.nro_doc_proveedor,
    c.fecha_compra,
    ((c.fecha_compra AT TIME ZONE 'America/Caracas'::text))::date AS fecha,
    c.estado,
    ((c.estado = 'anulada'::text) OR (c.motivo_anulacion IS NOT NULL)) AS anulada,
    c.estado_cobro,
    c.condicion_pago,
    c.dias_credito,
    c.proveedor_id,
    pr.nombre AS proveedor,
    pr.rif AS proveedor_rif,
    oc.numero_oc,
    al.nombre AS almacen,
    u.nombre AS recibido_por,
    COALESCE(c.descuento_global, (0)::numeric) AS descuento_global,
    c.base_gravada,
    c.base_exenta,
    c.iva,
    c.total,
    COALESCE(c.descuento_pago, (0)::numeric) AS descuento_pronto_pago,
    round((COALESCE(pg.pagado, (0)::numeric) + ct.contado), 2) AS pagado,
    round(COALESCE(pg.anticipos, (0)::numeric), 2) AS aplicado_anticipos,
    round(COALESCE(pg.nd, (0)::numeric), 2) AS aplicado_notas_debito,
    s.saldo,
    c.fecha_vencimiento_pago AS vencimiento,
        CASE
            WHEN ((s.saldo > (0)::numeric) AND (c.fecha_vencimiento_pago < ((now() AT TIME ZONE 'America/Caracas'::text))::date)) THEN (((now() AT TIME ZONE 'America/Caracas'::text))::date - c.fecha_vencimiento_pago)
            ELSE 0
        END AS dias_vencida,
        CASE
            WHEN ((c.estado = 'anulada'::text) OR (c.motivo_anulacion IS NOT NULL)) THEN 'anulada'::text
            WHEN (s.saldo <= 0.005) THEN 'pagado'::text
            WHEN (c.fecha_vencimiento_pago < ((now() AT TIME ZONE 'America/Caracas'::text))::date) THEN 'vencido'::text
            ELSE 'al día'::text
        END AS estatus,
    COALESCE(li.lineas, (0)::bigint) AS lineas,
    COALESCE(li.insumo_ids, '{}'::uuid[]) AS insumo_ids,
    round(COALESCE(pg.retenido, (0)::numeric), 2) AS retenido
   FROM ((((((((compras c
     LEFT JOIN proveedores pr ON ((pr.id = c.proveedor_id)))
     LEFT JOIN ordenes_compra oc ON ((oc.id = c.orden_compra_id)))
     LEFT JOIN almacenes al ON ((al.id = c.almacen_id)))
     LEFT JOIN usuarios u ON ((u.id = c.usuario_id)))
     LEFT JOIN LATERAL ( SELECT sum((p.monto_usd + (p.monto_bs / NULLIF(p.tasa_cambio, (0)::numeric)))) AS pagado,
            sum(
                CASE
                    WHEN (p.anticipo_id IS NOT NULL) THEN (p.monto_usd + (p.monto_bs / NULLIF(p.tasa_cambio, (0)::numeric)))
                    ELSE (0)::numeric
                END) AS anticipos,
            sum(
                CASE
                    WHEN (p.devolucion_proveedor_id IS NOT NULL) THEN (p.monto_usd + (p.monto_bs / NULLIF(p.tasa_cambio, (0)::numeric)))
                    ELSE (0)::numeric
                END) AS nd,
            sum(
                CASE
                    WHEN (p.retencion_id IS NOT NULL) THEN (p.monto_usd + (p.monto_bs / NULLIF(p.tasa_cambio, (0)::numeric)))
                    ELSE (0)::numeric
                END) AS retenido
           FROM pagos_proveedor p
          WHERE ((p.compra_id = c.id) AND (NOT p.anulado))) pg ON (true))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (c.condicion_pago = 'contado'::text) THEN (COALESCE(c.pago_usd, (0)::numeric) + (COALESCE(c.pago_bs, (0)::numeric) / NULLIF(c.tasa_cambio, (0)::numeric)))
                    ELSE (0)::numeric
                END AS contado) ct)
     LEFT JOIN LATERAL ( SELECT count(*) AS lineas,
            array_agg(DISTINCT ci.insumo_id) AS insumo_ids
           FROM compra_items ci
          WHERE (ci.compra_id = c.id)) li ON (true))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN ((c.estado = 'anulada'::text) OR (c.motivo_anulacion IS NOT NULL)) THEN (0)::numeric
                    ELSE round(GREATEST((0)::numeric, (((COALESCE(c.total, (0)::numeric) - COALESCE(c.descuento_pago, (0)::numeric)) - COALESCE(pg.pagado, (0)::numeric)) - COALESCE(ct.contado, (0)::numeric))), 2)
                END AS saldo) s);

CREATE OR REPLACE VIEW v_export_cartera_cxp WITH (security_invoker = on) AS
 SELECT compra_id, empresa_id, numero_doc, nro_doc_proveedor, fecha_compra, fecha, estado, anulada,
    estado_cobro, condicion_pago, dias_credito, proveedor_id, proveedor, proveedor_rif, numero_oc,
    almacen, recibido_por, descuento_global, base_gravada, base_exenta, iva, total,
    descuento_pronto_pago, pagado, aplicado_anticipos, aplicado_notas_debito, saldo, vencimiento,
    dias_vencida, estatus, lineas, insumo_ids,
    (((now() AT TIME ZONE 'America/Caracas'::text))::date - fecha) AS antiguedad_dias,
    retenido
   FROM v_export_compras d
  WHERE ((NOT anulada) AND (saldo > 0.005));

CREATE OR REPLACE VIEW v_export_compras_detalle WITH (security_invoker = on) AS
 SELECT d.compra_id, d.empresa_id, d.numero_doc, d.nro_doc_proveedor, d.fecha_compra, d.fecha, d.estado,
    d.anulada, d.estado_cobro, d.condicion_pago, d.dias_credito, d.proveedor_id, d.proveedor,
    d.proveedor_rif, d.numero_oc, d.almacen, d.recibido_por, d.descuento_global, d.base_gravada,
    d.base_exenta, d.iva, d.total, d.descuento_pronto_pago, d.pagado, d.aplicado_anticipos,
    d.aplicado_notas_debito, d.saldo, d.vencimiento, d.dias_vencida, d.estatus, d.lineas, d.insumo_ids,
    l.linea_id, l.insumo_id AS linea_insumo_id, l.tipo_insumo, l.insumo_codigo, l.insumo, l.unidad,
    l.cantidad, l.precio_base, l.descuento_item, l.aplica_iva, l.base_linea, l.iva_linea, l.total_linea,
    d.retenido
   FROM (v_export_compras_lineas l
     JOIN v_export_compras d ON ((d.compra_id = l.compra_id)));

-- Pagos a proveedor: la retención es un renglón propio que NO sale de caja
CREATE OR REPLACE VIEW v_export_pagos_proveedor WITH (security_invoker = on) AS
 SELECT ('P-'::text || (p.id)::text) AS pago_id,
    p.empresa_id,
    ((p.fecha_pago AT TIME ZONE 'America/Caracas'::text))::date AS fecha,
        CASE
            WHEN (p.anticipo_id IS NOT NULL) THEN 'aplicación de anticipo'::text
            WHEN (p.devolucion_proveedor_id IS NOT NULL) THEN 'nota de débito aplicada'::text
            WHEN (p.retencion_id IS NOT NULL) THEN
                CASE WHEN (p.metodo_usd = 'retencion_iva'::text) THEN 'retención IVA'::text ELSE 'retención ISLR'::text END
            ELSE 'pago'::text
        END AS tipo,
    ((p.anticipo_id IS NULL) AND (p.devolucion_proveedor_id IS NULL) AND (p.retencion_id IS NULL)) AS sale_de_caja,
    c.numero_doc AS recepcion,
    c.nro_doc_proveedor,
    an.numero_anticipo,
    c.proveedor_id,
    pr.nombre AS proveedor,
    pr.rif AS proveedor_rif,
    p.monto_usd,
    p.monto_bs,
    p.tasa_cambio,
    p.tipo_tasa,
    round((p.monto_usd + (p.monto_bs / NULLIF(p.tasa_cambio, (0)::numeric))), 2) AS monto_equiv_usd,
    p.metodo_usd,
    p.metodo_bs,
    cb.banco,
    cb.nombre AS cuenta,
    p.nota,
    u.nombre AS registrado_por,
    p.anulado,
    p.motivo_anulacion
   FROM (((((pagos_proveedor p
     JOIN compras c ON ((c.id = p.compra_id)))
     LEFT JOIN proveedores pr ON ((pr.id = c.proveedor_id)))
     LEFT JOIN anticipos_proveedor an ON ((an.id = p.anticipo_id)))
     LEFT JOIN cuentas_bancarias cb ON ((cb.id = p.cuenta_bancaria_id)))
     LEFT JOIN usuarios u ON ((u.id = p.usuario_id)))
UNION ALL
 SELECT ('A-'::text || (a.id)::text) AS pago_id,
    a.empresa_id,
    a.fecha,
    'anticipo pagado'::text AS tipo,
    true AS sale_de_caja,
    NULL::text AS recepcion,
    a.nro_doc_proveedor,
    a.numero_anticipo,
    a.proveedor_id,
    pr.nombre AS proveedor,
    pr.rif AS proveedor_rif,
    a.monto_usd,
    a.monto_bs,
    a.tasa_cambio,
    a.tipo_tasa,
    round(a.monto_equiv_usd, 2) AS monto_equiv_usd,
    a.metodo_usd,
    a.metodo_bs,
    cb.banco,
    cb.nombre AS cuenta,
    a.nota,
    u.nombre AS registrado_por,
    (a.estado = 'anulado'::text) AS anulado,
    a.motivo_anulacion
   FROM (((anticipos_proveedor a
     LEFT JOIN proveedores pr ON ((pr.id = a.proveedor_id)))
     LEFT JOIN cuentas_bancarias cb ON ((cb.id = a.cuenta_bancaria_id)))
     LEFT JOIN usuarios u ON ((u.id = a.usuario_id)))
UNION ALL
 SELECT ('C-'::text || (c.id)::text) AS pago_id,
    c.empresa_id,
    COALESCE(c.fecha_pago, ((c.fecha_compra AT TIME ZONE 'America/Caracas'::text))::date) AS fecha,
    'pago de contado'::text AS tipo,
    true AS sale_de_caja,
    c.numero_doc AS recepcion,
    c.nro_doc_proveedor,
    NULL::text AS numero_anticipo,
    c.proveedor_id,
    pr.nombre AS proveedor,
    pr.rif AS proveedor_rif,
    COALESCE(c.pago_usd, (0)::numeric) AS monto_usd,
    COALESCE(c.pago_bs, (0)::numeric) AS monto_bs,
    c.tasa_cambio,
    c.tipo_tasa,
    round((COALESCE(c.pago_usd, (0)::numeric) + (COALESCE(c.pago_bs, (0)::numeric) / NULLIF(c.tasa_cambio, (0)::numeric))), 2) AS monto_equiv_usd,
    c.metodo_usd,
    c.metodo_bs,
    NULL::text AS banco,
    NULL::text AS cuenta,
    NULL::text AS nota,
    u.nombre AS registrado_por,
    ((c.estado = 'anulada'::text) OR (c.motivo_anulacion IS NOT NULL)) AS anulado,
    c.motivo_anulacion
   FROM ((compras c
     LEFT JOIN proveedores pr ON ((pr.id = c.proveedor_id)))
     LEFT JOIN usuarios u ON ((u.id = c.usuario_id)))
  WHERE ((c.condicion_pago = 'contado'::text) AND ((COALESCE(c.pago_usd, (0)::numeric) > (0)::numeric) OR (COALESCE(c.pago_bs, (0)::numeric) > (0)::numeric)));

-- Gastos: + retenido (abonos de retención en `pagos`). `abonado` ya lo incluye.
CREATE OR REPLACE VIEW v_export_gastos WITH (security_invoker = on) AS
 SELECT g.id AS gasto_id,
    g.empresa_id,
    g.numero_gasto,
    g.fecha,
    tg.nombre AS tipo_gasto,
    g.categoria,
    g.nombre AS concepto,
    g.descripcion,
    g.proveedor_id,
    pr.nombre AS proveedor,
    g.numero_factura,
    g.monto_usd,
    g.monto_bs,
    g.tasa_cambio,
    g.tipo_tasa,
    t.total_usd,
    round(COALESCE(ab.abonado, (0)::numeric), 2) AS abonado,
        CASE
            WHEN ((g.motivo_anulacion IS NOT NULL) OR (g.estado = 'pagado'::text)) THEN (0)::numeric
            ELSE round(GREATEST((0)::numeric, (t.total_usd - COALESCE(ab.abonado, (0)::numeric))), 2)
        END AS saldo,
    g.estado,
    g.fecha_vencimiento AS vencimiento,
    g.metodo_pago,
    cb.banco,
    cb.nombre AS cuenta,
    (g.motivo_anulacion IS NOT NULL) AS anulado,
    g.motivo_anulacion,
    u.nombre AS registrado_por,
    round(COALESCE(ab.retenido, (0)::numeric), 2) AS retenido
   FROM ((((((gastos g
     LEFT JOIN tipos_gastos tg ON ((tg.id = g.tipo_gasto_id)))
     LEFT JOIN proveedores pr ON ((pr.id = g.proveedor_id)))
     LEFT JOIN cuentas_bancarias cb ON ((cb.id = g.cuenta_bancaria_id)))
     LEFT JOIN usuarios u ON ((u.id = g.usuario_id)))
     CROSS JOIN LATERAL ( SELECT round(
                CASE
                    WHEN (COALESCE(g.monto, (0)::numeric) > (0)::numeric) THEN g.monto
                    ELSE (COALESCE(g.monto_usd, (0)::numeric) + (COALESCE(g.monto_bs, (0)::numeric) / NULLIF(g.tasa_cambio, (0)::numeric)))
                END, 2) AS total_usd) t)
     LEFT JOIN LATERAL ( SELECT sum((p.monto_usd + (p.monto_bs / NULLIF(p.tasa_cambio, (0)::numeric)))) AS abonado,
            sum(CASE WHEN (p.retencion_id IS NOT NULL) THEN (p.monto_usd + (p.monto_bs / NULLIF(p.tasa_cambio, (0)::numeric))) ELSE (0)::numeric END) AS retenido
           FROM pagos p
          WHERE ((p.origen_tipo = 'gasto'::text) AND (p.origen_id = g.id) AND (p.empresa_id = g.empresa_id))) ab ON (true));
