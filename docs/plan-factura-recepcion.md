# Plan: registrar la factura de una recepción en CxP

Estado: **implementado** (fases 1–4, 2026-10-09). Falta la fase 5 (recorrido en navegador).

Decisiones finales: A, C y D como se proponen abajo. E cambió: REC-000054 SÍ tiene
factura; se corrige con "Corregir factura" (sin migración). Agregado al
implementar: tampoco se corrigen precios si hay una devolución (ND) vigente.

## Problema

Meraki recibe mercancía con una nota de entrega del proveedor (cantidades, sin
montos). La recepción pasa a CxP con los precios de la OC. Días después llega la
factura con pequeñas diferencias en los precios unitarios y hoy no hay forma de
cargarlas: el precio de la recepción queda fijo.

## Enfoque

Separar lo físico de lo financiero, como el *three-way match* de los ERP
(OC → recepción → factura):

- **La recepción** fija las **cantidades** y mueve el inventario. No cambia.
- **La factura** fija los **precios** y es lo que se paga. Se registra en
  **CxP**, sobre la recepción.

No se crea un módulo de facturas independiente (una factura para varias
recepciones, facturación parcial): eso va con la "CxP unificada" del backlog.
Este plan resuelve el caso diario sin cerrarle la puerta.

## Decisiones tomadas (2026-10-09)

| # | Decisión |
|---|---|
| 1 | Una recepción **sin factura no se puede pagar**: ni pagos, ni anticipos, ni NC, ni retenciones. |
| 2 | Tolerancia: **5 %** por línea entre el precio recibido y el facturado. |
| 3 | Registra la factura **quien tenga el módulo CxP**. |
| 4 | Las **cantidades no se tocan** en CxP: se validan al recibir. Una diferencia de cantidad se resuelve con devolución o NC de proveedor. |
| 5 | CxP puede **corregir los precios de cualquier recepción**, haya llegado con factura o sin ella: logística se equivoca aunque tenga la factura en la mano. Misma ventana, misma tolerancia y mismo registro. Solo mientras la recepción **no tenga abonos vigentes** (ver B). |

## Puntos a validar antes de aprobar

| # | Pregunta | Propuesta |
|---|---|---|
| A | ¿Qué pasa si una línea supera el 5 %? | Se puede registrar igual, pero la línea se marca en rojo y se exige un **motivo**, que queda guardado. Alternativa: exigir rol admin/finanzas (en Meraki todos son admin, así que en la práctica sería lo mismo). |
| B | ¿Hasta cuándo se pueden corregir los precios (decisión 5)? | Mientras la recepción **no tenga abonos vigentes** (pago, retención, NC o anticipo aplicado). Con abonos, el ajuste va por NC de proveedor o nota de débito. Un anticipo aplicado al recibir también bloquea: se anula su aplicación, se corrige y se vuelve a aplicar. |
| C | ¿Devolución al proveedor (ND) de una recepción sin factura? | **Bloquearla** hasta registrar la factura: la ND toma el precio de la línea y con el estimado saldría mal. |
| D | Vencimiento | Se cuenta desde la **fecha de la factura** + días de crédito de la recepción. Contado sin factura: vence el día que se registra la factura. |
| E | REC-000054 (Injaca, pendiente, sin N° de factura) | Pasarla a "pendiente de factura" en la migración: así Administración registra la factura real y se resuelve el descuadre de líneas vs. encabezado sin tocar la base a mano. |

## Modelo de datos

`compras`:

| Columna | Tipo | Uso |
|---|---|---|
| `estado_factura` | text `CHECK IN ('pendiente','registrada')`, **default `'registrada'`** | `pendiente` = llegó sin factura. El default mantiene el comportamiento de hoy para las recepciones existentes y para una versión vieja de la app en caché (CLAUDE.md §2). |
| `fecha_factura` | date | Fecha del documento del proveedor |
| `nro_nota_entrega` | text | N° de la nota de entrega del proveedor (opcional) |
| `factura_registrada_por` | uuid → usuarios | Quién la cargó en CxP |
| `factura_registrada_at` | timestamptz | Cuándo |
| `motivo_diferencia_factura` | text | Obligatorio si alguna línea pasa del 5 % |

`compras` ya tiene 2 FKs a `usuarios`; la tercera obliga a revisar los embeds
`usuarios(...)` sobre `compras` y ponerles hint (`usuarios!usuario_id`).

`compra_items`:

| Columna | Tipo | Uso |
|---|---|---|
| `precio_recepcion` | numeric(14,6) | Foto del precio estimado al recibir. Se llena solo al registrar la factura si el precio cambió. |

`nro_doc_proveedor` sigue siendo el N° de **factura**.

## Escritura

