# Plan — Exportador de datos del Dashboard

Estado: **Fase 1 desplegada (2026-10-03)**. Fases 2–3 pendientes de orden.
Fase por fase: cada una se despliega y se prueba antes de la siguiente.

Fase 1 — hecho: migraciones `exportador_fase1` (vistas `v_export_ventas`,
`v_export_ventas_lineas`, `v_export_ventas_detalle` y `venta_items.costo_unitario`)
y `exportador_fase1_indice_venta_items` (índice que faltaba en
`venta_items(venta_id)`: 0,7 s → 0,3 s). Verificado contra el Dashboard
(septiembre, Meraki): total por documento = total por línea = "Ventas totales"
= $42.763,86; cartera = $67.496,89 en ambos; con RLS un usuario de Meraki solo
ve Meraki. Pendiente: probar la descarga en el navegador.

## El requerimiento

El usuario descarga un archivo (XLSX, CSV o TXT) con los campos que elija,
cruzando varias tablas, para armar fuera del sistema sus propios análisis. Elige:

1. **Qué**: ventas, pedidos, cobros, cartera CxC, compras, pagos/CxP, gastos,
   movimientos de inventario.
2. **Detalle**: **por documento** (una fila por nota/pedido/recepción) o **por
   producto** (una fila por línea).
3. **Columnas**: de cualquier tabla relacionada (documento, cliente, vendedor,
   producto, categoría, dirección, cobranza…).
4. **Filtros**: los que estén marcados en el Dashboard.

No es un reporte en pantalla: es un exportador. Las tablas dinámicas las hace Excel.

## Decisiones (CERRADAS 2026-10-03)

| # | Decisión | Resultado |
|---|---|---|
| 1 | Qué documentos | Ventas, pedidos, cobros, cartera CxC, compras, **pagos/CxP**, gastos, movimientos de inventario |
| 2 | Dónde vive | **Solo en el Dashboard**, con sus filtros |
| 3 | Quién exporta | Cualquiera con acceso al Dashboard. A futuro podría exigir un permiso propio (ver "Permiso futuro") |
| 4 | Costo y margen | **Sí**, en el detalle de ventas (ver "Costo y margen") |
| 5 | Montos en el detalle por producto | Los montos son **de la línea**; los del documento (total, saldo) se marcan *"del documento, se repite por línea"* |
| 6 | IVA por línea | Reparto proporcional de la base de la línea; se avisa en el archivo que la suma puede diferir del IVA de la nota por céntimos (el oficial es el de la nota) |
| 7 | Filtro de producto en "por documento" | Se exportan los documentos que **contienen** el producto, con su total completo. Para ver solo el producto, usar "por producto" |

## Arquitectura

### Una vista por fuente (en la base de datos)

Cada combinación tipo × detalle es una **vista plana** con todo ya cruzado y
calculado. Por qué vistas y no cruces desde el navegador:

- **Los cálculos de negocio se hacen una sola vez** y coinciden con el sistema:
  saldo de una nota (igual que CxC), base/IVA por línea respetando
  `precio_incluye_iva` (`docs/plan-iva-base-imponible.md`), unidades primarias,
  vendedor (sale del pedido: `ventas` no tiene `vendedor_id`), canal (categoría
  nivel 1 del cliente), días vencida, montos en USD de cobros/pagos
  (`monto_usd + monto_bs / tasa`).
- **Seguridad**: `security_invoker = on` → aplican las mismas políticas RLS por
  empresa; además el frontend filtra `.eq('empresa_id', …)` como en todo el sistema.
- **Un campo nuevo** = tocar la vista y el catálogo, no la pantalla.
- La pantalla pide solo las columnas marcadas, con los filtros, paginando de a 1.000.

