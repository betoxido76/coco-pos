-- Notas de crédito de proveedores — Fase 4: el exportador las nombra así
-- (antes 'nota de débito aplicada'). docs/plan-nc-proveedores.md

CREATE OR REPLACE VIEW v_export_pagos_proveedor WITH (security_invoker = on) AS
 SELECT ('P-'::text || (p.id)::text) AS pago_id,
    p.empresa_id,
    ((p.fecha_pago AT TIME ZONE 'America/Caracas'::text))::date AS fecha,
        CASE
            WHEN (p.anticipo_id IS NOT NULL) THEN 'aplicación de anticipo'::text
            WHEN (p.devolucion_proveedor_id IS NOT NULL) THEN 'nota de crédito aplicada'::text
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
