# Plan — Retenciones de IVA e ISLR que nos hacen los clientes (CxC)

Aprobado e implementado 2026-10-16 (fases 1-7). Meraki configurada: IVA 100 %,
ISLR 0. Falta el recorrido en navegador (backlog de CLAUDE.md). Es el espejo en CxC de
`docs/plan-retenciones.md` (CxP): allá la empresa retiene al proveedor; aquí el
**cliente contribuyente especial** le retiene a la empresa. Primer cliente: Meraki.

## Objetivo

Que CxC muestre lo que de verdad se le va a cobrar al cliente (total − retención)
y que la retención quede registrada como **abono sin dinero** a la factura, con el
N° del comprobante que entrega el cliente, para cuadrar con la declaración de IVA.

## Diferencias con CxP

| Tema | CxP (ya existe) | CxC (este plan) |
|---|---|---|
| Quién retiene | La empresa, al pagar | El cliente, al pagarnos |
| % | Por proveedor | **Por empresa** (un % de IVA y uno de ISLR) |
| Cuándo aplica | Proveedor marcado `retiene_iva/islr` | Cliente con `contribuyente_especial = true` |
| Comprobante | Lo emite la empresa (Galac) | Lo emite el cliente: se guarda su N° |

## Decisiones propuestas

| Tema | Propuesta |
|---|---|
| Configuración | Administración → Tasas de cambio / Configuración: `% retención IVA de clientes` y `% retención ISLR de clientes` (Meraki: 100 y 0). En blanco o 0 = no aplica. Independiente de "Agente de retención" (eso es CxP) |
| Cálculo | IVA = IVA de la nota × % · ISLR = base imponible (gravada + exenta) × %. Igual que en CxP, con los montos guardados de la nota (`totalesGuardados`) |
| Cuándo | Al cobrar: la ventana de cobro muestra el bloque "Retenciones" ya marcado si el cliente es contribuyente especial. Se puede desmarcar (p. ej. el comprobante aún no llegó) y registrar después desde la misma ventana, aunque ya no haya dinero que cobrar |
| N° de comprobante | Se pide al registrar (opcional pero recomendado); va en `retenciones.numero_comprobante` |
| % congelado | El % se guarda en cada retención: cambiar la configuración no reescribe las ya registradas |
| Registro | `retenciones` con `origen_tipo = 'venta'` + `cliente_id`, y una fila en `cobros` con `retencion_id`, **sin cuenta bancaria** (como la aplicación de una NC). Escritura solo por RPC; un trigger impide escribir `retencion_id` fuera de ella |
| Estado de la nota | `pagado` cuando cobros en dinero + NCs + retenciones registradas cubren el total |
| Tabla CxC | Total · **Retenciones** · Cobrado · Saldo. Retenciones = registradas + por registrar (estimada con el % actual, en gris/itálica). Saldo = Total − Retenciones − Cobrado |
| KPIs CxC | "Total pendiente", vencido y por vencer pasan a ser netos de la retención por registrar |
| Cobro múltiple | Cada nota calcula su retención; el monto exacto a cubrir = Σ (total − retención) |
| Notas viejas | Las notas abiertas de clientes contribuyentes especiales también retienen al cobrarlas (Meraki hoy: 295 notas abiertas, $330,74 de IVA). Las ya pagadas no se tocan |
| Anulación | `anular_retencion` (admin/finanzas) anula la retención, borra su fila en `cobros` y recalcula el estado. `anular_nota_no_despachada` también anula las retenciones de la nota |

## Lectores a ajustar

- **Finanzas**: hoy suma todo cobro sin NC como ingreso → excluir `retencion_id`.
- **Bancos**: ya filtra por cuenta bancaria; la retención no tiene cuenta. Sin cambio.
- **Exportador** (`v_export_cobros`): columna `es_retencion`; el equivalente USD
  sigue sumando al saldo pero no es caja.
- **Dashboard / DashboardResumen / Estado de cuenta / NuevoPedido**: cuentan la
  retención como abono (correcto para el saldo). En el historial de cobros de
  NuevoPedido se rotula "Retención IVA".
- **PanelRetenciones** (CxP): filtrar `origen_tipo IN ('compra','gasto')`.

## Fases

1. **Base de datos** — columnas de % en `empresas`; `retenciones.cliente_id` y
   `origen_tipo 'venta'`; `cobros.retencion_id` + trigger; RPC
   `registrar_retenciones_venta` (calcula en el servidor y recalcula
   `estado_cobro`), `anular_retencion` extendida, `anular_nota_no_despachada`.
   Prueba con BEGIN/ROLLBACK.
2. **Configuración** — los dos % en Administración.
3. **Ventana de cobro** — bloque Retenciones en cobro individual y múltiple, con
   N° de comprobante; "Saldo a cobrar" = saldo − retención.
4. **Tabla y KPIs de CxC** — columna Retenciones, saldo y KPIs netos; aviso
   "comprobante pendiente" cuando el dinero ya cubrió y falta la retención.
5. **Lectores** — Finanzas, exportador, NuevoPedido, PanelRetenciones.
6. **Reporte** — CxC → pestaña Retenciones: recibidas por período, N° de
   comprobante, Excel y anulación (reutiliza `PanelRetenciones`).
7. **Documentación** — CLAUDE.md, esquema, backlog (recorrido en producción).

## Respuestas (2026-10-16)

1. **Contado**: no hay cobro al facturar en el flujo de pedidos (manufactura).
   Desde el 2026-10-05 la nota de contado va a CxC con vencimiento hoy
   (`Pedidos.jsx` y Ventas → pedidos por facturar), y en Meraki no hay ventas
   cobradas al facturar desde esa semana. Entra en el flujo normal de CxC.
   Excepción: la **venta directa retail** (Ventas → nueva venta, Super Frenos)
   todavía cobra en el acto. Queda fuera: esas empresas no configuran el %, y si
   algún día lo hacen, esa venta de contado a un contribuyente especial se manda
   a CxC en vez de cobrarse en el acto.
2. N° de comprobante: **opcional**; la lista marca las que no lo tienen.
3. Pestaña CxC → Retenciones: **entra ahora** (fase 6).
