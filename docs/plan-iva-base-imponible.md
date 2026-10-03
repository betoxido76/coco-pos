# Plan — Precios sin IVA (base imponible) en todo el sistema

Estado: **fases 1–4 aplicadas y desplegadas (2026-10-02)**; fase 5 (corte) con
pendientes del cliente, ver abajo. Commits: fase 1 `4171001`, fase 2 `ec2fca0`,
fase 3 `56c651a`, fase 4 `0301f75`.

## El cambio

| | Hoy | Después |
|---|---|---|
| Precio de lista / precio escrito en una línea | Trae el IVA **incluido** (si el producto lo aplica) | Es la **base imponible** |
| IVA del documento | Se **extrae**: `precio / 1,16` y la diferencia es IVA | Se **suma**: `base gravada × 16 %` |
| Ejemplo, producto gravado de lista $116 | $100 base + $16 IVA = **$116** | $116 base + $18,56 IVA = **$134,56** |
| Costo de insumos | Cargado con IVA (Inventario lo divide entre 1,16 al valorar) | Costo **sin IVA** |

Aplica a ventas (pedidos de oficina y de la app del vendedor, notas de entrega,
venta retail, notas de crédito) y a compras (OC, recepciones, notas de débito).
Es **global**: no hay interruptor por empresa (ver decisión 0.1).

## Principio de diseño: el documento emitido no se recalcula

Mismo criterio que SAP, Odoo y Dynamics:

- Cada línea guarda la **foto** de cómo se calculó: precio, base, si aplica IVA,
  alícuota y bajo qué convención estaba el precio.
- El encabezado guarda **base gravada, base exenta, IVA y total**. El IVA se
  guarda **una sola vez**, en el encabezado, calculado sobre la base gravada
  total (no sumando IVA por línea): nunca hay dos cifras de IVA que puedan
  diferir por un céntimo.
- Factura (nota de entrega), NC, recepción y ND **nunca se recalculan**. Un
  cambio de ley o de catálogo solo afecta documentos nuevos.
- Los pedidos se reevalúan con el catálogo vigente **mientras no se facturen**;
  al facturar, el IVA queda fijo.
- Las listas y reportes leen los totales guardados en el encabezado, no
  recalculan desde las líneas (además, es más rápido: un número por documento).

## Fase 0 — Decisiones (CERRADA 2026-10-02)

| # | Decisión | Resultado |
|---|---|---|
| 0.1 | ¿Por empresa o global? | **Global**. Super Frenos Chaguaramos tenía 9 productos con IVA que en realidad son exentos: **ya corregidos a exento (2026-10-02)**. Super Frenos Los Chorros (no operativo) conserva 7 productos con IVA: se deja así; si se reactiva, revisar esos 7 |
| 0.2 | Redondeo del IVA | **Sobre la base gravada total del documento**: `iva = round2(base_gravada × 0,16)` |
| 0.3 | Qué se guarda | **Línea**: precio sin IVA, cantidad, descuento, base de la línea, `aplica_iva`, alícuota. **Encabezado**: base gravada, base exenta, IVA, total |
| 0.4 | App del vendedor | Igual que el resto del sistema: precios base, IVA aparte. Sin lógica propia |
| 0.5 | Precio escrito a mano (NC manual, edición de líneas) | Es la **base** |
| 0.6 | IVA de un pedido | Se evalúa con el **catálogo vigente al facturar** (estándar). Una vez facturado queda fijo |
| 0.7 | Costos de insumos | **Alternativa A** (ver Fase 4): convertir ÷ 1,16 los 58 con IVA incluido o sin evidencia, mantener Agua Potable, corregir Botas PVC y Envase PET 1500 ml con su evidencia |

## Modelo de datos

### Líneas

| Tabla | Hoy | Se agrega |
|---|---|---|
| `pedido_items` | `precio_unitario`, `subtotal` (cant × precio, IVA embebido), `aplica_iva` | `precio_incluye_iva`, `iva_pct` (la base de la línea es `subtotal`; la del encabezado la calcula la base de datos) |
| `venta_items` | `precio_unitario`, `aplica_iva` | `precio_incluye_iva`, `iva_pct`, `base_linea` |
| `compra_items` | `precio_unitario` (con IVA), `descuento_item`. **Sin `aplica_iva`** | `aplica_iva`, `precio_incluye_iva`, `iva_pct`, `base_linea` |
| `orden_compra_items` | `precio_unitario_esperado` (**ya sin IVA**). Sin `aplica_iva`: el detalle lo lee del catálogo actual | `aplica_iva`, `iva_pct` (el precio no cambia de convención) |
| `devolucion_items` | `precio_unitario`, `aplica_iva` | `precio_incluye_iva`, `iva_pct` |
| `solicitud_devolucion_items` | `precio_unitario`, `aplica_iva` | `precio_incluye_iva`, `iva_pct` |
| `devolucion_proveedor_items` | `precio_unitario` | `aplica_iva`, `precio_incluye_iva`, `iva_pct` |

