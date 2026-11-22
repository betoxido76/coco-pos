# Plan: presentaciones de compra, unidad base y costeo de insumos

Estado: **fase 1 aplicada en producción (2026-11-21)**, `presentaciones_insumos_fase1.sql`,
probada antes en BEGIN/ROLLBACK (21 casos: cuadre, errores, regresión Meraki, vistas
del exportador idénticas). **Fase 2 publicada (2026-11-21)**: sección
Presentaciones en Materias Primas / Empaques / Consumibles
(`src/components/PresentacionesInsumo.jsx`, `src/lib/presentaciones.js`) y
`fmtCosto` (`src/lib/costos.js`) en esos maestros e Inventario; RLS probada como
usuario de Daveyana y de Meraki. **Fase 3 aplicada (2026-11-21)**,
`presentaciones_insumos_fase3.sql`: OC, recepción, factura en CxP y devolución
por presentación; la recepción va por la RPC `registrar_recepcion` (una
transacción; valida que cada insumo sea de la empresa y que la línea de OC sea
del mismo insumo). Probada en BEGIN/ROLLBACK con datos de Meraki (libre,
contra OC, con presentación, factura por presentación, rechazos);
`app_version_minima` subida a 202611212058. La devolución revisa el stock antes
de guardar y deshace la ND si fallan las líneas o la salida. Falta el recorrido
de regresión en Meraki desde el navegador. **Fase 4 aplicada (2026-11-21)**,
`presentaciones_insumos_fase4.sql`: promedio móvil en `registrar_recepcion`,
ajuste por factura en `registrar_factura_recepcion`, anulación de recepción por
RPC (`anular_recepcion`, una transacción que revierte stock, OC, costo y estado),
último costo en ambas modalidades y `movimientos_inventario.costo_unitario` por
trigger (la entrada de una recepción y la salida de su anulación quedan al precio
de compra). Precio neto = sin IVA, con descuentos de línea y global. Solo MP,
empaques y consumibles: los PT comprados no cambian de costo. Con
`promedio_ponderado` no se ofrece "¿actualizar costos?" (OC ni factura). Probada
en BEGIN/ROLLBACK (recepción → factura → anulación vuelve al costo exacto; modo
último precio no mueve el promedio). Límite: el ajuste por factura de una
recepción hecha antes de activar el promedio corrige un valor que nunca entró al
promedio; activar antes de la primera compra. `promedio_ponderado` activo en
Daveyana desde 2026-11-22. **Fase 5 publicada (2026-11-22)**, solo pantalla: el
editor de recetas muestra la unidad del insumo (ya no se escribe; al guardar se
graba la del insumo; nada en la base lee `receta_items.unidad`) y Inventario →
Por almacén permite "Contar por presentación" en Ajuste y en Nuevo stock
(`ConteoPresentaciones`: n × presentación + suelto, total en unidad base y nota
"Conteo: …"); la unidad se ve en la tabla y los campos. La empresa demo "Empresa
de Cocos" tiene 9 líneas de receta en g con insumos en kg (cantidades
pensadas en g): no se tocaron. Fase 0 (decisiones del cliente) en curso. Primer cliente que lo usa: Daveyana (pastelería, alta
2026-11-21). Meraki no debe notar ningún cambio de comportamiento.

## Problema

Un mismo ingrediente se compra en distintas presentaciones (aceite de 1 L o de
2 L, leche condensada por lata, huevos por cartón) y se consume en recetas en
g / ml / unidad. Hace falta:

1. **Un solo stock por ingrediente**, se compre como se compre.
2. **Recetas que descuenten en la unidad de la cocina.**
3. **Un costo por g / ml confiable**, que refleje lo pagado en cada compra.

## Brechas del sistema actual (revisadas en código y base, 2026-11-21)

