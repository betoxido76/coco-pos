-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 5 — La reversa de inventario al anular una NC pasa por el motor.
--
-- APLICADO EN PRODUCCIÓN (migración anular_nc_restaurar_calculo_cobrado).
-- Este archivo queda como registro de lo que quedó vivo en la base.
--
-- Qué cambia respecto a notas_credito_fase4.sql: SOLO el paso 3. Antes hacía
--
--     UPDATE stock_ubicacion SET cantidad = cantidad - r.cantidad_devuelta
--     WHERE ... almacen_id = v_almacen AND almacen_ubicacion_id IS NULL;
--
-- sin verificar que esa fila existiera ni que alcanzara. Si el almacén era otro
-- o la fila no estaba, el UPDATE afectaba 0 filas, stock_actual bajaba igual y
-- el inventario quedaba descuadrado sin aviso. mover_stock valida contra el
-- almacén y, con permitir_faltante en false, lanza y deshace todo.
--
-- El chequeo previo contra stock_actual se conserva porque da un mensaje mucho
-- más claro que el genérico del motor.
--
-- NOTA para quien lea el historial: una primera versión de esta migración
-- reescribió la función entera de memoria y simplificó el paso 2, omitiendo
-- ventas.pago_usd/pago_bs. Eso habría marcado como 'pendiente' facturas de
-- contado ya pagadas al anular una NC. Se detectó comparando contra el
-- original y se corrigió minutos después; no hubo ninguna NC anulada en ese
-- intervalo. El paso 2 de abajo es idéntico al de notas_credito_fase4.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- (Definición vigente: ver migración anular_nc_restaurar_calculo_cobrado en
-- el historial de Supabase. Se reproduce aquí solo el paso 3, que es el
-- único que difiere de notas_credito_fase4.sql.)

--     IF v_afecta THEN
--         FOR r IN
--             SELECT di.producto_id, di.cantidad_devuelta, pt.nombre, pt.sku, pt.stock_actual
--             FROM devolucion_items di
--             JOIN productos_terminados pt ON pt.id = di.producto_id
--             WHERE di.devolucion_id = p_nc_id
--               AND di.tipo_linea = 'producto' AND di.producto_id IS NOT NULL
--               AND COALESCE(pt.tipo_producto, '') <> 'servicio'
--         LOOP
--             IF r.stock_actual < r.cantidad_devuelta THEN
--                 RAISE EXCEPTION
--                     'No se puede revertir: % (%) tiene % en existencia y la nota repuso %. Ajusta el inventario y reintenta.',
--                     r.nombre, r.sku, r.stock_actual, r.cantidad_devuelta;
--             END IF;
--
--             PERFORM mover_stock(
--                 'producto_terminado', r.producto_id, r.cantidad_devuelta,
--                 'salida', 'anulacion_nc', v_almacen, false,
--                 'Anulación de NC: ' || p_motivo, v_usuario, now());
--         END LOOP;
--     END IF;

-- Verificación de que lo aplicado es lo esperado:
SELECT (pg_get_functiondef(oid) ILIKE '%v.pago_usd%')            AS conserva_pago_de_la_venta,
       (pg_get_functiondef(oid) ILIKE '%mover_stock(%')          AS usa_el_motor,
       (pg_get_functiondef(oid) ILIKE '%UPDATE stock_ubicacion%') AS escribe_ubicacion_a_mano
FROM pg_proc WHERE proname = 'anular_nota_credito';