- `precio_incluye_iva boolean NOT NULL DEFAULT true`: todas las filas
  existentes quedan marcadas con la convención vieja. **El default se queda en
  `true` para siempre**: la app nueva escribe `false` explícitamente, y una
  versión vieja en caché (PWA) que inserte sin la columna queda marcada con la
  convención que realmente usó. **Es lo que impide que el pasado se reescriba**: cualquier
  pantalla que lea una línea vieja sabe que su precio traía el IVA.
- `iva_pct numeric(5,2)`: 16 o 0. Backfill: `aplica_iva ? 16 : 0`.
- `base_linea numeric(14,4)`: cantidad × precio × (1 − desc) en base. Backfill
  informativo para las líneas viejas (precio ÷ 1,16 si gravada); los totales
  oficiales siguen siendo los del encabezado.
- Por qué no convertir los precios viejos a base: `precio_unitario` es
  `numeric(12,2)` y 39,90 / 1,16 = 34,3965… → al redondear, los totales dejan de
  cuadrar por céntimos, y se alterarían documentos ya entregados.
- `pedido_items.subtotal` pasa a ser la **base** de la línea (= `base_linea`). La
  app del vendedor deja de sumarlo como total: lee el encabezado del pedido.
- Unidades: `base_linea` usa la cantidad en **unidad de venta** (con UM2, lo
  alistado ÷ factor), igual que el subtotal de hoy.

### Encabezados

| Tabla | Hoy | Se agrega |
|---|---|---|
| `pedidos` | **Nada** (el total se recalcula en cada pantalla) | `base_gravada`, `base_exenta`, `iva`, `total` |
| `ventas` | `subtotal`, `total`, `impuesto_pct` | `base_gravada`, `base_exenta`, `iva` (`subtotal` = gravada + exenta, como hoy) |
| `compras` | `subtotal`, `total` | `base_gravada`, `base_exenta`, `iva` |
| `ordenes_compra` | `subtotal`, `total` | `base_gravada`, `base_exenta`, `iva` |
| `devoluciones` (NC) | `subtotal`, `iva`, `monto_devuelto` | `base_gravada`, `base_exenta` |
| `devoluciones_proveedor` (ND) | `monto_total` | `subtotal`, `iva`, `base_gravada`, `base_exenta` |

Backfill de encabezados históricos: `subtotal` y `total` guardados mandan;
`iva = total − subtotal`; la partición gravada/exenta sale de las líneas. Para
`pedidos`: los facturados toman los montos de su nota de entrega; los abiertos y
los anulados se calculan desde sus líneas con la convención vieja.

### Fórmula única

```
base_linea   = cantidad_venta × precio_base × (1 − desc_item)
               precio_base = precio_incluye_iva && aplica_iva ? precio / 1,16 : precio
base_gravada = round2( Σ base_linea gravadas × (1 − desc_global) )
base_exenta  = round2( Σ base_linea exentas  × (1 − desc_global) )
iva          = round2( base_gravada × iva_pct / 100 )
total        = base_gravada + base_exenta + iva
```

- **JS**: un solo módulo, `src/lib/iva.js` (se amplía el que ya existe con
  `itemAplicaIva`): `precioBase(item)`, `baseLinea(item, cantidad)`,
  `totalesDocumento(lineas, descGlobal)`, `IVA_PCT`. **Ningún módulo vuelve a
  escribir `/ 1.16` ni `* 0.16`.**
- **SQL**: `recalcular_totales_pedido(pedido_id)`, la misma fórmula, llamada por
  un trigger sobre `pedido_items` (alta, edición, baja, alistamiento). El
  encabezado del pedido queda correcto lo escriba quien lo escriba: la app,
  la cola offline, la edición en Pedidos o Despacho.
- Al **facturar** se reevalúa `aplica_iva` contra el catálogo vigente, se
  recalcula y se congela en la nota de entrega (decisión 0.6).

## Fases

### Fase 1 — Cimientos (sin cambio visible)

- Migración: columnas nuevas con `precio_incluye_iva DEFAULT true`, backfill de
  `iva_pct`, `base_linea` y encabezados; trigger de totales del pedido.
- `src/lib/iva.js` con la fórmula única + casos de prueba: línea gravada, exenta,
  mixta, con descuento por ítem y global, UM2 alistada, precio con IVA (viejo) y
  base (nuevo).