| Vista | Grano | Fase |
|---|---|---|
| `v_export_ventas` | Nota de entrega | 1 |
| `v_export_ventas_lineas` | Línea de nota | 1 |
| `v_export_pedidos` | Pedido | 2 |
| `v_export_pedidos_lineas` | Línea de pedido | 2 |
| `v_export_cobros` | Cobro (sin NC aplicadas como dinero; con columna que las identifica) | 2 |
| `v_export_cartera_cxc` | Nota pendiente/parcial con saldo y antigüedad | 2 |
| `v_export_compras` | Recepción | 3 |
| `v_export_compras_lineas` | Línea de recepción | 3 |
| `v_export_pagos_proveedor` | Pago a proveedor (filtra `anulado = false`; identifica aplicaciones de anticipo y ND) | 3 |
| `v_export_cartera_cxp` | Recepción pendiente/parcial con saldo, anticipos aplicados y vencimiento | 3 |
| `v_export_gastos` | Gasto (con abonos de `pagos`) | 3 |
| `v_export_movimientos` | Movimiento de inventario | 3 |

Reglas de las vistas (las mismas que ya rigen el sistema):
- Documentos anulados: columna `anulado` (sí/no) en vez de excluirlos, para que
  el usuario decida; por defecto la pantalla los excluye.
- Fechas de dinero = fecha real (`cobros.fecha_cobro`, `pagos_proveedor.fecha_pago`),
  en hora de Caracas, como Bancos/Finanzas.
- `pagos_proveedor`: siempre `anulado = false` en montos; las aplicaciones de
  anticipo y de ND no son salida de caja (columna `tipo_pago`).
- Embeds con 2 FKs a `usuarios`: resolver con la columna correcta (memoria del
  proyecto sobre embeds ambiguos).

### Catálogo de campos (frontend)

`src/lib/exportador/catalogo.js`: por fuente, la lista de campos agrupados
(*Documento, Cliente, Vendedor, Producto, Montos, Cobranza, Costo…*), cada uno con
`columna` de la vista, `etiqueta`, `tipo` (texto/número/moneda/fecha/sí-no),
`grupo`, `aviso` opcional ("del documento, se repite por línea") y si está
marcado por defecto. La pantalla se arma sola desde el catálogo.

### Pantalla

Botón **"Exportar datos"** en el Dashboard → panel lateral:

```
┌ Exportar datos ─────────────────────────────────────────┐
│ Qué:     (•) Ventas  ( ) Pedidos  ( ) Cobros  ( ) ...   │
│ Detalle: (•) Por documento   ( ) Por producto           │
│ Filtros del dashboard: 01/09–30/09 · Canal: Farmacias   │
│ ☐ Incluir anulados                                      │
│                                                         │
│ ▸ Documento  ☑ N° nota ☑ Fecha ☐ Vencimiento ☑ Estado   │
│ ▸ Cliente    ☑ Nombre  ☑ RIF   ☐ Canal  ☐ Dirección     │
│ ▸ Vendedor   ☐ Nombre                                   │
│ ▸ Montos     ☑ Base ☑ IVA ☑ Total ☑ Saldo               │
│                                                         │
│ [Marcar todo] [Limpiar]   Formato: XLSX ▾   [Descargar] │
│ ≈ 1.240 filas                                           │
└─────────────────────────────────────────────────────────┘
```

- Filtros del Dashboard que aplican a cada fuente: fechas (siempre), cliente,
  canal, vendedor, producto (donde tenga sentido; en compras/gastos se ignoran
  cliente/canal/vendedor y se avisa en el panel).
- La última selección de campos por fuente se recuerda en `localStorage`
  (conveniencia por usuario; las plantillas compartidas son la Fase 4).
- Conteo de filas antes de descargar (`count: 'exact', head: true`).

### Formatos

| Formato | Detalle |
|---|---|
| **XLSX** | Librería `xlsx` (ya en el proyecto, la usa CxC). Números como números, fechas como fechas, encabezado en negrita, filtro automático, columnas con ancho. Hoja 2 "Info": fuente, filtros aplicados, fecha/hora, usuario y los avisos (montos repetidos, IVA por línea, costo estimado). |
| **CSV** | Separador `;`, decimal con coma, UTF-8 con BOM: Excel en español lo abre con acentos y números bien. |
| **TXT** | Separado por tabulaciones, UTF-8. |

