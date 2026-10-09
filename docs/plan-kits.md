# Plan: kits (productos terminados armados con otros productos terminados)

Estado: **borrador para validar** (2026-10-09)

## Problema

Meraki va a sacar productos que son un mix de PT existentes (p. ej. helado +
agua + aceite en una caja). Hoy una receta solo acepta materia prima, empaque y
consumibles: la base lo impide (`CHECK` en `receta_items` y `lote_consumos`) y
Producción trata solo el par MP / Empaque.

## Respuestas de Meraki (2026-10-09)

| Pregunta | Respuesta | Consecuencia |
|---|---|---|
| ¿Se arma antes y se guarda, o al despachar? | **Antes, y se guarda** | El kit tiene stock propio: se descarta el kit "virtual" que se descompone al vender. |
| ¿Desarmar kits? | Podría ocurrir; aún no hay kit | Fuera de esta primera versión. Se puede resolver con un ajuste de inventario o, más adelante, con una orden inversa. |
| ¿Frecuencia y volumen? | No se sabe | Se incluye el armado rápido: el flujo de 3 pasos es demasiado para un armado de minutos. |
| ¿Vencimiento del kit? | **Lo fijan ellos** | Se pide al armar, como hoy al cerrar una orden. No se calcula de los componentes. |

## Enfoque

**El kit es un PT normal con receta**, y armarlo es producirlo. Se extienden
Recetas y Producción para aceptar productos terminados como insumo (opción A),
en la misma página de Recetas. Una receta puede mezclar PT + MP + empaque.

- El kit se vende como cualquier PT, con su precio en la lista: **no toca
  facturación, NC ni despacho**.
- Orden, consumos, lote, vencimiento y almacenes ya existen y se reutilizan.

## Reglas

1. **Sin faltante de PT.** El consumo de MP/ME hoy permite stock negativo
   (`permitirFaltante`); para un componente PT se **bloquea**: no se arma un kit
   con helados que no existen. Se valida en la pantalla y en la base.
2. **Sin ciclos.** Un PT no puede estar en su propia receta, ni de forma
   indirecta (kit A contiene kit B que contiene A). Lo valida la base.
3. **Kit de kits** está permitido mientras no haya ciclo.
4. Las cantidades del componente PT van en su unidad de inventario
   (`unidad_medida` del PT), igual que MP y empaque.
5. **Costo:** el sistema hoy no calcula el costo de lo producido (cerrar una
   orden no actualiza `costo_promedio`). El kit queda igual. Tema aparte.

## Fases

| Fase | Contenido |
|---|---|
| 1 — Base de datos | `producto_terminado` en los `CHECK` de `receta_items` y `lote_consumos`. Trigger contra ciclos (CTE recursiva sobre recetas de PT). Revisar `mover_stock_lote`: faltante permitido **por ítem** (PT no, MP/ME sí) en una sola transacción, o validación previa del stock de PT. Pruebas en BEGIN/ROLLBACK. |
| 2 — Recetas | Tercer tipo de insumo "Producto terminado" en el editor (excluye al propio producto). Etiqueta de color propia. |
| 3 — Producción | Generalizar consumo planificado y real a MP / Empaque / PT: selectores, etiquetas, cierre (`moverStockLote`), detalle de la orden. Aviso y bloqueo de faltante de PT. |
| 4 — Armado rápido | En Producción, botón **Armar kit**: PT con receta, cantidad, almacén de cada componente (el predeterminado), almacén destino, N° de lote y vencimiento. Muestra el stock de cada componente. Crea la orden ya cerrada con su lote y consumos. Disponible para cualquier receta, no solo kits. |
| 5 — Lectores y documentación | Movimientos de inventario (el consumo de PT sale como `produccion_consumo`), exportador si aplica, CLAUDE.md y esquema. |
| 6 — Recorrido | Crear un kit de prueba (2 PT + 1 empaque), armarlo por orden normal y por armado rápido, intentar armar con stock insuficiente de un PT (bloqueado), intentar una receta circular (bloqueado), venderlo. |

## Fuera de alcance

- Desarmar kits (ajuste de inventario mientras tanto).
- Costeo de producción.
- Kit virtual que se descompone al vender.