**RPC `registrar_factura_recepcion(p_compra_id, p_nro, p_fecha, p_items jsonb, p_motivo)`**
(`p_items = [{id, precio_unitario}]`). Sirve para registrar la factura de una
recepción que llegó sin ella **y** para corregir los precios de cualquier
recepción sin abonos (decisión 5):

1. Valida módulo `cxp`, empresa, que la recepción no esté anulada y que no
   tenga abonos vigentes (punto B).
2. Exige N° de factura y fecha. Las cantidades no se reciben como parámetro.
3. Por línea: guarda `precio_recepcion` (solo la primera vez: es el precio que
   cargó logística, y la tolerancia se mide siempre contra él), escribe el precio
   nuevo, la convención nueva (`precio_incluye_iva = false`) y recalcula
   `base_linea`.
4. Si alguna línea difiere más del 5 % y `p_motivo` está vacío → error.
5. Recalcula el encabezado (`subtotal`, `base_gravada`, `base_exenta`, `iva`,
   `total`) con la **misma fórmula de `src/lib/iva.js`** (IVA una sola vez sobre
   la base gravada total, `descuento_global` incluido). La Fase 1 compara la
   fórmula SQL contra `totalesDeItems` en todas las recepciones existentes antes
   de usarla.
6. `fecha_vencimiento_pago = p_fecha + dias_credito`; `estado_factura = 'registrada'`.

**Candados en la base** (una pestaña con la versión vieja no debe poder saltarlos):

- Trigger en `pagos_proveedor` (INSERT): rechaza el abono si la recepción
  tiene `estado_factura = 'pendiente'`. Cubre el pago normal, las aplicaciones
  de anticipo y de NC, y las retenciones, porque todas escriben ahí.
- `crear_nc_proveedor` con origen devolución rechaza una recepción pendiente
  de factura (punto C).

## Pantallas

**Compras → Nueva recepción**

- Nueva pregunta: **"¿Llegó con factura?"** Sí (como hoy) / No.
- Con "No": se pide el N° de nota de entrega (opcional), los precios vienen de
  la OC y se rotulan como *estimados*, no se aplican anticipos y la de contado
  no abre la ventana de pago (no se puede pagar todavía).

**CxP → Compras**

- Etiqueta **"Sin factura"** en la fila y filtro por ese estado.
- Los KPI separan el monto estimado pendiente de factura.
- **Ver recepción** → botón **"Registrar factura"** (sin factura) o
  **"Corregir factura"** (con factura y sin abonos). Es la misma ventana:
  - N° y fecha de factura.
  - Por línea: cantidad (solo lectura), precio recibido, **precio factura**
    (editable, precargado), diferencia %, en rojo si pasa del 5 %.
  - Totales en vivo con `src/lib/iva.js`. Si el total cambia, se muestra
    "Antes $X → Ahora $Y".
  - Motivo, obligatorio solo si hay líneas fuera de tolerancia.
  - Casilla "Actualizar costos en catálogo" con los precios de la factura
    (reutiliza lo que ya hace la recepción).
- **Pagar** en una recepción sin factura: la ventana única de pago
  (`ModalPagoObligacion`) recibe `bloqueo = "Registra la factura antes de pagar"`.

**Compras → detalle de recepción**: muestra el estado de la factura y, si hubo
cambios, el precio recibido junto al facturado.

## Fases

| Fase | Contenido |
|---|---|
| 1 — Base de datos | Columnas, RPC, trigger, chequeo en `crear_nc_proveedor`, hints de embeds. Pruebas en BEGIN/ROLLBACK, incluida la comparación de la fórmula con `iva.js`. Migración de REC-000054 (punto E). |
| 2 — Recepción | Pregunta "¿Llegó con factura?", precios estimados, sin anticipos ni pago en el acto. |
| 3 — CxP | Etiqueta, filtro, KPI, ventana "Registrar factura", bloqueo del pago. |
| 4 — Lectores y documentación | Detalle de recepción en Compras, exportador (`v_export_compras` + catálogo: `estado_factura`, `fecha_factura`), CLAUDE.md §7 y `docs/claude-schema.md`. |
| 5 — Recorrido | Recepción sin factura → intento de pago (bloqueado) → registrar factura dentro del 5 % → otra fuera del 5 % → pagar con retención → corregir precios de una recepción que llegó con factura → intento de corregir una con abonos (bloqueado). |

## Fuera de alcance

- Una factura que cubra varias recepciones, o una recepción facturada en partes
  (CxP unificada).
- Nota de débito del proveedor (cuando el proveedor sube el precio después de
  pagado). Hoy solo existe la NC de proveedor.
- Valorización del inventario: los movimientos no guardan costo; el ajuste de
  costo se hace en el catálogo con la casilla de la ventana.