- Verificación: para todas las ventas, compras, OC y NC existentes, los totales
  recalculados con el helper coinciden con los guardados (tolerancia de
  céntimos documentada caso por caso).
- Se puede desplegar sin aviso: con el default en `true`, nada cambia.
- **Aplicada 2026-10-02** (migración `iva_base_imponible_fase1`). Verificado:
  encabezados de ventas, compras, OC, NC, ND y pedidos sin vacíos ni negativos
  y base + IVA = total en todos; los 96 pedidos abiertos dan el mismo total que
  las pantallas actuales (máx. 1 céntimo). Los encabezados históricos se
  repartieron desde los montos guardados (IVA = total − subtotal); las 502
  ventas migradas de Los Chorros (subtotal 0) se repartieron con sus líneas.

### Fase 2 — Lado ventas

Todos pasan por `iva.js` y leen los encabezados:

| Módulo | Qué cambia |
|---|---|
| `Ventas.jsx` → Facturar pedido | Reevalúa IVA con el catálogo, totales con el helper, congela líneas y encabezado |
| `Ventas.jsx` → Venta retail | Totales, `precio_venta` se lee y se actualiza como base |
| `Ventas.jsx` → detalle e impresión de la nota | Base por línea con su convención; totales del encabezado |
| `Ventas.jsx` / `Despacho.jsx` → devoluciones y autorización de SDR | La NC hereda `precio_incluye_iva` e `iva_pct` de la línea original |
| `Pedidos.jsx` | Detalle, edición (precio editable = base), convertir en factura, listado |
| `Despacho.jsx` | `TotalPedido` (hoy hace una consulta por fila) → lee el encabezado; detalle e impresión |
| `NuevoPedido.jsx` | Totales, límite de crédito, listas (inicio, historial, ficha) desde el encabezado |
| `lib/notasCredito.js`, `NotasCredito.jsx`, `CuentasCobrar.jsx` | `baseDeLinea` respeta la convención; NC manual en base |
| `Dashboard.jsx`, `DashboardResumen.jsx` | Facturación por línea vía helper (no mezclar convenciones) |
| `Productos.jsx`, `ListasPrecios.jsx`, `MateriasPrimas.jsx`, `Consumibles.jsx` | Etiquetas "sin IVA" en precio y costo. `CargaDatos.jsx` NO se tocó: su encabezado es la plantilla de importación |

**App del vendedor — caché y cola offline:**
- Nueva versión de las claves de caché de productos (`mipos_productos_v2_…`):
  al actualizar, se descartan los precios cacheados con la convención vieja.
- Cola offline: los pedidos nuevos llevan `precio_incluye_iva: false` en cada
  línea (`camposIvaLinea`); los que quedaron en cola antes del cambio no traen
  la columna y la base de datos los marca `true` (default). No hizo falta una
  marca aparte.
- Facturar un pedido quedó en un solo módulo, `src/lib/facturacion.js`, usado
  por Pedidos y Ventas (antes eran dos implementaciones distintas).
- De paso: el paso 3 de la app fallaba con descuento global (variable
  `totalConIVA` inexistente). Arreglado.
- Verificado con un flujo completo en la base (con rollback): pedido con línea
  gravada nueva + exenta → alistado parcial → nota → los totales del pedido
  siguen cada paso y al facturar copian los de la nota.

### Fase 3 — Lado compras

| Módulo | Qué cambia |
|---|---|
| `Compras.jsx` → Nueva / Editar OC | El precio que se escribe es base: se elimina `precioConIvaOC` y la división al guardar (la OC ya guardaba base) |
| `Compras.jsx` → Detalle OC | `aplica_iva` de la línea, no del catálogo actual |
| `Compras.jsx` → Nueva recepción | Precio base (contra OC: el de la OC tal cual); guarda `aplica_iva` y convención |
| `Compras.jsx` → "Actualizar costos" | Escribe base |
| `Compras.jsx` → Devolución a proveedor (ND) | Base + IVA desglosado |
| `CuentasPagar.jsx` → detalle de recepción | Base por línea con su convención; totales del encabezado |
| `ModalPagoCompra`, CxP, anticipos | Sin cambio: trabajan sobre `compras.total`, que sigue siendo el total a pagar |

### Fase 4 — Costos (alternativa A)

Script aplicado en el corte (Meraki):

