# Plan — Requisiciones de materiales (consumo interno)

Estado: **aprobado para ejecutar** (2026-09-29). Fase por fase; cada una se
despliega y se prueba antes de la siguiente.

## El problema

Los ítems que no están en recetas ni se venden (en Meraki, casi todo el almacén
"Consumibles": Lermon, agua potable…) no tienen forma de salir del inventario
salvo un ajuste (borra el porqué) o una merma (lo registra como pérdida). Datos
al 2026-09-29: 25 consumibles activos, 0 en recetas, y en todo el historial
**solo entradas** (9 recepciones) y una transferencia; **cero salidas por consumo**.
El stock de consumibles solo crece.

## El modelo (patrón SAP "salida a centro de costo" / "vale de salida de almacén")

- Documento **RQ-000001**: quién pide (usuario), para qué **área**, de qué
  almacén, qué ítems y cuánto.
- **Pendiente** al crearse: no mueve inventario.
- **Entregada** cuando almacén la despacha: confirma cantidades reales (pueden
  ser menores) y el stock baja por el motor (`mover_stock_lote`, origen
  `requisicion`, nota con el RQ y el área). Se congela el costo unitario.
- **Anulada**: si estaba pendiente, sin efecto; si estaba entregada, el stock
  vuelve con un reverso (origen `anulacion_requisicion`). Motivo obligatorio.
- Vale **imprimible** con firmas: solicitado por / entregado por / recibido por.
- No se monta sobre la OC (mezclaría obligaciones con proveedores y salidas
  internas), pero se ve igual: número, líneas, estados, detalle imprimible.

## Fase 0 — Decisiones (CERRADA 2026-09-29)

| # | Decisión | Resultado |
|---|---|---|
| 0.1 | ¿Aprobación? | **No** por ahora: pendiente → entregada |
| 0.2 | ¿Quién solicita? | **Un usuario del sistema** (el que crea la RQ) |
| 0.3 | ¿Dónde vive? | **Módulo propio `requisiciones`**: los solicitantes no ven inventario |
| 0.4 | Áreas | Producción, Limpieza, Administración, Calidad; **editables por empresa** |
| 0.5 | Permisos (propuesto) | Solicitar: módulo `requisiciones`. **Entregar** (mueve stock): módulo `inventario`. Anular pendiente: el solicitante o inventario. Anular entregada: inventario |
| 0.6 | Qué se pide | Consumibles por defecto; también MP/ME/PT (uso interno) |
| 0.7 | Stock en pantalla | Solo se muestra a quien tiene `inventario` |

## Fase 1 — Base de datos (`requisiciones.sql`)

1. `areas_consumo` (id, empresa_id, nombre, activa) — único por empresa + nombre.
   RLS por empresa con escritura desde la app (son editables). Siembra de las 4
   áreas para todas las empresas existentes.
2. `requisiciones` (numero_requisicion, fecha, solicitante_id → usuarios,
   area_id, almacen_id, estado CHECK pendiente|entregada|anulada, notas,
   entregado_por, fecha_entrega, anulado_por, fecha_anulacion, motivo_anulacion).
3. `requisicion_items` (tipo_item, item_id, item_nombre/codigo/unidad como foto,
   cantidad_solicitada > 0, cantidad_entregada, costo_unitario al entregar).
4. RLS: lectura por empresa; **escritura solo por RPC** (sin políticas de
   INSERT/UPDATE), como los anticipos.
5. RPCs SECURITY DEFINER, cada una en una transacción:
   - `crear_requisicion(area, almacén, notas, items)` — numeración RQ con lock,
     valida ítems y permisos.
   - `entregar_requisicion(id, items[{id, cantidad_entregada}], permitir_faltante)`
     — `mover_stock_lote` salida; congela costo; estado entregada.
   - `anular_requisicion(id, motivo)` — reverso si estaba entregada.
6. Registrar el módulo `requisiciones` en `modulos` (se activa por empresa desde
   SuperAdmin, como los demás).
7. Pruebas en producción con BEGIN … ROLLBACK (crear, entregar parcial, stock
   baja en el almacén, anular con reverso, permisos, faltante).

## Fase 2 — Pantalla (`/requisiciones`)

- Listado con filtros (`FiltroCombo`): área, estado, solicitante, ítem.
- **Nueva requisición**: área, almacén, ítems (consumibles primero) y cantidades.
- **Detalle imprimible** con firmas.
- **Entregar** (solo con `inventario`): cantidades a entregar, stock del almacén,
  aviso de faltante.
- **Anular** con motivo.
- **Áreas**: alta/edición/desactivación en el mismo módulo.
- Sidebar + ruta protegida por el módulo.

## Fase 3 — Reporte

Consumo valorizado (costo congelado al entregar) por área, ítem y período.

## Fase 4 — Cierre

CLAUDE.md, esquema, memoria, recorrido con Meraki y lámina de capacitación.

## Aviso previo al uso

El stock de consumibles lleva meses sin descontar consumos: probablemente está
inflado. **Conteo físico del almacén Consumibles** antes (o al arrancar) de usar
requisiciones; si no, se descuenta desde un número irreal.