| # | Brecha | Dónde |
|---|---|---|
| 1 | Un insumo tiene una sola `unidad_medida`; OC y recepción guardan cantidad y precio en esa unidad, sin conversión. La alternativa (un SKU por presentación) parte el stock. | `materias_primas` / `materiales_empaque` / `consumibles`, `orden_compra_items`, `compra_items` |
| 2 | `costo_compra_promedio` **no es un promedio**: la recepción no lo toca. Solo cambia con el último precio, si el usuario acepta "actualizar costos" al crear la OC o al registrar la factura, o a mano en el maestro. | `Compras.jsx` (`aplicarActualizacionCostos`), `ModalFacturaRecepcion.jsx` |
| 3 | `costo_compra_promedio` es `numeric(12,4)`: un costo por gramo de fracciones de centavo pierde hasta ~7 %. Las pantallas lo muestran con `toFixed(2)` (todo costo < $0,01 se ve $0,00). Los inputs de precio usan `step="0.01"`. | 3 tablas de insumos; `MateriasPrimas.jsx`, `Consumibles.jsx`, `Inventario.jsx`, `Compras.jsx` |
| 4 | `receta_items.unidad` es decorativa: Producción consume en la `unidad_medida` del insumo. En Meraki hay 4 líneas cuya unidad escrita no coincide con la del insumo (sin daño: la cantidad se cargó pensando en la del insumo). | `Recetas.jsx`, `Produccion.jsx` |
| 5 | No hay costeo de recetas ni costo de lo producido (cerrar una orden no actualiza costos; ver `plan-kits.md` regla 5). | Recetas, Producción |
| 6 | No hay lotes ni vencimientos de insumos: `fecha_vencimiento` es un campo por insumo; `lotes_inventario_mp` existe pero ninguna pantalla la usa. | — |

## Enfoque

**SKU = ingrediente. Presentación = forma de comprarlo, con factor a la unidad base.**

```
Insumo "Aceite vegetal"        unidad base: ml
 ├─ Botella 1 L    factor 1.000
 ├─ Botella 2 L    factor 2.000
 └─ Garrafa 18 L   factor 18.000   (marca, proveedor y código de barras opcionales)
```

- **Unidad base**: la del stock y las recetas; se elige por cómo se mide en la
  cocina (si un líquido se pesa, su base es g y el factor de la botella va en g).
- Un insumo **sin presentaciones funciona exactamente como hoy**.
- Se descarta copiar la UM2 de productos terminados (`unidad_medida_2` +
  `factor_conversion_2`): admite una sola presentación alternativa. La regla de
  conversión sí es la misma de ventas: cantidad × factor = cantidad base, con
  candado en la base.
- No hay conversión peso ↔ volumen: cada insumo vive en una dimensión.

## Costeo

Configuración por empresa `empresas.costeo_insumos`:
`'ultimo_precio'` (default = comportamiento actual) | `'promedio_ponderado'`.

**Promedio móvil perpetuo** (sin ventana de tiempo: pondera el stock en mano;
la "memoria" la da la rotación de cada insumo):

```
costo nuevo = (stock antes × costo antes + cantidad × precio base) ÷ (stock antes + cantidad)
```

- Stock antes ≤ 0 → costo nuevo = precio de la compra.
- Las salidas (producción, merma, requisición, venta) no cambian el costo unitario.
- Recepción sin factura: promedia con el precio estimado; al registrar la
  factura se ajusta `(precio real − estimado) × cantidad ÷ stock actual` (si
  stock > 0).
- Anulación de recepción: reversión con la fórmula inversa; aproximada si ya se
  consumió parte (limitación conocida, documentada).
- Ajustes de entrada (sobrante de conteo): al costo vigente, sin cambiarlo.
- **Último costo** (`costo_ultima_compra` + fecha) se guarda siempre, en ambas
  modalidades: es el costo de reposición para precios y costeo de recetas.
- `movimientos_inventario.costo_unitario`: costo vigente en cada movimiento
  (kardex valorizado).

Con `'ultimo_precio'` todo sigue igual, incluida la pregunta "¿actualizar costos?".

## Cambios en base de datos (todos aditivos)

| Cambio | Detalle |
|---|---|
| `insumo_presentaciones` (nueva) | `empresa_id`, `tipo_insumo`, `insumo_id`, `nombre`, `factor > 0`, `marca`, `proveedor_id`, `codigo_barras`, `activa`. RLS por empresa + GRANT explícito. Único (insumo, nombre). |
| `orden_compra_items`, `compra_items`, `devolucion_proveedor_items` | `presentacion_id`, `presentacion_nombre` (foto), `factor` (foto), `cantidad_presentacion`, `precio_presentacion`. Todas NULL = línea como hoy. |
| Trigger de cuadre | Con presentación: `cantidad = cantidad_presentacion × factor` y `precio_unitario = precio_presentacion ÷ factor` (tolerancia de redondeo). Protege contra pestañas viejas. |
| Decimales | `costo_compra_promedio` → `numeric(18,8)` en las 3 tablas (ampliar no cambia valores). Recrear las vistas `v_export_*` que dependan de la columna en el mismo SQL. |
| Costeo | `empresas.costeo_insumos`, `costo_ultima_compra`, `fecha_ultima_compra` en las 3 tablas, `movimientos_inventario.costo_unitario`. |

