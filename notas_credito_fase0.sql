-- ============================================================================
-- Notas de Crédito — FASE 0 (fundaciones de datos)
--
-- Contexto: hoy una NC solo puede nacer de una devolución física de mercancía.
-- Los dos únicos emisores (Ventas.jsx: FormDevolucion y AutorizarDevolucion)
-- exigen venta_id y reponen inventario incondicionalmente. El cliente necesita
-- emitir NC por descuento promocional o vencimiento desechado en sitio, donde
-- no hay mercancía de por medio ni necesariamente una factura de referencia.
--
-- Diseño: `devoluciones` deja de ser "la devolución" para pasar a ser el
-- documento de devolución/crédito, con tres ejes hoy colapsados en
-- `tipo_devolucion` y ahora independientes:
--
--   afecta_inventario  ¿entra mercancía al almacén?
--   genera_credito     ¿produce crédito aplicable en CxC?
--   venta_id           ¿contra qué factura? (ahora opcional)
--
-- Eso corrige de paso el bug de doble compensación: una devolución resuelta
-- con "Reposición de stock" (se le manda mercancía nueva al cliente) generaba
-- ADEMÁS una NC aplicable, regalando el crédito dos veces.
--
-- El saldo de la NC NO se almacena: se deriva de `cobros` con devolucion_id,
-- igual que el saldo de una factura se deriva de sus cobros en CxC. Por eso no
-- se crea tabla de aplicaciones: `cobros` ya es el libro de aplicaciones.
--
-- Correr una sola vez en el SQL Editor de Supabase. Es idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Catálogo de motivos por empresa (editable por el usuario).
-- afecta_inventario_default / genera_credito_default precargan el formulario
-- de emisión; el usuario puede sobreescribirlos por documento.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motivos_nc (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id                uuid NOT NULL REFERENCES empresas(id),
    nombre                    text NOT NULL,
    descripcion               text,
    afecta_inventario_default boolean NOT NULL DEFAULT false,
    genera_credito_default    boolean NOT NULL DEFAULT true,
    activo                    boolean NOT NULL DEFAULT true,
    orden                     integer DEFAULT 0,
    created_at                timestamptz DEFAULT now(),
    CONSTRAINT motivos_nc_empresa_nombre_key UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_motivos_nc_empresa
    ON motivos_nc (empresa_id, activo, orden);


-- ----------------------------------------------------------------------------
-- PASO 2 — RLS (patrón estándar del proyecto: get_empresa_id() + is_superadmin()).
-- ----------------------------------------------------------------------------
ALTER TABLE motivos_nc ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS motivos_nc_select ON motivos_nc;
CREATE POLICY motivos_nc_select ON motivos_nc
    FOR SELECT USING (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS motivos_nc_insert ON motivos_nc;
CREATE POLICY motivos_nc_insert ON motivos_nc
    FOR INSERT WITH CHECK (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS motivos_nc_update ON motivos_nc;
CREATE POLICY motivos_nc_update ON motivos_nc
    FOR UPDATE USING (empresa_id = get_empresa_id() OR is_superadmin());

DROP POLICY IF EXISTS motivos_nc_delete ON motivos_nc;
CREATE POLICY motivos_nc_delete ON motivos_nc
    FOR DELETE USING (empresa_id = get_empresa_id() OR is_superadmin());


-- ----------------------------------------------------------------------------
-- PASO 3 — Sembrar los motivos base en TODAS las empresas.
-- ON CONFLICT DO NOTHING: re-ejecutar no pisa lo que el usuario ya editó.
-- ----------------------------------------------------------------------------
INSERT INTO motivos_nc (empresa_id, nombre, descripcion, afecta_inventario_default, genera_credito_default, orden)
SELECT e.id, m.nombre, m.descripcion, m.afecta_inv, m.genera_cred, m.orden
FROM empresas e
CROSS JOIN (VALUES
    ('Devolución de mercancía', 'El cliente devuelve producto que reingresa al almacén',            true,  true,  1),
    ('Vencimiento en cliente',  'Producto vencido desechado en sitio, no regresa al almacén',       false, true,  2),
    ('Descuento promocional',   'Bonificación o rebate comercial sin devolución de producto',       false, true,  3),
    ('Diferencia de precio',    'Ajuste por precio facturado mayor al pactado',                     false, true,  4),
    ('Error de facturación',    'Corrección de un error en el documento emitido',                   false, true,  5)
) AS m(nombre, descripcion, afecta_inv, genera_cred, orden)
ON CONFLICT (empresa_id, nombre) DO NOTHING;


-- ----------------------------------------------------------------------------
-- PASO 4 — `devoluciones`: desacoplar de la venta y separar los tres ejes.
--
-- venta_id pasa a ser opcional (NC sin referencia, a cuenta del cliente).
-- El DROP NOT NULL es no-op si la columna ya era nullable.
-- ----------------------------------------------------------------------------
ALTER TABLE devoluciones
    ALTER COLUMN venta_id DROP NOT NULL;

ALTER TABLE devoluciones
    ADD COLUMN IF NOT EXISTS origen            text NOT NULL DEFAULT 'devolucion',
    ADD COLUMN IF NOT EXISTS motivo_tipo_id    uuid REFERENCES motivos_nc(id),
    ADD COLUMN IF NOT EXISTS afecta_inventario boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS genera_credito    boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS subtotal          numeric,
    ADD COLUMN IF NOT EXISTS iva               numeric,
    ADD COLUMN IF NOT EXISTS fecha_emision     date NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS tasa_cambio       numeric,
    ADD COLUMN IF NOT EXISTS tipo_tasa         text,
    ADD COLUMN IF NOT EXISTS referencia_fiscal text,
    ADD COLUMN IF NOT EXISTS aprobada_por      uuid,
    ADD COLUMN IF NOT EXISTS fecha_aprobacion  timestamptz;

COMMENT ON COLUMN devoluciones.referencia_fiscal IS
    'N° de la factura fiscal externa que afecta esta NC. El sistema emite Notas '
    'de Entrega, no facturas fiscales: cuando la NC respalda un documento fiscal '
    'emitido por fuera, su número se registra aquí. Texto libre, independiente de venta_id.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.devoluciones'::regclass AND conname = 'devoluciones_origen_check'
    ) THEN
        ALTER TABLE devoluciones ADD CONSTRAINT devoluciones_origen_check
            CHECK (origen IN ('devolucion', 'manual'));
    END IF;
END $$;

-- Índice para el saldo a favor por cliente (Fase 3) y el selector de NC al cobrar.
CREATE INDEX IF NOT EXISTS idx_devoluciones_credito_cliente
    ON devoluciones (empresa_id, cliente_id, estado_nc)
    WHERE genera_credito = true;


-- ----------------------------------------------------------------------------
-- PASO 4b — BACKFILL: cerrar los créditos fantasma por reposición de stock.
--
-- Diagnóstico en producción al 2026-08-30 (9 filas en 3 empresas; Grupo Meraki
-- no tiene ninguna): 7 devoluciones resueltas como 'reposicion_stock' —al
-- cliente ya se le envió mercancía nueva— quedaron además con
-- estado_nc='pendiente', es decir como crédito aplicable. Son $449 que el
-- sistema le ofrecería al cajero como descuento en la próxima cobranza, encima
-- de la mercancía que el cliente ya recibió.
--
--   Cocos Altamira                $12.00   Super Frenos Chaguaramos  $45.00
--   Empresa de Cocos              $12.00   ·  NC-000002              $40.00
--                                          ·  NC-000004             $195.00
--                                          ·  NC-000005              $75.00
--                                          ·  NC-000006              $70.00
--
-- Ninguna se había aplicado todavía (0 filas en cobros con su devolucion_id),
-- así que no hay daño consumado que revertir: solo se cierra la exposición.
--
-- NO se borra ni se anula nada — la devolución conserva su historia completa,
-- solo deja de ofrecerse como crédito. Las tres filas sin numero_nc son
-- anteriores a la funcionalidad de NC y también entran: no se ven en el tab de
-- NC (que filtra por numero_nc) pero sí las ofrece el selector del modal de
-- cobro, que solo filtra por estado_nc.
--
-- El corte por created_at acota el backfill a lo preexistente: de aquí en
-- adelante el frontend escribe genera_credito explícitamente por documento.
-- ----------------------------------------------------------------------------
UPDATE devoluciones
SET genera_credito = false
WHERE tipo_devolucion = 'reposicion_stock'
  AND created_at < DATE '2026-08-31';


-- ----------------------------------------------------------------------------
-- PASO 5 — `devolucion_items`: líneas de valor sin producto.
--
-- tipo_linea='producto' → producto_id + cantidad_devuelta + precio_unitario
-- tipo_linea='valor'    → concepto + precio_unitario (cantidad = 1)
--
-- aplica_iva se guarda POR LÍNEA (decisión A1: en una misma NC conviven
-- productos que aplican IVA y productos que no). Es snapshot, igual que en
-- venta_items y solicitud_devolucion_items: no se lee del catálogo al reportar.
-- ----------------------------------------------------------------------------
ALTER TABLE devolucion_items
    ALTER COLUMN producto_id DROP NOT NULL;

ALTER TABLE devolucion_items
    ADD COLUMN IF NOT EXISTS tipo_linea text NOT NULL DEFAULT 'producto',
    ADD COLUMN IF NOT EXISTS concepto   text,
    ADD COLUMN IF NOT EXISTS aplica_iva boolean;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.devolucion_items'::regclass AND conname = 'devolucion_items_tipo_linea_check'
    ) THEN
        ALTER TABLE devolucion_items ADD CONSTRAINT devolucion_items_tipo_linea_check
            CHECK (tipo_linea IN ('producto', 'valor'));
    END IF;

    -- Una línea de producto necesita producto_id; una de valor necesita concepto.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.devolucion_items'::regclass AND conname = 'devolucion_items_linea_coherente_check'
    ) THEN
        ALTER TABLE devolucion_items ADD CONSTRAINT devolucion_items_linea_coherente_check
            CHECK (
                (tipo_linea = 'producto' AND producto_id IS NOT NULL) OR
                (tipo_linea = 'valor'    AND concepto IS NOT NULL AND btrim(concepto) <> '')
            );
    END IF;