Nombre del archivo: `MiPOS_<fuente>_<detalle>_<desde>_<hasta>.<ext>`.

### Volumen

Meraki hoy: ~3.000 notas, ~6.000 líneas. Descarga paginada de 1.000 filas con
barra de progreso; el archivo se arma en el navegador. Holgado hasta ~100.000
filas. Si algún día no alcanza, se pasa a una Edge Function sin cambiar las vistas.

## Costo y margen (decisión 4)

Hoy **no existe costo histórico por venta**: solo `costo_promedio` actual del
producto. Propuesta:

- **Desde la Fase 1**, guardar la foto del costo al facturar: columna nueva
  `venta_items.costo_unitario` (costo promedio del producto en el momento, por
  unidad de venta), escrita por `src/lib/facturacion.js` y la venta retail.
- **Ventas anteriores**: se exportan con el costo promedio **actual**, marcado
  en la columna `costo_estimado = sí` y avisado en la hoja Info.
- Campos: costo unitario, costo de la línea, margen $ (base − costo), margen %.
  Solo en el detalle por producto; en "por documento", costo y margen sumados.
- Limitación conocida: el costo de los PT fabricados depende de lo que se cargue
  en `costo_promedio` (no hay costeo de producción); el margen es tan bueno como
  ese dato.

## Campos por fuente (Fase 1 — ventas)

**Por documento** (`v_export_ventas`): N° nota, fecha, hora, N° pedido, O/C
cliente, N° referencia, estado de cobro, anulada; cliente (código, nombre, RIF,
canal = cat. nivel 1, cat. 2–4, condición de pago, días de crédito,
contribuyente especial); dirección de entrega (nombre, texto, ciudad); vendedor;
emitida por; base gravada, base exenta, IVA, total, cobrado, saldo, NC
aplicadas; vencimiento, días vencida, estatus (pagado / al día / vencido);
unidades totales (primarias), cantidad de líneas; costo y margen (estimados
cuando aplique).

**Por producto** (`v_export_ventas_lineas`): todo lo anterior de documento
(marcado "del documento" en los montos) + SKU, producto, tipo de producto,
categoría del producto, unidad de venta, cantidad (unidad de venta), cantidad
primaria, precio base, descuento, base de la línea, aplica IVA, IVA de la línea
(prorrateado), total de la línea, costo unitario, costo de la línea, margen $,
margen %, costo estimado (sí/no).

Las fuentes de las fases 2 y 3 se detallan al arrancar cada una, con el mismo patrón.

## Fases

| Fase | Contenido | Prueba |
|---|---|---|
| **1** | Vistas de ventas (documento y línea) + `venta_items.costo_unitario` y su escritura al facturar + catálogo + panel + XLSX/CSV/TXT | El total exportado por documento = "Ventas totales" del Dashboard con los mismos filtros; la suma de líneas = suma de notas (± céntimos de IVA); saldo = CxC |
| **2** | Pedidos (documento y línea), cobros, cartera CxC | Totales de pedidos = encabezado `pedidos.total`; cartera = Total pendiente del Dashboard |
| **3** | Compras (documento y línea), pagos a proveedor, cartera CxP, gastos, movimientos de inventario | Cartera CxP = CxP; pagos sin anulados; movimientos = módulo Inventario |
| **4** (opcional) | Plantillas guardadas por usuario/empresa (tabla propia) y resumen agrupado (por producto/cliente/mes) | — |

Cada fase: un commit, migración con prueba en transacción (`BEGIN … ROLLBACK`)
y verificación contra las cifras que ya muestra el sistema.

## Permiso futuro (decisión 3)

Hoy basta el módulo `dashboard`. Si se quiere restringir: módulo nuevo
`exportar` en `modulos`, asignable por empresa/usuario como los demás
(CLAUDE.md §5). El botón se muestra solo con ese módulo. Es un cambio chico,
fuera de este plan.

## Fuera de alcance

- Reportes en pantalla nuevos (el análisis se hace en Excel).
- Exportar desde otros módulos (decisión 2).
- Envío programado por correo.