## Garantías para Meraki y las demás empresas

1. Ninguna columna existente cambia de significado: `compra_items.cantidad` y
   `precio_unitario` siguen en la unidad del insumo para todos. Los lectores
   actuales (inventario, CxP, exportador, asistente, devoluciones) no se tocan.
2. La pantalla solo cambia si el insumo tiene presentaciones (Meraki: ninguna).
3. El costeo nuevo es opt-in (`costeo_insumos` queda en `'ultimo_precio'`).
4. Cambios visibles para todos, inofensivos: más decimales en costos (formato
   con los decimales necesarios; $0,25 se sigue viendo $0,25) y el editor de
   recetas muestra la unidad del insumo en vez de un campo libre.
5. RPC probadas con datos de Meraki en BEGIN/ROLLBACK. Recorrido de regresión
   en Meraki antes de anunciar: OC → recepción con y sin factura → factura en
   CxP → pago → devolución (ND) → producción → requisición → merma, comparando
   stock y costo antes/después.
6. Subir `app_version_minima` tras publicar las fases 3 y 4.

## Fases

| Fase | Contenido | Toca a Meraki |
|---|---|---|
| 0 — Decisiones | Respuestas de Daveyana al Excel de propuesta (unidad base g/ml, marcas intercambiables, semielaborados, presentaciones reales). | No |
| 1 — Base de datos | Tabla, columnas, trigger de cuadre, decimales, configuración, último costo. Pruebas en BEGIN/ROLLBACK. | Solo decimales |
| 2 — Maestros | Sección Presentaciones en MP / Empaques / Consumibles; helper de formato de costo (`fmtCosto`) y de cantidad (g→kg, ml→L) en `src/lib`. | Solo formato |
| 3 — Compras | OC, recepción (libre y contra OC; pendiente de la OC en base, mostrado en presentación), factura en CxP (`registrar_factura_recepcion`: precio por presentación, regla del 5 % por presentación), devolución a proveedor. **La recepción pasa a una RPC** (`registrar_recepcion`: compra + ítems + stock + OC + costo en una transacción) — cierra el ítem "Recepción no transaccional" del backlog; los anticipos siguen con su RPC. | No sin presentaciones; la RPC sí la usa Meraki → regresión |
| 4 — Costo promedio | Cálculo en la RPC de recepción, ajuste por factura y anulación, `costo_unitario` en movimientos, último costo. Activar `promedio_ponderado` en Daveyana. | No (opt-in) |
| 5 — Recetas e inventario | Editor de recetas con la unidad del insumo (fija `receta_items.unidad`); ajuste/conteo por presentación ("4 × Botella 2 L + 350 ml"). | Editor (mejora) |
| 6 — Costeo de recetas | Costo de cada receta con costo promedio y último costo, semielaborados en cascada; costo de lo producido al cerrar una orden (entrada del semielaborado/PT al costo de sus consumos). Reemplaza la hoja "Costos Fórmula" del cliente. | Pantalla nueva |
| 7 — Lotes y vencimientos | Lote del proveedor + vencimiento por recepción, consumo FEFO, trazabilidad lote → producción. **Plan propio**: toca el motor de inventario. | Por definir |
| Recorrido | Regresión en Meraki + recorrido completo en Daveyana. | — |

Orden: fases 1–5 antes de cargar los datos de Daveyana (cargar con una sola
unidad obligaría a migrar después); la 6 inmediatamente después; la 7 cuando
ya operen.

## Decisiones pendientes (Daveyana)

Ver la pestaña "Preguntas" del Excel de propuesta (fuera del repo). Las que
afectan el diseño:

- Unidad base g/ml (propuesto) o kg/L.
- Líquidos: ¿se pesan o se miden? Define la dimensión de cada insumo.
- Marcas intercambiables (azúcar morena, crema para batir, leche condensada).
- Semielaborados con receta y orden de producción; cuáles también se venden (PT).
- Lotes y vencimientos desde el inicio o en la fase 7.

## Fuera de alcance

- Conversión peso ↔ volumen por densidad.
- Costeo por almacén (el costo es por insumo, global).
- Métodos PEPS/UEPS: solo promedio móvil y último precio.