END $$;


-- ----------------------------------------------------------------------------
-- PASO 6 — estado_nc admite aplicación parcial.
--
-- Hoy aplicar una NC es todo-o-nada: CuentasCobrar.jsx inserta un cobro por el
-- monto completo y marca 'aplicada'. Con saldo derivado, una NC de $500 puede
-- aplicarse $300 a una factura y quedar 'parcial' con $200 disponibles.
-- Se dropea el CHECK sea cual sea su nombre, igual que en anular_nota_no_despachada.sql.
-- ----------------------------------------------------------------------------
DO $$
DECLARE c text;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.devoluciones'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%estado_nc%'
    LOOP
        EXECUTE format('ALTER TABLE devoluciones DROP CONSTRAINT %I', c);
    END LOOP;

    ALTER TABLE devoluciones ADD CONSTRAINT devoluciones_estado_nc_check
        CHECK (estado_nc IN ('pendiente', 'parcial', 'aplicada', 'reembolsada', 'anulada'));
END $$;


-- ----------------------------------------------------------------------------
-- PASO 7 — Verificación. Debe devolver una fila por empresa con 5 motivos,
-- y las columnas nuevas presentes.
-- ----------------------------------------------------------------------------
SELECT e.nombre AS empresa, count(m.id) AS motivos
FROM empresas e LEFT JOIN motivos_nc m ON m.empresa_id = e.id
GROUP BY e.nombre ORDER BY e.nombre;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'devoluciones'
  AND column_name IN ('venta_id','origen','motivo_tipo_id','afecta_inventario',
                      'genera_credito','subtotal','iva','fecha_emision','tasa_cambio',
                      'tipo_tasa','referencia_fiscal')
ORDER BY column_name;

-- Backfill: las 7 reposiciones deben quedar en genera_credito=false, y solo
-- NC-000001 ($200, nota_credito) y NC-000003 ($80, reembolso) siguen vivas.
SELECT e.nombre AS empresa, d.numero_nc, d.tipo_devolucion, d.estado_nc,
       d.monto_devuelto, d.genera_credito
FROM devoluciones d JOIN empresas e ON e.id = d.empresa_id
ORDER BY e.nombre, d.fecha;

SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'devolucion_items'
  AND column_name IN ('producto_id','tipo_linea','concepto','aplica_iva')
ORDER BY column_name;