| Grupo | Insumos | Acción |
|---|---|---|
| Con evidencia de IVA incluido (OC × 1,16 o recepción) | 32 | `costo ÷ 1,16` |
| Sin evidencia (24 sin compras en el sistema, 2 sin coincidencia) | 26 | `costo ÷ 1,16` |
| Agua Potable (ya era base) | 1 | Se mantiene |
| Botas PVC ($2.038, error de carga) | 1 | → **$17,57** (recepción $20,38 ÷ 1,16) |
| Envase PET 1500 ml ($0,0267) | 1 | → **$0,25** (su OC) |
| Cuñete 20 lt (sin costo) | 1 | Sin cambio |
| PT con IVA (10029, GALL) — `costo_promedio` | 2 | `costo ÷ 1,16` (Inventario hoy también los divide) |

- **Aplicada 2026-10-02** (migración `iva_base_imponible_fase4_costos`):
  21 consumibles + 36 empaques + 1 MP convertidos, Agua Potable sin cambio,
  Botas PVC 2.038 → 17,569, Envase PET 1500 ml 0,0267 → 0,25, Cuñete sin
  costo; los 2 PT con IVA convertidos.
- `costo_compra_promedio` es `numeric(12,4)`: sin problema de redondeo.
- Respaldo previo en tabla `backup_costos_iva_20261002` (RLS sin políticas).
- `Inventario.jsx` deja de dividir entre 1,16. Resultado: el valor que muestra
  Inventario **no cambia** para los insumos convertidos.
- Mermas y requisiciones nuevas pasan a valorarse sin IVA; las ya registradas
  conservan su costo congelado (escalón de 16 % esperado en reportes que crucen
  el corte, en esos insumos).
- Ningún total de documento cambia: el costo no entra en ningún total.
- Excel de respaldo: `Meraki_Costos_Insumos_IVA.xlsx` (raíz, fuera de git). Se
  entrega al usuario como registro; lo que marque en las columnas azules se
  ajusta a mano.

### Fase 5 — Corte coordinado (Meraki)

Estado al 2026-10-02: pasos 2 y 3 hechos. **Pendientes del cliente: 1, 4 y 5.**

1. Avisar a la fuerza de ventas: sincronizar pedidos pendientes y no tomar
   pedidos durante la ventana.
2. Desplegar Fases 2–3 (push). El default de `precio_incluye_iva` NO cambia
   (ver Modelo de datos).
3. Aplicar el script de costos (Fase 4).
4. Listas de precio de los 2 PT con IVA, **en el mismo momento**. Valores
   actuales:

   | SKU | Producto | `precio_venta` | Listas |
   |---|---|---|---|
   | 10029 | Cocobufito Tina 250g | 4,00 | LR01 = 4,00 · LBB Transformadores = 4,00 · DTC = 4,00 |
   | GALL | Galleta coco rallado y chocolate blanco | 2,00 | LR01 = **2,32** · DTC = 2,00 |

   Confirmar con el cliente el precio base de cada lista (GALL tiene dos valores
   distintos: 2,32 = 2,00 × 1,16, ¿una de las listas ya está en base?). Si el
   cliente lo prefiere, se cargan por script.
5. Prueba en producción: un pedido con una línea gravada y una exenta, por la
   app y por oficina → alistar → facturar → NC parcial; una OC con insumo
   gravado → recepción. Verificar base, IVA y total en cada pantalla y en la
   impresión.

## Qué cuidar

- **El cliente NO debe cambiar las listas antes del corte**: con el sistema
  actual, un precio base se interpreta como "con IVA" y esos productos se
  facturan 13,8 % por debajo.
- Pedidos abiertos al corte (Meraki: 14, **ninguno con líneas gravadas** al
  2026-10-02): conservan `precio_incluye_iva = true`; al facturarse se respeta
  esa convención y solo se reevalúa si aplica IVA.
- OC abiertas al corte (4): ya guardan base; la recepción toma ese precio tal
  cual con la pantalla nueva.
- Notas pendientes de cobro (151 con IVA en Meraki): total guardado, CxC no
  cambia; una NC contra ellas hereda la convención de la línea original.
- Super Frenos Los Chorros (no operativo, 7 PT con IVA): si se reactiva, sus
  precios de esos 7 se leerán como base.
- Empresa de Cocos y Cocos Altamira (demo/sin actividad desde mayo-junio):
  tienen MP/ME/PT con IVA; no se convierten sus costos.
- Reportes que comparen periodos alrededor del corte: los precios de lista de
  productos gravados cambian de significado. La facturación (total con IVA) y la
  base son comparables; el "precio unitario" no.

## Fuera de alcance

- Otras alícuotas (8 %, 31 %): el modelo las soporta con `iva_pct`, pero la UI
  sigue con 16 % / exento.
- Retenciones de IVA (contribuyente especial): se mantiene lo actual.
- Libro de ventas/compras fiscal.
