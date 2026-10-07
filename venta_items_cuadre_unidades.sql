-- ═══════════════════════════════════════════════════════════════════════════
-- Candado: la cantidad de una línea de nota debe cuadrar con sus unidades
-- primarias (cantidad × factor de la unidad de venta = cantidad_primaria).
--
-- Origen: NE-001226 (Meraki, 2026-10-02) se facturó con 30 CAJAS en vez de 3:
-- la versión vieja de "Facturar pedido" usaba lo alistado (unidades) como
-- cantidad de cajas. El arreglo (1a859fa) ya estaba publicado, pero la pestaña
-- del usuario seguía con el código anterior en caché (PWA). Este candado hace
-- que ese error no pueda guardarse aunque el navegador tenga una versión vieja.
-- Mismo criterio de unidad que src/lib/facturacion.js (esLineaUM2/factorLinea).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _venta_item_cuadra_unidades()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_uv2 text; v_factor numeric; v_f numeric := 1;
BEGIN
    IF NEW.cantidad_primaria IS NULL OR NEW.producto_id IS NULL THEN RETURN NEW; END IF;
    SELECT unidad_venta_2, factor_conversion_2 INTO v_uv2, v_factor
      FROM productos_terminados WHERE id = NEW.producto_id;
    IF COALESCE(v_factor, 1) > 1
       AND NEW.unidad_venta IS NOT NULL
       AND (NEW.unidad_venta = '2' OR (v_uv2 IS NOT NULL AND NEW.unidad_venta = v_uv2)) THEN
        v_f := v_factor;
    END IF;
    IF abs(NEW.cantidad * v_f - NEW.cantidad_primaria) > 0.01 THEN
        RAISE EXCEPTION 'La línea no cuadra: % % × % = % unidades, pero se registraron % unidades. Recarga la página (puede estar abierta una versión vieja de la app) e intenta de nuevo.',
            NEW.cantidad, COALESCE(NEW.unidad_venta, ''), v_f, NEW.cantidad * v_f, NEW.cantidad_primaria;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS venta_items_cuadra_unidades ON venta_items;
CREATE TRIGGER venta_items_cuadra_unidades
  BEFORE INSERT OR UPDATE OF cantidad, cantidad_primaria, unidad_venta, producto_id ON venta_items
  FOR EACH ROW EXECUTE FUNCTION _venta_item_cuadra_unidades();

-- ── Ajuste de NE-001226 (PED-001294, Distribuidora Kala) ────────────────────
-- 3 cajas × $39,90 = $119,70 exento. Sin cobros, NC ni devoluciones. El
-- inventario salió bien (30 unidades) y no se toca.
UPDATE venta_items
   SET cantidad = 3, base_linea = 119.70
 WHERE id = '358d4221-0914-4165-93ea-6b3174555e8b'
   AND cantidad = 30 AND cantidad_primaria = 30;

UPDATE ventas
   SET subtotal = 119.70, base_gravada = 0, base_exenta = 119.70, iva = 0, total = 119.70
 WHERE id = '6e480c2b-782e-4ef1-be0e-f0d16e991434'
   AND numero_factura = 'NE-001226' AND total = 1197.00;

-- El pedido facturado toma los montos de su nota
SELECT recalcular_totales_pedido('f7b2e12f-3878-40bd-ba24-d7cd11c8efd3');
